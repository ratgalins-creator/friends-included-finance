alter table transactions
  add column if not exists sync_status text not null default 'pending'
    check (sync_status in ('pending', 'synced', 'failed')),
  add column if not exists sync_error text;

update transactions set sync_status = 'pending' where sync_status is null;
