-- 20260826090000_inspection_drive_columns.sql
-- Columns backing the Google Drive mirror for unit inspection photos.
--
-- Applied by hand in the Supabase SQL editor on 26 Aug 2026 and captured here
-- afterwards, per Fix 4 of the remediation work order. Written idempotently so
-- re-running against the live database is a no-op.
-- Drive mirror tracking. Nullable throughout: a failed mirror must never block
-- the Supabase upload, which stays the source of truth for the cockpit UI.
alter table unit_inspection_photos
add column if not exists drive_file_id text,
add column if not exists drive_view_link text,
add column if not exists drive_folder_id text,
add column if not exists drive_synced_at timestamptz,
add column if not exists drive_error text;

-- Find photos still needing a mirror, or that failed, without a full scan.
create index if not exists unit_inspection_photos_unsynced on unit_inspection_photos (inspection_id)
where
    drive_file_id is null;

-- routes/unit-inspection-drive.js caches the per-unit Drive folder here, so a
-- walk costs one folder lookup instead of one per photo.
alter table unit_inspections
add column if not exists drive_folder_id text;