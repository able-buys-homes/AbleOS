-- 20260908100000_work_order_intake_fields.sql
--
-- Two fields the intake form asks for and the table had nowhere to put.
--
-- occupant_name is who Zo was told lives there, standing at the door. It is
-- deliberately separate from lots.tenant_name: the lease record and the person
-- who answered are not always the same, and the difference is worth keeping
-- rather than quietly overwriting one with the other.
--
-- opened_photo_path is the photo taken when the job is opened. The closing
-- photo already proves the work happened; this one proves what it looked like
-- before, which is what settles an argument about whether it was done.
alter table public.work_orders
add column if not exists occupant_name text,
add column if not exists opened_photo_path text;

comment on column public.work_orders.occupant_name is 'Who Zo was told lives there when the job was opened. Not the lease record - see lots.tenant_name for that.';