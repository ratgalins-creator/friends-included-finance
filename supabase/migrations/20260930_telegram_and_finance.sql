-- Telegram identity, original-chat preservation, and delivery tracking.
-- Run this after 20260930_google_sheets_sync.sql in the Supabase SQL Editor.

alter table transactions
  add column if not exists submitted_via text not null default 'website'
    check (submitted_via in ('website', 'telegram')),
  add column if not exists originating_telegram_chat_id text,
  add column if not exists telegram_submission_user_id text,
  add column if not exists manager_decided_at timestamptz,
  add column if not exists manager_decided_by uuid references employees(id);

create table if not exists telegram_contacts (
  telegram_user_id text primary key,
  chat_id text not null,
  username text,
  first_name text,
  last_name text,
  employee_id uuid unique references employees(id) on delete set null,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create table if not exists telegram_sessions (
  telegram_user_id text primary key references telegram_contacts(telegram_user_id) on delete cascade,
  chat_id text not null,
  flow text not null check (flow in ('sale', 'expense')),
  step text not null,
  payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists transaction_notifications (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references transactions(id) on delete cascade,
  kind text not null check (kind in ('submission_confirmation', 'manager_submission_alert', 'decision')),
  chat_id text,
  message text not null,
  status text not null default 'pending' check (status in ('pending', 'sent', 'failed', 'not_required')),
  error text,
  attempts integer not null default 0,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (transaction_id, kind)
);

alter table telegram_contacts enable row level security;
alter table telegram_sessions enable row level security;
alter table transaction_notifications enable row level security;
