-- Rent stops being a park-wide event on the 1st and becomes a per-tenancy one.
-- A resident who moved in on the 11th pays on the 11th, and is not late until
-- the 16th. Billing everyone on the 1st made that resident late on the 6th for
-- money that was not due for another five days.
--
-- Null rent_due_day means nobody has asked that resident yet. Such a lot is not
-- billed and cannot be late - a guessed due day is a guessed late fee, and $75
-- is not a guess anyone should have to argue their way out of.

alter table public.lots
  add column if not exists move_in_on   date,
  add column if not exists rent_due_day smallint;

alter table public.lots
  add constraint lots_rent_due_day_range
  check (rent_due_day is null or (rent_due_day between 1 and 31));

-- Lots already carrying a real rent were recorded on the day their tenancy was
-- entered, which is the closest thing to a move-in date that exists. The
-- placeholders are left null deliberately.
update public.lots
set move_in_on   = coalesce(move_in_on, rent_set_at::date),
    rent_due_day = coalesce(rent_due_day, extract(day from rent_set_at)::smallint)
where occupied
  and contract_rent is not null
  and rent_placeholder = false
  and rent_set_at is not null;

comment on column public.lots.rent_due_day is
  'Day of the month this tenancy pays, taken from the move-in date. Null means nobody has been asked yet - the lot is not billed and cannot be late.';

comment on column public.lots.move_in_on is
  'When this tenancy started. The source of rent_due_day, kept so the due day can be explained rather than just asserted.';