-- Where the resident was, and the last buttons they tapped before reporting.
alter table public.portal_feedback
  add column if not exists area text,
  add column if not exists steps text;
