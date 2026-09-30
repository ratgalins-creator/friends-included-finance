# Friends Included Finance

Finance dashboard for the fictional Friends Included Ltd coursework project.

## Local setup

Create a `.env.local` file with `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `GOOGLE_SHEETS_SPREADSHEET_ID`, `GOOGLE_SERVICE_ACCOUNT_JSON`, and `TELEGRAM_BOT_TOKEN`, then run `pnpm dev`. `TELEGRAM_WEBHOOK_SECRET` is recommended for webhook verification.

Apply both files in `supabase/migrations/` in the Supabase SQL Editor, in filename order. The second migration creates the Telegram contact, conversation, and notification tables.

## Telegram setup

1. Add the bot token to a server-side Vercel secret named `TELEGRAM_BOT_TOKEN`.
2. Deploy the current source.
3. In the published site, select **Svetlana de Monte Carlo**, press **Connect Telegram bot**, then send `/start` to the bot.
4. Link the Telegram contact to a fictional employee in **Telegram manager setup**. Only a manager can do this. The same test account can be re-linked from Richard to Kevin; existing bot submissions keep their original chat ID.

Google Sheets is a one-way readable copy. It is updated by reference on submission, approval, and retry, so it never creates a duplicate row.

All secret values must stay server-side and must never be committed to GitHub.
