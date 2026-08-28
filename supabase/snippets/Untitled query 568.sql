select id, public, file_size_limit, array_length(allowed_mime_types, 1) as mime_count
from storage.buckets
order by id;