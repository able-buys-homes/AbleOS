-- 20260907090000_lot_status.sql
--
-- One field that says what a lot is, for every lot the map draws.
--
-- Until now the map's statuses lived in a hardcoded array in the frontend -
-- a snapshot of a hand-drawn site plan from 1 September. That array is why
-- Map and Rent could disagree about the same home. This moves it into the
-- table and makes `occupied` a consequence of the status rather than a second
-- opinion about it.
--
-- Deliberately not done here: nothing overwrites an existing resident's
-- record from the snapshot. The site plan says Lot 2 needs checking and Lot
-- 13 is moving out; the database says both are occupied. A hand drawing does
-- not get to take two people off the rent roll. Zo sets those in the app once
-- he has stood in front of them.

alter table public.lots
  add column if not exists home_status   text,
  add column if not exists repair_note   text,
  add column if not exists status_set_by text,
  add column if not exists status_set_at timestamptz,
  add column if not exists bed           numeric(3,1),
  add column if not exists bath          numeric(3,1),
  add column if not exists sq_ft         integer;

-- Everything already in this table is a resident.
update public.lots
set home_status = case when occupied then 'occupied' else 'ready' end
where home_status is null;

alter table public.lots
  drop constraint if exists lots_home_status_check;

alter table public.lots
  add constraint lots_home_status_check
  check (home_status in (
    'occupied',      -- someone lives here
    'ready',         -- empty and rentable today
    'moving_out',    -- notice given, not yet empty
    'needs_repair',  -- empty, work needed before it can be shown
    'full_rehab',    -- empty, gutted
    'common_area',   -- office, laundry - not a door
    'verify'         -- two records disagree. Not shown to anyone until walked
  ));

alter table public.lots alter column home_status set not null;

-- A lot nobody has told us about is not assumed empty and not assumed lived
-- in. It is unknown, and unknown has a name here.
alter table public.lots alter column home_status set default 'verify';

comment on column public.lots.home_status is
  'The single source of what a lot is. lots.occupied is derived from this by trigger and must never be set by hand.';

-- `occupied` is now a consequence. Recomputed on every write, so the two can
-- never drift apart no matter which screen did the writing.
create or replace function public.lots_sync_occupied()
returns trigger
language plpgsql
as $$
begin
    new.occupied := (new.home_status = 'occupied');
    return new;
end
$$;

drop trigger if exists lots_sync_occupied on public.lots;

create trigger lots_sync_occupied
    before insert or update on public.lots
    for each row
    execute function public.lots_sync_occupied();

-- Bed, bath and square feet for the homes already on the roll. Same source as
-- the frontend array: the unit table, not the hand drawing.
update public.lots set bed = 3, bath = 1               where lot_number = '1'  and property = 'Hometown Meadows MHP';
update public.lots set bed = 2, bath = 1.5, sq_ft = 840 where lot_number = '2'  and property = 'Hometown Meadows MHP';
update public.lots set bed = 2, bath = 1,   sq_ft = 720 where lot_number = '4'  and property = 'Hometown Meadows MHP';
update public.lots set bed = 2, bath = 1,   sq_ft = 700 where lot_number = '6'  and property = 'Hometown Meadows MHP';
update public.lots set bed = 1, bath = 1,   sq_ft = 600 where lot_number = '13' and property = 'Hometown Meadows MHP';
update public.lots set bed = 1, bath = 1               where lot_number = '14' and property = 'Hometown Meadows MHP';
update public.lots set bed = 2, bath = 1,   sq_ft = 700 where lot_number = '15' and property = 'Hometown Meadows MHP';
update public.lots set bed = 3, bath = 2,   sq_ft = 980 where lot_number = '17' and property = 'Hometown Meadows MHP';
update public.lots set bed = 3, bath = 2,   sq_ft = 1400 where lot_number = '23' and property = 'Hometown Meadows MHP';
update public.lots set bed = 3, bath = 2,   sq_ft = 980 where lot_number = '27' and property = 'Hometown Meadows MHP';
update public.lots set bed = 2, bath = 1,   sq_ft = 840 where lot_number = '28' and property = 'Hometown Meadows MHP';
update public.lots set bed = 3, bath = 1,   sq_ft = 840 where lot_number = '31' and property = 'Hometown Meadows MHP';
update public.lots set bed = 2, bath = 1,   sq_ft = 980 where lot_number = '41' and property = 'Hometown Meadows MHP';
update public.lots set bed = 2, bath = 1,   sq_ft = 840 where lot_number = '43' and property = 'Hometown Meadows MHP';
update public.lots set bed = 2, bath = 1,   sq_ft = 720 where lot_number = '44' and property = 'Hometown Meadows MHP';
update public.lots set bed = 2, bath = 1,   sq_ft = 840 where lot_number = '46' and property = 'Hometown Meadows MHP';

-- The eighteen lots the map draws that were never in the table. Statuses come
-- from the 1 September site walk, and say so - status_set_by is the drawing,
-- not a person, so the screen can tell Zo how old this is.
insert into public.lots
    (property, lot_number, tenant_name, home_status, bed, bath, sq_ft,
     repair_note, notes, is_sample, status_set_by, status_set_at)
values
    ('Hometown Meadows MHP', '3',  null, 'needs_repair', 2, 1,   720,  null, null, false, 'site plan 1 Sep 2026', '2026-09-01'),
    ('Hometown Meadows MHP', '7',  null, 'needs_repair', 3, 1.5, 980,  null, null, false, 'site plan 1 Sep 2026', '2026-09-01'),
    ('Hometown Meadows MHP', '8',  null, 'ready',        2, 1,   700,  null, null, false, 'site plan 1 Sep 2026', '2026-09-01'),
    ('Hometown Meadows MHP', '12', null, 'ready',        null, null, null, null, null, false, 'site plan 1 Sep 2026', '2026-09-01'),
    ('Hometown Meadows MHP', '21', null, 'needs_repair', 2, 1,   null, null, null, false, 'site plan 1 Sep 2026', '2026-09-01'),
    ('Hometown Meadows MHP', '22', null, 'ready',        2, 2,   null, null, null, false, 'site plan 1 Sep 2026', '2026-09-01'),
    ('Hometown Meadows MHP', '24', null, 'common_area',  null, null, null, null, 'Converted to community office / laundry room', false, 'site plan 1 Sep 2026', '2026-09-01'),
    ('Hometown Meadows MHP', '25', null, 'needs_repair', 2, 1.5, 840,  null, null, false, 'site plan 1 Sep 2026', '2026-09-01'),
    ('Hometown Meadows MHP', '29', null, 'full_rehab',   2, 1,   780,  null, null, false, 'site plan 1 Sep 2026', '2026-09-01'),
    ('Hometown Meadows MHP', '30', null, 'full_rehab',   2, 1,   720,  null, null, false, 'site plan 1 Sep 2026', '2026-09-01'),
    ('Hometown Meadows MHP', '33', null, 'full_rehab',   null, null, null, null, null, false, 'site plan 1 Sep 2026', '2026-09-01'),
    ('Hometown Meadows MHP', '34', null, 'full_rehab',   null, null, null, null, null, false, 'site plan 1 Sep 2026', '2026-09-01'),
    ('Hometown Meadows MHP', '35', null, 'full_rehab',   null, null, null, null, null, false, 'site plan 1 Sep 2026', '2026-09-01'),
    ('Hometown Meadows MHP', '36', null, 'full_rehab',   null, null, null, null, null, false, 'site plan 1 Sep 2026', '2026-09-01'),
    ('Hometown Meadows MHP', '37', null, 'full_rehab',   null, null, null, null, null, false, 'site plan 1 Sep 2026', '2026-09-01'),
    ('Hometown Meadows MHP', '38', null, 'full_rehab',   null, null, null, null, null, false, 'site plan 1 Sep 2026', '2026-09-01'),
    ('Hometown Meadows MHP', '39', null, 'full_rehab',   null, null, null, null, null, false, 'site plan 1 Sep 2026', '2026-09-01'),
    ('Hometown Meadows MHP', '40', null, 'full_rehab',   null, null, null, null, null, false, 'site plan 1 Sep 2026', '2026-09-01');

create index if not exists lots_home_status_idx
  on public.lots (property, home_status);