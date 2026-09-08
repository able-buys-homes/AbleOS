-- 20260908090000_plan_frequency.sql
--
-- How often a plan pays was collected on the form, used to space the
-- installments, and then dropped. Nothing could show Raj "every two weeks"
-- because nothing had kept it.
--
-- It is almost recoverable from the gap between installment dates, which is
-- why nobody noticed. Almost is not good enough for a term someone signs.

alter table public.payment_plans
    add column if not exists frequency text;

alter table public.payment_plans
    drop constraint if exists payment_plans_frequency_check;

alter table public.payment_plans
    add constraint payment_plans_frequency_check
    check (frequency is null or frequency in ('Weekly', 'Every two weeks', 'Monthly'));

-- Backfill the plans already in the table from the spacing of their own
-- installments. This is the inference described above, done once, on rows
-- where there is no better answer available.
update public.payment_plans p
set frequency = case
        when gap.days = 7 then 'Weekly'
        when gap.days between 28 and 31 then 'Monthly'
        else 'Every two weeks'
    end
from (
    select plan_id,
           (max(due_date) - min(due_date)) / greatest(count(*) - 1, 1) as days
    from public.plan_installments
    group by plan_id
) gap
where gap.plan_id = p.id
  and p.frequency is null;