-- Waiting on parts is the one status that cannot describe itself. "Assigned"
-- names a person and "In progress" implies someone is on it, but "Waiting on
-- parts" with no part recorded is just a job nobody is chasing.
--
-- Five columns, no more: what, how many, where from, when ordered, when due.
-- Cost and receipt number already live on the closeout and are not repeated
-- here - the same figure in two places is the same figure disagreeing with
-- itself sooner or later.
alter table public.work_orders
add column if not exists part_name text,
add column if not exists part_qty integer,
add column if not exists part_source text,
add column if not exists part_ordered_on date,
add column if not exists part_expected_on date;

-- Quantity is a count. "2 boxes of shims" belongs in part_name; zero or
-- negative is never a real order.
alter table public.work_orders add constraint work_orders_part_qty_positive check (
    part_qty is null
    or part_qty > 0
);

comment on column public.work_orders.part_expected_on is 'The date Zo expects the part. Drives the overdue flag on the board, so a job waiting three weeks cannot look like one ordered yesterday.';