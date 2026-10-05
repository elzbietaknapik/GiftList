-- F-01 (reservation-privacy-tests): make reservation_status usable for
-- authenticated WITHOUT exposing the reserver's identity.
--
-- Background: the initial migration (20261005113900) created
-- reservation_status with (security_invoker = true) while also applying
--   revoke all on public.reservations from anon, authenticated;
-- A security_invoker view checks the INVOKER's privileges on the base
-- table, so authenticated got permission denied (42501) and the view was
-- unusable. This forward migration repairs it without reopening the
-- identity column and WITHOUT touching the already-pushed initial
-- migration (forward-only per infra.md).
--
-- Enforcement stays in RLS + a column-limited grant: the table is still
-- closed for select *; only the identity-free columns of caller-visible
-- rows are readable.
--
-- Idempotent and additive. Safe to apply via `supabase db reset` /
-- `supabase db push`. Revert path: see
-- context/changes/reservation-privacy-tests/revert.sql.

-- 1) Column-limited read on the otherwise-closed reservations table.
--    Only the identity-free columns; reserver_user_id and id stay revoked,
--    so `select *` and `select reserver_user_id` still raise 42501.
grant select (gift_id, created_at, purchased_at) on public.reservations to authenticated;

-- 2) Row scope: only reservations on lists the caller owns or has joined.
--    A non-participant (no ownership, no membership) sees zero rows, which
--    is also the guard against cross-list row-count leakage.
create policy select_reservation_status on public.reservations
  for select to authenticated
  using (
    exists (
      select 1
      from public.gifts g
      join public.gifts_lists gl on gl.id = g.list_id
      where g.id = reservations.gift_id
        and (
          gl.owner_id = auth.uid()
          or exists (
            select 1 from public.list_members m
            where m.list_id = gl.id and m.user_id = auth.uid()
          )
        )
    )
  );

-- 3) Ensure the identity-free view is (re)declared with the security_invoker
--    semantics the policy relies on. The initial migration built the same
--    view; redeclare defensively so the active definition is unambiguous.
create or replace view public.reservation_status
  with (security_invoker = true) as
  select r.gift_id, r.created_at, r.purchased_at
  from public.reservations r;
grant select on public.reservation_status to authenticated;
