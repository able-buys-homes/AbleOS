-- Community announcements.
--
-- Deliberately NOT the notices table. That one holds legal eviction notices
-- with geo-tagged proof of posting and gets produced in court; mixing park
-- news into it would pollute the record and could show a resident somebody
-- else's filing. Same word to a resident, different thing entirely.
create table if not exists announcements (
  id uuid primary key default gen_random_uuid(),
  property text not null default 'Hometown Meadows MHP',
  category text not null check (category in ('urgent','billing','maintenance','community')),
  title text not null,
  body text not null,
  pinned boolean not null default false,

  -- Written tonight, seen tomorrow morning. Zo should not have to be at a
  -- desk at 6am to warn people the water is going off.
  publish_at timestamptz not null default now(),

  -- The field that decides whether this board is worth reading. "Water off
  -- Tuesday" still sitting there in November teaches residents to ignore it,
  -- and then they miss the one that matters.
  expires_on date,

  created_by text not null,
  updated_by text,

  -- Archived, never deleted. An announcement about a rent increase may matter
  -- a year later.
  archived_at timestamptz,

  -- When the email went out. Null means it has not been sent yet, which is
  -- also how the sweep knows what is waiting.
  emailed_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists announcements_live
  on announcements (publish_at desc)
  where archived_at is null;

-- Read state per resident. A shared flag would mark it read for the whole
-- park the moment one person opened it.
create table if not exists announcement_reads (
  announcement_id uuid not null references announcements(id) on delete cascade,
  resident_account_id uuid not null references resident_accounts(id) on delete cascade,
  read_at timestamptz not null default now(),
  primary key (announcement_id, resident_account_id)
);

alter table announcements enable row level security;
alter table announcement_reads enable row level security;

-- Somewhere to put a real address. The sign-in address is synthetic, built
-- from the lot number, and mail to it goes nowhere.
alter table resident_accounts
  add column if not exists contact_email text,
  add column if not exists email_opt_in boolean not null default true;
