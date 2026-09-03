-- 20260903093000_notice_geo_status.sql
-- Why a notice has no coordinates.
--
-- A null lat/lng is ambiguous - it could mean the phone failed, or that
-- nobody ever asked. Barrett needs to know which. 'unavailable' is a recorded
-- fact; a blank is a question nobody can answer later.
alter table notices
add column if not exists geo_status text check (
    geo_status is null
    or geo_status in ('captured', 'unavailable')
);