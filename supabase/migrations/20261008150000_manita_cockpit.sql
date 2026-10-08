-- Raj, Oct 2026: a cockpit for Manita. No profile or login is created here.
alter table public.profiles drop constraint if exists profiles_cockpit_check;
alter table public.profiles add constraint profiles_cockpit_check
  check (cockpit = any (array['raj','dane','jeremiah','colton','zo','karen','rex','ellery','cornelius','manita']));
