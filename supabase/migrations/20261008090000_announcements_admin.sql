-- Raj, Oct 2026: an Admin notice type for office notices (hours, policies, paperwork).
alter table public.announcements drop constraint if exists announcements_category_check;
alter table public.announcements add constraint announcements_category_check
  check (category = any (array['urgent','billing','maintenance','community','admin']));
