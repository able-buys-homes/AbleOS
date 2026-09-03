-- 20260903092000_collections_bucket.sql
-- Receipt stubs and proof-of-service photos.
--
-- Private. These are evidence Barrett puts in front of a judge, and they show
-- residents' doors and names - they are reached only through signed links
-- minted server-side, never a public URL.
--
-- HEIC is allowed because it is what iPhones shoot by default.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
    'collections-photos',
    'collections-photos',
    false,
    15728640,                                    -- 15 MB
    array['image/jpeg', 'image/png', 'image/heic', 'image/heif', 'image/webp']
)
on conflict (id) do update
set public             = excluded.public,
    file_size_limit    = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;