# Cloudflare Worker inbound webhook relay

The existing Worker currently proxies outbound Telegram Bot API calls only.
Add this route inside its `fetch(request, env)` handler **after the health check
and before the generic `request.method !== "POST"` check and outbound
`X-Roniya-Proxy-Key` authentication**.

This route uses a dedicated public path, `/telegram-webhook`, and never accepts
a destination URL from the caller. It forwards only to the fixed backend URL
configured in the Worker environment.

```js
// Telegram -> Cloudflare Worker -> Roniya backend webhook.
// Keep this before the outbound proxy authentication and bot-method matcher.
if (request.method === "POST" && url.pathname === "/telegram-webhook") {
  const backendUrl = String(env.TELEGRAM_WEBHOOK_BACKEND_URL || "").trim();
  const relaySecret = String(env.TELEGRAM_WEBHOOK_RELAY_SECRET || "");
  const telegramSecret = request.headers.get("X-Telegram-Bot-Api-Secret-Token") || "";
  const contentType = request.headers.get("Content-Type") || "";

  if (!backendUrl || !relaySecret || !telegramSecret) {
    log("webhook_relay_not_configured");
    return response("Webhook relay is not configured", 503);
  }

  let target;
  try {
    target = new URL(backendUrl);
  } catch (_) {
    log("webhook_backend_url_invalid");
    return response("Webhook backend URL is invalid", 500);
  }

  if (
    target.protocol !== "https:" ||
    target.username ||
    target.password ||
    target.search ||
    target.hash
  ) {
    log("webhook_backend_url_rejected");
    return response("Webhook backend URL must be a fixed HTTPS URL", 500);
  }

  const mediaType = contentType.split(";")[0].trim().toLowerCase();
  if (mediaType !== "application/json") {
    return response("Webhook requires application/json", 415);
  }

  const maxWebhookBytes = 1 * 1024 * 1024;
  const declaredLength = Number(request.headers.get("Content-Length") || 0);
  if (declaredLength > maxWebhookBytes) {
    return response("Webhook body too large", 413);
  }

  let body;
  try {
    body = await request.arrayBuffer();
  } catch (_) {
    log("webhook_body_read_failed");
    return response("Unable to read webhook body", 400);
  }

  if (!body.byteLength) return response("Empty webhook body", 400);
  if (body.byteLength > maxWebhookBytes) {
    return response("Webhook body too large", 413);
  }

  const relayHeaders = new Headers({
    "Content-Type": "application/json",
    "X-Telegram-Bot-Api-Secret-Token": telegramSecret,
    "X-Roniya-Webhook-Relay-Key": relaySecret,
  });

  const relayController = new AbortController();
  const relayTimeoutId = setTimeout(() => relayController.abort(), 15000);

  try {
    const backendResponse = await fetch(target.toString(), {
      method: "POST",
      headers: relayHeaders,
      body,
      signal: relayController.signal,
      redirect: "manual",
    });

    log("webhook_relay_response", {
      status: backendResponse.status,
      ok: backendResponse.ok,
      bodyBytes: body.byteLength,
      durationMs: Date.now() - startedAt,
    });

    return response(backendResponse.body, backendResponse.status, {
      "Content-Type":
        backendResponse.headers.get("Content-Type") ||
        "application/json; charset=utf-8",
    });
  } catch (error) {
    log("webhook_relay_failed", {
      errorName: error?.name || "UnknownError",
      durationMs: Date.now() - startedAt,
    });
    return response("Backend webhook unavailable", 502);
  } finally {
    clearTimeout(relayTimeoutId);
  }
}
```

## Worker environment variables

Set these as Worker secrets/variables (not in frontend code):

- `TELEGRAM_WEBHOOK_BACKEND_URL`: the fixed HTTPS backend URL, for example
  `https://YOUR-RONIYA-DOMAIN/api/v1/telegram-referrals/webhook`.
- `TELEGRAM_WEBHOOK_RELAY_SECRET`: a high-entropy secret, different from
  `PROXY_SECRET` and `TELEGRAM_WEBHOOK_SECRET`.

Set the same `TELEGRAM_WEBHOOK_RELAY_SECRET` on the backend. Keep
`TELEGRAM_WEBHOOK_SECRET` only in the backend and Telegram webhook
configuration. Telegram sends that value in
`X-Telegram-Bot-Api-Secret-Token`; the Worker forwards it unchanged.

Configure Telegram's webhook URL as:

`https://roniya-telegram-bridge.reza-ghasemi8664.workers.dev/telegram-webhook`

with `allowed_updates=["chat_member"]` and the exact backend
`TELEGRAM_WEBHOOK_SECRET` as Telegram's `secret_token`.

## Backend activation gate

The backend now requires all of the following before the profile API reports
referral tracking as active:

- `TELEGRAM_REFERRAL_TRACKING_ENABLED=true`
- `TELEGRAM_WEBHOOK_SECRET`
- `TELEGRAM_WEBHOOK_RELAY_SECRET`
- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_CHANNEL_ID`

The backend webhook rejects requests when the relay secret is missing; the
Worker must forward both Telegram's secret-token header and the relay-key
header. Keep the tracking switch false until the Worker relay is deployed and
Telegram's webhook is registered and verified.

If a delayed Telegram event changes which member historically completed an
already-rewarded 20-member boundary, the backend records the update as
`RECONCILE`, pauses further automatic milestone grants for that inviter, and
exposes `reconciliationRequired=true` in the profile stats. This avoids
silently granting subsequent rewards against inconsistent historical
boundaries. It does not automatically reverse or recalculate rewards already
granted; those cases require an explicit reconciliation procedure before
tracking is re-enabled.

This file is an implementation guide only. It does not change or deploy the
Cloudflare Worker. Test the route with a staging backend before setting the
Telegram webhook in production.
