-- 20260826100000_storage_buckets.sql
-- Storage bucket configuration.
--
-- Buckets are not schema, so they do not appear in `supabase db diff`. Without
-- this file a rebuilt environment gets no buckets at all - and historically the
-- deal-submissions MIME list was widened by hand, so a rebuild would silently
-- reject spreadsheets. Captured here per Fix 4.
--
-- All three are private. Access is by signed URL only, minted server-side.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
    (
        'deal-submissions',
        'deal-submissions',
        false,
        15728640,                                    -- 15 MB
        array[
            'image/jpeg',
            'image/png',
            'image/webp',
            'image/heic',
            'image/heif',
            'application/pdf',
            -- Widened by hand on 23 Aug so underwriting could accept
            -- spreadsheets and Word documents from submitters.
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'application/vnd.ms-excel',
            'text/csv',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'application/msword'
        ]
    ),
    (
        'task-evidence',
        'task-evidence',
        false,
        10485760,                                    -- 10 MB
        array[
            'image/jpeg',
            'image/png',
            'image/webp',
            'image/heic',
            'image/heif',
            'application/pdf'
        ]
    ),
    (
        -- HEIC matters here: it is what iPhones shoot by default.
        'unit-inspection-photos',
        'unit-inspection-photos',
        false,
        15728640,                                    -- 15 MB
        array[
            'image/jpeg',
            'image/png',
            'image/heic',
            'image/heif',
            'image/webp'
        ]
    )
on conflict (id) do update
set public             = excluded.public,
    file_size_limit    = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;