-- 20260908110000_work_order_cosmetic.sql
--
-- A fourth priority, below routine. Cosmetic is a scuffed door or a patch of
-- paint - things worth writing down so they are not forgotten, and worth
-- keeping out of the same bucket as a job somebody is waiting on.
--
-- Without it, everything that is not urgent becomes "routine", and routine
-- stops telling anyone anything.
alter table public.work_orders
drop constraint if exists work_orders_priority_check;

alter table public.work_orders add constraint work_orders_priority_check check (
    priority in ('emergency', 'urgent', 'routine', 'cosmetic')
);