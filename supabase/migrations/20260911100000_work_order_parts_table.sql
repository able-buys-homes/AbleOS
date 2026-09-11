-- A job can be waiting on more than one thing. Five columns on work_orders
-- could only ever hold one part, so a second part meant overwriting the first
-- and losing whatever was still outstanding.
--
-- Those columns went in earlier the same day, so there is very little to carry
-- across - but the copy runs rather than assuming that.

create table if not exists public.work_order_parts (
  id            uuid primary key default gen_random_uuid(),
  work_order_id uuid not null
                references public.work_orders (id) on delete cascade,
  name          text not null,
  qty           integer,
  source        text,
  ordered_on    date,
  expected_on   date,
  -- The day it turned up, not a flag. Null means still outstanding, and
  -- "ordered the 2nd, arrived the 20th" stays answerable months later.
  arrived_on    date,
  created_at    timestamptz not null default now()
);

alter table public.work_order_parts
  add constraint work_order_parts_qty_positive
  check (qty is null or qty > 0);

-- A part with a blank name is a row nobody can act on.
alter table public.work_order_parts
  add constraint work_order_parts_name_not_blank
  check (length(btrim(name)) > 0);

create index if not exists work_order_parts_job_idx
  on public.work_order_parts (work_order_id);

/* ---- carry across anything recorded while parts lived on the job ---- */
insert into public.work_order_parts
  (work_order_id, name, qty, source, ordered_on, expected_on)
select
  id, btrim(part_name), part_qty, part_source, part_ordered_on, part_expected_on
from public.work_orders
where part_name is not null
  and length(btrim(part_name)) > 0;

alter table public.work_orders
  drop constraint if exists work_orders_part_qty_positive;

alter table public.work_orders
  drop column if exists part_name,
  drop column if exists part_qty,
  drop column if exists part_source,
  drop column if exists part_ordered_on,
  drop column if exists part_expected_on;

/* ---- same gate as the parent ---- */
-- A part is a detail of a work order. It must not be reachable by anyone who
-- cannot read the work order it belongs to.
alter table public.work_order_parts enable row level security;

create policy "read work order parts"
  on public.work_order_parts for select to authenticated
  using (
    (select profiles.cockpit from profiles where profiles.id = auth.uid())
      = any (array['zo', 'raj', 'dane'])
  );

create policy "open work order parts"
  on public.work_order_parts for insert to authenticated
  with check (
    (select profiles.cockpit from profiles where profiles.id = auth.uid())
      = any (array['zo', 'raj', 'dane'])
  );

create policy "work on work order parts"
  on public.work_order_parts for update to authenticated
  using (
    (select profiles.cockpit from profiles where profiles.id = auth.uid())
      = any (array['zo', 'raj', 'dane'])
  )
  with check (
    (select profiles.cockpit from profiles where profiles.id = auth.uid())
      = any (array['zo', 'raj', 'dane'])
  );

-- work_orders has no delete policy on purpose - a job is history. A part is
-- not: Zo will mistype one, and the fix for that is removing the line, not
-- leaving a wrong part attached to the job forever.
create policy "remove work order parts"
  on public.work_order_parts for delete to authenticated
  using (
    (select profiles.cockpit from profiles where profiles.id = auth.uid())
      = any (array['zo', 'raj', 'dane'])
  );

comment on column public.work_order_parts.arrived_on is
    'The day the part turned up. Null means still outstanding, which is what the overdue flag counts.';