# Roniya Telegram Bridge Worker

This is a source-controlled reconstruction of the Cloudflare Worker used to relay Roniya backend requests to the Telegram Bot API. It is **not verified as byte-for-byte identical** to the deployed Worker and must be reviewed before deployment.

## Contract with the backend

- The backend sets `TELEGRAM_API_BASE_URL` to the Worker origin, for example `https://roniya-telegram-bridge.<account>.workers.dev`.
- The backend sends `X-Roniya-Proxy-Key`.
- Configure a Worker secret named `PROXY_SECRET` whose value exactly matches the backend's `TELEGRAM_PROXY_SECRET`.
- The Worker currently permits only `sendMessage` and `sendPhoto`, the two methods implemented by Roniya's `telegramBotApi.service.cjs`.

## Important

- Do not put the bot token or proxy secret in this repository.
- Do not delete or overwrite the currently deployed Worker as a recovery step.
- The source preserves request bodies (including multipart photo uploads) and does not log token-bearing URLs.
- Test with an intentionally invalid `chat_id` first; a Telegram `400 chat not found` response can confirm that a test request reached Telegram without posting to the real channel.
- A successful health response at `/` or `/health` only confirms the Worker is reachable; it does not verify the secret or Telegram forwarding.

## Review before deployment

Use the Cloudflare dashboard or Wrangler after reviewing this source. Do not deploy until the configured Worker secret name and current backend Worker URL have been checked. Keep the existing deployed Worker available until the replacement is verified.
