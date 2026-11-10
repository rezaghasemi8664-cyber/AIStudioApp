# Telegram referral webhook setup

## Backend contract

The referral webhook is mounted by the existing Telegram referral router at:

- `POST /api/v1/telegram-referrals/webhook`
- Compatibility alias: `POST /api/telegram-referrals/webhook`

The endpoint accepts Telegram `Update` JSON and requires the exact
`X-Telegram-Bot-Api-Secret-Token` header. Configure a high-entropy value in
the backend environment as `TELEGRAM_WEBHOOK_SECRET`. Do not reuse
`TELEGRAM_PROXY_SECRET` or the Cloudflare Worker outbound proxy key.

The backend JSON parser is already registered before route mounting. The webhook
does not use user JWT authentication; the Telegram secret header is its
authentication mechanism.

## Telegram Bot requirements

1. Add the bot as an administrator of the target channel.
2. Grant the bot permission to invite users.
3. Configure Telegram webhook `allowed_updates` to include `chat_member`.
4. Configure Telegram's `secret_token` to exactly match backend
   `TELEGRAM_WEBHOOK_SECRET`.
5. If Cloudflare Worker is the public webhook entry point, it must forward the
   request body and the `X-Telegram-Bot-Api-Secret-Token` header unchanged to
   the backend webhook path. Do not expose bot tokens or backend secrets in
   browser code or logs.

The current repository does not contain the deployed Cloudflare Worker source.
The Worker forwarding route therefore needs to be added to the existing Worker
separately before Telegram can deliver membership updates through that bridge.

## Processing rules

- Only a transition from non-member to member is considered.
- Only an invite link previously created and stored for an inviter is accepted.
- Telegram user IDs are stored as strings to avoid numeric precision loss.
- A unique key on channel + Telegram user prevents duplicate credit, including
  leave-and-rejoin events and repeated webhook deliveries.
- Membership events are ordered by Telegram's `chat_member.date` when
  calculating a milestone boundary.
- Every 20 unique confirmed members creates one 5-day reward record.
- A reward extends a subscription active at the milestone event time; otherwise
  a new subscription interval begins at the milestone event time.
- The authoritative `Subscription` record and legacy `User` subscription
  fields are updated in the same database transaction.

## Environment

Required for webhook processing:

```env
TELEGRAM_WEBHOOK_SECRET=<high-entropy-secret>
```

Existing Telegram configuration must also remain set:

```env
TELEGRAM_BOT_TOKEN=<bot-token>
TELEGRAM_CHANNEL_ID=<numeric-channel-id-or-configured-channel-username>
```

## Deployment sequence

1. Review and merge the feature branch.
2. Back up the database.
3. Apply the new Prisma migration during an approved deployment window.
4. Generate/update the Prisma client and deploy the backend.
5. Add `TELEGRAM_WEBHOOK_SECRET` to backend environment and restart the backend.
6. Update the Cloudflare Worker to proxy the webhook path to the backend while
   preserving the Telegram secret header.
7. Set Telegram webhook URL to the Worker public URL with
   `allowed_updates=["chat_member"]` and the same `secret_token`.
8. Verify a real join and inspect the referral card's confirmed-member count.

No live database migration, Worker deployment, webhook registration, or server
restart is performed by this repository change.
