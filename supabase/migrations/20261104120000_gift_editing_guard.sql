-- ADR-002 / Risk #4: block editing a gift once it is reserved or purchased.
--
-- Before this migration `update_gifts` only verified list ownership, so the
-- owner could modify a gift that an Obdarowujący had already reserved. The
-- guard belongs in RLS so it cannot be bypassed by calling PostgREST directly.
--
-- Rules:
--   * old row (USING): owner of the list, status is not 'reserved', and no
--     reservation row exists (covers 'purchased', which also has a reservation);
--   * new row (WITH CHECK): same conditions, so an update cannot smuggle a
--     reserved / reserved-backed row past the policy.
--
-- Forward-only: the initial migration is already pushed; this is the repair.
-- Idempotent: ALTER POLICY replaces the definition in place.

alter policy update_gifts on public.gifts
  using (
    exists (
      select 1
      from public.gifts_lists gl
      where gl.id = gifts.list_id
        and gl.owner_id = auth.uid()
    )
    and status is distinct from 'reserved'
    and not exists (
      select 1 from public.reservations r where r.gift_id = gifts.id
    )
  )
  with check (
    exists (
      select 1
      from public.gifts_lists gl
      where gl.id = gifts.list_id
        and gl.owner_id = auth.uid()
    )
    and status is distinct from 'reserved'
    and not exists (
      select 1 from public.reservations r where r.gift_id = gifts.id
    )
  );
