-- Emails the intake gate turned away, kept whole.
--
-- raw_body is the point: if the gate makes a bad call, the original email is
-- sitting right here and can be read back. Nothing is destroyed, so a wrong
-- rule costs an hour of reading rather than a lost deal.
--
-- No screen, no route, no policies. The gate writes through n8n with the
-- service key; RLS is on with nothing granted, so nobody signed in to the
-- cockpit can read a stranger's email out of it.

create table if not exists public.unqualified_intake (
  id           uuid primary key default gen_random_uuid(),
  received_at  timestamptz,
  sender_email text,
  subject      text,
  raw_body     text,
  reason_code  text,
  -- True while the gate is only watching. False once it is actually
  -- turning emails away.
  shadow_mode  boolean not null default true,
  created_at   timestamptz not null default now()
);

-- Deliberately no check constraint on reason_code. A code we have not
-- thought of should land in the table and be visible, not fail the insert
-- and lose the email.
create index if not exists unqualified_intake_reason_idx
  on public.unqualified_intake (shadow_mode, reason_code);

alter table public.unqualified_intake enable row level security;

comment on table public.unqualified_intake is
  'Emails the intake gate rejected. raw_body is kept so a bad call can be reviewed and reversed.'