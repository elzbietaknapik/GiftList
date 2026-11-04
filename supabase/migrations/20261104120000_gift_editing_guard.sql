-- ADR-002 / Risk #4: block editing a gift once it is reserved or purchased.
--
-- Before this migration `update_gifts` only verified list ownership, so the
-- owner could modify a gift that an Obdarowujący had already reserved. The
-- guard belongs in RLS so it cannot be bypassed by calling PostgREST directly.
--
-- Rules:
--   * old row (USING): owner of the list, status is 'free', and no reservation
--     row exists (covers 'purchased', which also has a reservation);
--   * new row (WITH CHECK): same conditions, so an update cannot smuggle a
--     reserved / reserved-backed row past the policy.
--
-- Why a SECURITY DEFINER helper: `reservations` has its own RLS policy that
-- reads `gifts`. Calling a subquery on `reservations` directly from a `gifts`
-- policy makes PostgreSQL report "infinite recursion detected in policy for
-- relation gifts". `gift_has_reservation` runs as its owner (the table owner),
-- so it bypasses that policy, and it exposes only a boolean — never the
-- reserving identity.
--
-- Forward-only: the initial migration is already pushed; this is the repair.
-- Idempotent: CREATE OR REPLACE + ALTER POLICY replace the definitions in place.

create or replace function public.gift_has_reservation(p_gift_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.reservations r where r.gift_id = p_gift_id
  );
$$;

revoke all on function public.gift_has_reservation(uuid) from public;
grant execute on function public.gift_has_reservation(uuid) to authenticated;

alter policy update_gifts on public.gifts
  using (
    exists (
      select 1
      from public.gifts_lists gl
      where gl.id = gifts.list_id
        and gl.owner_id = auth.uid()
    )
    and status = 'free'
    and not public.gift_has_reservation(gifts.id)
  )
  with check (
    exists (
      select 1
      from public.gifts_lists gl
      where gl.id = gifts.list_id
        and gl.owner_id = auth.uid()
    )
    and status = 'free'
    and not public.gift_has_reservation(gifts.id)
  );
