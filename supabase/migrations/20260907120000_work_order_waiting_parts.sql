-- 20260907120000_work_order_waiting_parts.sql
--
-- A job can be genuinely stuck rather than merely unstarted. "Waiting on
-- parts" is the difference between nobody having looked at a home and
-- somebody having looked, ordered a water heater, and being unable to finish
-- until it arrives.
--
-- Without it, both look identical on the board, and the second one gets
-- chased as though it were the first.
alter table public.work_orders
drop constraint if exists work_orders_status_check;

alter table public.work_orders add constraint work_orders_status_check check (
    status in (
        'new',
        'assigned',
        'in_progress',
        'waiting_parts',
        'completed',
        'cancelled'
    )
);