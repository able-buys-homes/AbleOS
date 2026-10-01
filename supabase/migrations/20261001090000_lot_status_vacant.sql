-- Adds a "vacant" home status: nobody lives there, but the home is not
-- confirmed ready to rent (unlike "ready").
alter table public.lots drop constraint lots_home_status_check;

alter table public.lots add constraint lots_home_status_check
  check (home_status = any (array[
    'occupied', 'vacant', 'ready', 'moving_out',
    'needs_repair', 'full_rehab', 'common_area', 'verify'
  ]));