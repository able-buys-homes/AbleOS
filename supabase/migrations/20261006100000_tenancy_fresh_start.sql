-- A new tenant never inherits the last one's balance, plans, notices or portal history.
alter table public.lots add column if not exists tenancy_started_at timestamptz;
create or replace view public.rent_ledger_current with (security_invoker = true) as
  select c.* from public.rent_ledger c
  where c.created_at >= coalesce((select l.tenancy_started_at from public.lots l where l.id = c.lot_id), '-infinity'::timestamptz);
create or replace view public.payments_current with (security_invoker = true) as
  select p.* from public.payments p
  where p.created_at >= coalesce((select l.tenancy_started_at from public.lots l where l.id = p.lot_id), '-infinity'::timestamptz);
create or replace view public.payment_plans_current with (security_invoker = true) as
  select pp.* from public.payment_plans pp
  where pp.created_at >= coalesce((select l.tenancy_started_at from public.lots l where l.id = pp.lot_id), '-infinity'::timestamptz);
create or replace view public.notices_current with (security_invoker = true) as
  select n.* from public.notices n
  where n.created_at >= coalesce((select l.tenancy_started_at from public.lots l where l.id = n.lot_id), '-infinity'::timestamptz);
create or replace view public.work_orders_current with (security_invoker = true) as
  select w.* from public.work_orders w
  where w.created_at >= coalesce((select l.tenancy_started_at from public.lots l where l.id = w.lot_id), '-infinity'::timestamptz);
revoke all on public.rent_ledger_current, public.payments_current, public.payment_plans_current,
              public.notices_current, public.work_orders_current from anon, authenticated;
