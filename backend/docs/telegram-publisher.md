# Telegram channel publisher

Optional independent consumer of persisted market data. It does not modify the scalping or valuable-symbol engines.

## Secure configuration

Set the bot token (environment variable name is `TELEGRAM_BOT_` followed by `TOKEN`) and `TELEGRAM_CHANNEL_ID` in the protected server environment, never in source control or chat. The channel target may be a username such as `@RoniyaAnalyzer` or a numeric chat ID. `TELEGRAM_TIMEOUT_MS` is optional and defaults to 15000 milliseconds.

The bot must be a channel administrator with Telegram Bot API `can_post_messages` rights. The Telegram Desktop UI may label this right differently; `Manage Messages` alone does not prove that posting is permitted.

## Publishing rules

- Index snapshots are considered only at 09:15, 10:00, 11:00 and 12:15 Tehran time, when today's canonical market snapshot is open, non-stale and updated within five minutes.
- Valuable-symbol messages are considered only during the Tehran market session and only for fresh evaluated results and price timestamps. Newly listed symbols and score improvements of at least ten points are announced; small changes are suppressed.
- End-of-day summaries are published only when a complete deterministic summary for today's Tehran date exists. Historical catch-up summaries are not eligible.
- A state record in the existing `AppConfig` table suppresses duplicates across restarts. No schema migration is required.
- Missing credentials or channel target disable the cron. Credentials are never logged.
- Weekday/session checks are paired with fresh current-day market data to reduce holiday/stale-data risks; weekday checks alone are not treated as an official exchange holiday calendar.

No VPS change is made by this code change itself.
