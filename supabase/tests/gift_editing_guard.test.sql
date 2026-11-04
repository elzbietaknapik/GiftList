-- gift-editing-guard (gift-editing, Risk #4): the update_gifts RLS policy
-- must refuse owner edits once a gift is reserved, purchased, or backed by a
-- reservation row (`status = 'free'` with a reservation is an inconsistent
-- state, but the policy must still close it).
--
-- The client guard is covered by src/lib/gifts.test.ts (Vitest). This file
-- proves the database layer, so a direct PostgREST/SQL update cannot bypass it.
--
-- Run: `npx supabase test db` (requires local Docker). The whole file runs in
-- one transaction and rolls back, so fixtures never persist.
--
-- Assertion count is pinned to plan(8) — keep it in sync with the numbered
-- tests below. Identity switching uses `set local role authenticated` +
-- `set_config('request.jwt.claims', ..., true)`, the same pattern as F-01.

begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select plan(8);

-- ===== Fixtures (run as the connecting superuser; RLS bypassed here) =====
--   owner    dddd...01 owns L
--   member   dddd...02 joined L, not the owner
--   reserver dddd...03 holds the reservations
--   L dddd...10
--   G1 dddd...21  free, no reservation
--   G2 dddd...22  reserved
--   G3 dddd...23  purchased
--   G4 dddd...24  free but with a reservation row

create or replace function make_user(p_id uuid, p_email text)
returns void language plpgsql as $$
begin
  insert into auth.users (
    id, instance_id, aud, role, email, encrypted_password,
    email_confirmed_at, created_at, updated_at, is_anonymous
  ) values (
    p_id, '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', p_email, '',
    now(), now(), now(), false
  );
end $$;

select make_user('dddddddd-dddd-dddd-dddd-dddddddddd01'::uuid, 'edit-owner@x.test');
select make_user('dddddddd-dddd-dddd-dddd-dddddddddd02'::uuid, 'edit-member@x.test');
select make_user('dddddddd-dddd-dddd-dddd-dddddddddd03'::uuid, 'edit-reserver@x.test');

insert into public.gifts_lists (id, owner_id, name, share_token) values
  ('dddddddd-dddd-dddd-dddd-dddddddddd10'::uuid,
   'dddddddd-dddd-dddd-dddd-dddddddddd01'::uuid,
   'L', 'dddddddd-dddd-dddd-dddd-dddddddddd99'::uuid);

insert into public.list_members (list_id, user_id) values
  ('dddddddd-dddd-dddd-dddd-dddddddddd10'::uuid,
   'dddddddd-dddd-dddd-dddd-dddddddddd02'::uuid);

insert into public.gifts (id, list_id, name, link, price, status) values
  ('dddddddd-dddd-dddd-dddd-dddddddddd21'::uuid,
   'dddddddd-dddd-dddd-dddd-dddddddddd10'::uuid,
   'Free', 'https://free.test', 10.00, 'free'),
  ('dddddddd-dddd-dddd-dddd-dddddddddd22'::uuid,
   'dddddddd-dddd-dddd-dddd-dddddddddd10'::uuid,
   'Reserved', 'https://reserved.test', 20.00, 'reserved'),
  ('dddddddd-dddd-dddd-dddd-dddddddddd23'::uuid,
   'dddddddd-dddd-dddd-dddd-dddddddddd10'::uuid,
   'Purchased', 'https://purchased.test', 30.00, 'purchased'),
  ('dddddddd-dddd-dddd-dddd-dddddddddd24'::uuid,
   'dddddddd-dddd-dddd-dddd-dddddddddd10'::uuid,
   'FreeWithReservation', 'https://free-with-reservation.test', 40.00, 'free');

insert into public.reservations (gift_id, reserver_user_id, purchased_at) values
  ('dddddddd-dddd-dddd-dddd-dddddddddd22'::uuid,
   'dddddddd-dddd-dddd-dddd-dddddddddd03'::uuid, null),
  ('dddddddd-dddd-dddd-dddd-dddddddddd23'::uuid,
   'dddddddd-dddd-dddd-dddd-dddddddddd03'::uuid, now()),
  ('dddddddd-dddd-dddd-dddd-dddddddddd24'::uuid,
   'dddddddd-dddd-dddd-dddd-dddddddddd03'::uuid, null);

-- pgTAP asserts compile their argument as a subquery, where a data-modifying
-- CTE is illegal. This security-invoker helper runs the UPDATE top-level in
-- the caller's role, so RLS still decides the row count.
create or replace function public.try_update_gift(p_id uuid, p_name text)
returns bigint language plpgsql as $$
declare
  v_count bigint;
begin
  update public.gifts set name = p_name where id = p_id;
  get diagnostics v_count = row_count;
  return v_count;
end $$;

-- ===== Owner block =====
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"dddddddd-dddd-dddd-dddd-dddddddddd01","role":"authenticated"}',
  true
);

-- #1: the role/JWT switch took effect; a broken switch must fail loudly.
select is(
  current_user::text,
  'authenticated',
  '#1 role switched to authenticated (owner)'
);

-- #2: positive control — a free gift without a reservation is editable.
select is(
  public.try_update_gift('dddddddd-dddd-dddd-dddd-dddddddddd21'::uuid, 'Free edited'),
  1::bigint,
  '#2 owner can edit a free gift without a reservation'
);

-- #3: reserved gift — USING rejects the old row, so zero rows are updated.
select is(
  public.try_update_gift('dddddddd-dddd-dddd-dddd-dddddddddd22'::uuid, 'Reserved hacked'),
  0::bigint,
  '#3 owner cannot edit a reserved gift'
);

-- #4: purchased gift — its reservation row also blocks it.
select is(
  public.try_update_gift('dddddddd-dddd-dddd-dddd-dddddddddd23'::uuid, 'Purchased hacked'),
  0::bigint,
  '#4 owner cannot edit a purchased gift'
);

-- #5: free status but an existing reservation row — the extra NOT EXISTS
-- predicate, not the status check, has to block this one.
select is(
  public.try_update_gift('dddddddd-dddd-dddd-dddd-dddddddddd24'::uuid, 'FreeWithReservation hacked'),
  0::bigint,
  '#5 owner cannot edit a free gift that has a reservation'
);

-- #6: WITH CHECK blocks smuggling a reserved status onto a free gift, even
-- though USING accepts the old row.
select throws_ok(
  $q$ update public.gifts
         set status = 'reserved'
       where id = 'dddddddd-dddd-dddd-dddd-dddddddddd21'::uuid $q$,
  '42501',
  NULL,
  '#6 WITH CHECK rejects status = reserved'
);

reset role;

-- ===== Non-owner block =====
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"dddddddd-dddd-dddd-dddd-dddddddddd02","role":"authenticated"}',
  true
);

-- #7: a list member is not the owner; update_gifts allows owners only.
select is(
  public.try_update_gift('dddddddd-dddd-dddd-dddd-dddddddddd21'::uuid, 'Member hacked'),
  0::bigint,
  '#7 list member cannot edit an owner gift'
);

reset role;

-- #8: the refused updates left the protected rows untouched.
select is(
  (select name from public.gifts where id = 'dddddddd-dddd-dddd-dddd-dddddddddd22'::uuid),
  'Reserved'::text,
  '#8 reserved gift is unchanged after refused edits'
);

select * from finish();
rollback;
