-- 20260907100000_status_source_tidy.sql
--
-- Two corrections to the status data.
--
-- 1. Lot 38 carries a repair note written as an example during the build, not
--    observed by anyone at the home. It reads as an inspection finding. A
--    made-up condition on a real lot is how a home gets shown, or not shown,
--    to someone for a reason that was never true.
--
-- 2. status_set_by held the date inside it - 'site plan 1 Sep 2026' - so the
--    screen printed the date twice. The date belongs in status_set_at.
update public.lots
set
    repair_note = null,
    status_set_by = 'site plan',
    status_set_at = '2026-09-01'
where
    property = 'Hometown Meadows MHP'
    and lot_number = '38';

update public.lots
set
    status_set_by = 'site plan'
where
    status_set_by = 'site plan 1 Sep 2026';