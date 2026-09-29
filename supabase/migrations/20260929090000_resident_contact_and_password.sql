-- The rest of what a resident can tell us about how to reach them, and
-- whether they have ever replaced the password the office handed them.
--
-- Phone is stored even though nothing sends texts: the office still needs to
-- ring people. Emergency contact is for the day a tech finds something wrong
-- and nobody answers the door.
--
-- password_changed_at, not a login counter. A counter would stop reminding
-- after one visit even if the resident is still on the office-issued
-- password - which staff know, and which may be written on a card. Null means
-- they have never changed it, and the portal keeps asking until they do.
alter table resident_accounts
  add column if not exists contact_phone text,
  add column if not exists emergency_name text,
  add column if not exists emergency_phone text,
  add column if not exists password_changed_at timestamptz;
