-- Exhibit C, the move-in condition checklist, done in the cockpit. Server-only.
create table if not exists public.move_in_checklists (
  id uuid primary key default gen_random_uuid(),
  lot_id uuid not null references public.lots (id),
  lease_type text not null default 'home_and_lot' check (lease_type in ('home_and_lot', 'lot_only')),
  resident_names text,
  move_in_on date,
  bedrooms smallint,
  baths numeric,
  items jsonb not null default '{}'::jsonb,
  keys_meters jsonb not null default '{}'::jsonb,
  resident_signature text,
  resident2_signature text,
  community_signature text,
  signed_at timestamptz,
  additions_due_at timestamptz,
  status text not null default 'draft' check (status in ('draft', 'signed')),
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists move_in_checklists_lot on public.move_in_checklists (lot_id, created_at desc);
alter table public.move_in_checklists enable row level security;
