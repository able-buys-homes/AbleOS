-- Ellery works two books of business, and the same date means different things
-- in each - an Oxford House lease in Lubbock and a quarterly inspection walk in
-- Nashville are not the same person's problem. The badge on the row says which
-- at a glance.
--
-- Defaults to htm because everything recorded so far is Hometown Meadows.

alter table public.critical_dates
  add column if not exists portfolio text not null default 'htm';

alter table public.critical_dates
  add constraint critical_dates_portfolio_known
  check (portfolio in ('ahtx', 'htm'));

comment on column public.critical_dates.portfolio is
  'Which book of business this date belongs to. Drives the badge on Ellery''s list.';