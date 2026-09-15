-- The public form on the Hometown Meadows website now reaches the cockpit,
-- forwarded by n8n with the shared secret. Nobody in the office takes those,
-- so taken_by has to be allowed to be empty - putting a name against an
-- application that person never saw would be a lie in a record we may one day
-- have to defend.
alter table public.htm_applications
alter column taken_by
drop not null;

alter table public.htm_applications
add column if not exists source text not null default 'cockpit';

alter table public.htm_applications add constraint htm_applications_source_known check (source in ('cockpit', 'website'));

comment on column public.htm_applications.source is 'Which door it came in by. "cockpit" means somebody on the team took it; "website" means the applicant filled it in themselves.';

comment on column public.htm_applications.taken_by is 'The person who took it. Null for website submissions - nobody took those.';