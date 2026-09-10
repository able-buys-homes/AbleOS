-- 20260910090000_work_order_receipt.sql
--
-- The receipt or invoice number for a repair.
--
-- Optional, because plenty of jobs are a screwdriver and ten minutes. But
-- when parts were bought, the number is what ties a line on a card statement
-- to the home it was spent on - and without it, "parts $340" is a figure
-- nobody can check.
alter table public.work_orders
add column if not exists receipt_number text;