-- Soft removal from the rent roll. Nothing is deleted.
alter table public.lots
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by text,
  add column if not exists archive_reason text;
create table if not exists public.tenancy_history (
    id uuid primary key default gen_random_uuid(),
    lot_id uuid not null references public.lots (id),
    tenant_name text, contract_rent numeric, tenant_portion numeric,
    move_in_on date, rent_due_day smallint, balance_at_exit numeric,
    next_status text, note text, ended_by text,
    ended_at timestamptz not null default now()
);
alter table public.tenancy_history enable row level security;
