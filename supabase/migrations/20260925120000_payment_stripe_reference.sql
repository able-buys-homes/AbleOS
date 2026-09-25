-- Ties a payment to the Stripe charge that created it.
--
-- Stripe retries a webhook until it gets a 2xx, so the same succeeded payment
-- will arrive more than once. The unique index is what makes a second arrival
-- fail loudly instead of crediting the resident twice. Partial, because every
-- payment Zo enters by hand has no Stripe id and they must not collide.
alter table payments
  add column if not exists stripe_payment_intent_id text;

create unique index if not exists payments_stripe_payment_intent_uniq
  on payments (stripe_payment_intent_id)
  where stripe_payment_intent_id is not null;
