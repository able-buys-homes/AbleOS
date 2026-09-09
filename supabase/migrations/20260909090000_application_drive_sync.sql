-- 20260909090000_application_drive_sync.sql
--
-- Where the Drive copy of an application ended up, and whether it got there.
--
-- The database is the record; Drive is a copy for the people who work out of
-- Drive. So a Drive failure must never lose an application - the submission
-- is saved first and the copy is attempted after. But a failure that nobody
-- can see is worse than one that shouts, because somebody will go looking in
-- the folder for a file that was never filed. drive_error is how that shows.
alter table public.htm_applications
add column if not exists drive_file_id text,
add column if not exists drive_url text,
add column if not exists drive_synced_at timestamptz,
add column if not exists drive_error text;

comment on column public.htm_applications.drive_error is 'Why the Drive copy failed, if it did. Null and a null drive_file_id together mean it has not been attempted yet.';