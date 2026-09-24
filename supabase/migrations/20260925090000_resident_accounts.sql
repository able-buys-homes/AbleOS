-- 20260925090000_resident_accounts.sql
-- A resident's way into the portal.
--
-- One account per lot, not per person. That is how these households actually
-- work - rent is owed by the home, and whoever is holding the card is the
-- person paying it. Per-person accounts would mean more cards, more resets,
-- and a support call the office cannot resolve without email.
--
-- Identity is the lot number. A resident never types an email address, because
-- many of them do not reliably have one. The auth account underneath carries a
-- synthetic address that never receives mail and that nobody is ever shown.

create table if not exists resident_accounts (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null unique,
    lot_id uuid not null references lots (id) on delete restrict,
    display_name text,
    created_by text,
    created_at timestamptz not null default now(),
    last_seen_at timestamptz,
    -- Set rather than deleted. A resident who moves out keeps their payment
    -- history, and that history has to stay attached to somebody.
    disabled_at timestamptz
);

create unique index if not exists resident_accounts_lot_active
    on resident_accounts (lot_id)
    where disabled_at is null;

comment on table resident_accounts is
    'Links a Supabase auth user to the lot they live in. One active account per lot.';

comment on column resident_accounts.disabled_at is
    'Set when a resident moves out. The row stays so their payment history keeps its owner.';

alter table resident_accounts enable row level security;

-- A resident may read their own row and nothing else. The portal goes through
-- the server with the service key, so this is belt and braces rather than the
-- only thing standing in the way - but a policy that does not exist cannot
-- save you later.
create policy "A resident reads their own account"
    on resident_accounts for select
    using (user_id = auth.uid());

create policy "Staff read resident accounts"
    on resident_accounts for select
    using (
        exists (
            select 1 from profiles
            where profiles.id = auth.uid()
              and profiles.cockpit in ('zo', 'raj', 'dane', 'ellery')
        )
    );