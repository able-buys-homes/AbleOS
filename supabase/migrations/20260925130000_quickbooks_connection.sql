-- QuickBooks connection.
--
-- One row, ever. The refresh token is the keys to the books, so this table has
-- RLS on with no policies at all: nothing but the service role can see it, and
-- no cockpit screen can reach it even by accident.
--
-- Intuit rotates the refresh token on every use and expires it after 100 days
-- of silence, which is why it is stored rather than configured. A token in an
-- environment variable would go stale and nobody would notice until rent
-- stopped posting.
create table if not exists qbo_connection (
  id text primary key default 'default' check (id = 'default'),
  realm_id text not null,
  environment text not null default 'sandbox',
  access_token text,
  access_token_expires_at timestamptz,
  refresh_token text not null,
  refresh_token_expires_at timestamptz,
  connected_by text,
  connected_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table qbo_connection enable row level security;

-- A QuickBooks customer per lot, created the first time that lot needs one.
alter table lots
  add column if not exists qbo_customer_id text;

-- What QuickBooks called the payment, and whether it got there at all.
-- qbo_error is kept so a failure is visible in the data rather than only in a
-- log nobody reads.
alter table payments
  add column if not exists qbo_payment_id text,
  add column if not exists qbo_synced_at timestamptz,
  add column if not exists qbo_error text;
