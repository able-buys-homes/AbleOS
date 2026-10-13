-- 20261013120000_stripe_webhook_events.sql
-- Stripe -> cockpit direct webhook (approved by Ms Dane, 13 Oct 2026).
-- One row per Stripe event id: Stripe redelivers events, and the second
-- delivery must be a no-op. Server-side only (service key); RLS on, no
-- policies, so no signed-in user can read or write it.
create table if not exists stripe_webhook_events (
    id            text primary key,          -- Stripe event id (evt_...)
    type          text not null,
    livemode      boolean not null default false,
    object_id     text,                      -- pi_... / cs_...
    result        text,                      -- "processing", then "<status> <json>"
    received_at   timestamptz not null default now(),
    processed_at  timestamptz
);

alter table stripe_webhook_events enable row level security;
