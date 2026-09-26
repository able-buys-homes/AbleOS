-- Two categories the portal already offers and the table could not accept.
-- Skirting and pest are real, recurring, budgetable trades in a park; folding
-- them into "other" would make that bucket useless for deciding where money
-- goes.
alter table work_orders drop constraint if exists work_orders_category_check;

alter table work_orders add constraint work_orders_category_check
  check (category = any (array[
    'plumbing','electrical','hvac','roof','skirting',
    'appliance','grounds','pest','other'
  ]));

-- What the portal asks and the table could not remember.
--
-- entry_permission and pets_on_site are nullable on purpose: an office-raised
-- job never asked, and false would be a claim we cannot support. Null means
-- nobody was asked; false means they said no.
alter table work_orders
  add column if not exists location text,
  add column if not exists preferred_window text,
  add column if not exists entry_permission boolean,
  add column if not exists pets_on_site boolean,
  add column if not exists opened_photo_paths text[] not null default '{}';

-- One photo was never enough - a tech needs the leak and the room it is in.
-- The old single column stays populated with the first photo so existing
-- screens keep working while they are moved across.
update work_orders
set opened_photo_paths = array[opened_photo_path]
where opened_photo_path is not null
  and coalesce(array_length(opened_photo_paths, 1), 0) = 0;
