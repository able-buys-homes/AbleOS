-- 20260901100000_deal_submissions_any_file.sql
-- Sellers attach whatever they have - rent rolls, T12s, photo zips, scans.
-- A MIME allowlist on the bucket silently rejected most of it, so the limit
-- is now enforced in routes/deal-upload-url.js by blocked extension instead,
-- where it can return a message the seller can act on.
--
-- The bucket stays private. Access is by signed URL only.
update storage.buckets
set
    allowed_mime_types = null
where
    id = 'deal-submissions';