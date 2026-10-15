-- 20261015180000_pets.sql - T-25 Part 2 (15 Oct 2026). Settings + list only.
-- Nothing here charges anyone. Amounts stay NULL until Raj sets them.
begin;
create table if not exists pet_settings (
    portfolio        text primary key check (portfolio in ('htm', 'ahtx')),
    pet_fee          numeric(10,2),
    pet_deposit      numeric(10,2),
    pet_rent_monthly numeric(10,2),
    updated_by       text,
    updated_at       timestamptz not null default now()
);
insert into pet_settings (portfolio) values ('htm'), ('ahtx') on conflict do nothing;

create table if not exists animals (
    id                 uuid primary key default gen_random_uuid(),
    portfolio          text not null check (portfolio in ('htm', 'ahtx')),
    lot_id             uuid references lots(id),
    unit_label         text,
    tenancy_started_at timestamptz,
    kind               text not null check (kind in ('dog', 'cat', 'other')),
    status             text not null check (status in ('pet', 'service_trained', 'esa_untrained', 'request_pending')),
    note               text,
    created_by         text,
    created_at         timestamptz not null default now(),
    removed_at         timestamptz
);
alter table pet_settings enable row level security;
alter table animals enable row level security;
commit;
