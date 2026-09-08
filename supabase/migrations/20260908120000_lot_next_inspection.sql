-- 20260908120000_lot_next_inspection.sql
--
-- When each home is next due to be walked.
--
-- This is a plan, not a record. unit_inspections holds what was actually
-- found when somebody stood in the home; this column holds the date somebody
-- intends to go. Keeping them apart matters: a scheduled date that quietly
-- becomes evidence of an inspection is how a home nobody visited ends up
-- documented as inspected.
--
-- Who set it is recorded for the same reason it is on the rent amount - it is
-- the only way to ask why a date is what it is.
alter table public.lots
add column if not exists next_inspection_at date,
add column if not exists next_inspection_set_by text,
add column if not exists next_inspection_set_at timestamptz;

comment on column public.lots.next_inspection_at is 'The date somebody intends to walk this home. Not evidence that it was walked - see unit_inspections for that.';

create index if not exists lots_next_inspection_idx on public.lots (property, next_inspection_at);