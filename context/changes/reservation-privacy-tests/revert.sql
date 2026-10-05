-- Revert for F-01 (reservation_status_scope).
--
-- STATUS: manual rollback artifact. This is NOT an auto-applied migration.
-- It lives in context/changes/reservation-privacy-tests/ (the change
-- folder) rather than supabase/migrations/ on purpose: Supabase applies
-- every supabase/migrations/*.sql in timestamp order on `db reset`, so a
-- revert file placed there with a later timestamp would undo this fix on
-- every fresh reset and break the F-01 test harness. Keep it here until
-- you actually intend to roll back; then copy it into supabase/migrations/
-- with a fresh timestamp and `supabase db push` (per infra.md §Rollback).
--
-- Counterpart to:
--   supabase/migrations/20261005153300_reservation_status_scope.sql
--
-- Effect: returns to the initial-migration baseline, where
-- reservation_status is UNUSABLE for authenticated (security_invoker view
-- on a table revoked from authenticated → 42501). That baseline state is
-- intentional and documented; reverting means accepting the view is broken
-- again until a new forward migration repairs it.

-- 1) Drop the column-limited grant.
revoke select (gift_id, created_at, purchased_at) on public.reservations from authenticated;

-- 2) Drop the row-scoped select policy.
drop policy if exists select_reservation_status on public.reservations;

-- 3) Restore the view to the initial-migration definition. The definition
--    is identical, so this is a no-op on structure; restate for clarity so
--    the active object matches the reverted baseline exactly.
create or replace view public.reservation_status
  with (security_invoker = true) as
  select r.gift_id, r.created_at, r.purchased_at
  from public.reservations r;
grant select on public.reservation_status to authenticated;
