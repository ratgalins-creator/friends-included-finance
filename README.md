# Friends Included Finance

Finance dashboard for the fictional Friends Included Ltd coursework project.

## Local setup

Create a `.env.local` file with `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `GOOGLE_SHEETS_SPREADSHEET_ID`, and `GOOGLE_SERVICE_ACCOUNT_JSON`, then run `pnpm dev`.

Apply `supabase/migrations/20260930_google_sheets_sync.sql` in the Supabase SQL Editor before using Google Sheets synchronization.

All secret values must stay server-side and must never be committed to GitHub.
