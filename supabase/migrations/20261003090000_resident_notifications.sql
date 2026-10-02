-- What a resident is told when the office does something to their lot:
-- a payment recorded, a work order moved on, a charge added.
-- Per lot, like resident_accounts - the account belongs to the home.
create table if not exists public.resident_notifications (
    id uuid primary key default gen_random_uuid(),
    lot_id uuid not null references public.lots (id) on delete cascade,
    type text not null,
    title text not null,
    body text,
    link text,
    created_at timestamptz not null default now(),
    read_at timestamptz
);

create index if not exists resident_notifications_lot_recent
    on public.resident_notifications (lot_id, created_at desc);

-- The portal reads these through the server with the service key. No policy
-- means no direct access from a browser, which is the point.
alter table public.resident_notifications enable row level security;