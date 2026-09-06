-- 20260906100000_lot_rent_terms.sql
--
-- Rent becomes real one lot at a time. contract_rent and tenant_portion
-- already exist on lots; what was missing is who put the number there and
-- whether anyone with authority agreed to it.
--
-- This matters because a $75 late fee is charged against that amount. A
-- figure one person typed unreviewed must be visible on screen but must not
-- be able to generate a charge. Same shape as a payment plan: proposed, then
-- confirmed, and only binding after.
alter table public.lots
add column if not exists rent_set_by text,
add column if not exists rent_set_at timestamptz,
add column if not exists rent_confirmed_by text,
add column if not exists rent_confirmed_at timestamptz,
add column if not exists rent_note text;

comment on column public.lots.rent_confirmed_at is 'Null means the amount is recorded but not agreed. Nothing may charge a late fee against an unconfirmed rent.';

-- One rent charge per lot per month. Without this, saving twice quietly
-- doubles what a resident owes and nobody notices until they are served.
create unique index if not exists rent_ledger_one_rent_per_period on public.rent_ledger (lot_id, period)
where
    charge_type = 'rent';

-- One late fee per lot per month, for exactly the same reason.
create unique index if not exists rent_ledger_one_late_fee_per_period on public.rent_ledger (lot_id, period)
where
    charge_type = 'late_fee';

create index if not exists rent_ledger_lot_period_idx on public.rent_ledger (lot_id, period desc);