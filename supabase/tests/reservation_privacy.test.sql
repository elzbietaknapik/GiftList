-- F-01 (reservation-privacy-tests): privacy harness.
--
-- Proves the reserving identity never leaks through any client-reachable
-- path: direct table reads (reservations), the reservation_status view,
-- the my_reserved_gift_ids() RPC, and the realtime publication set.
-- Identity switching is done with `set local role` + `set_config(
-- 'request.jwt.claims', ..., true)` because `auth.uid()` reads JWT claims
-- from the GUC, not a DB session.
--
-- Run: `npx supabase test db` (requires local Docker). Each run is wrapped
-- in a transaction and rolled back, so fixtures never persist.
--
-- Assertion count is pinned to plan(17) — keep it in sync with the numbered
-- tests below. pgTAP is created `with schema extensions` (Supabase docs
-- convention; the extensions schema is accessible to public/authenticated).
-- `supabase test db` auto-enables pgtap; the explicit `create extension if
-- not exists` keeps the file self-contained when run another way.
--
-- Fallbacks (documented in context/changes/reservation-privacy-tests/verification.md):
--   * If `authenticated` cannot call pgTAP helpers in `extensions`,
--     change `with schema extensions` -> `with schema public` and adjust
--     search_path to `public` only.
--   * If the auth.users insert fails on a newer NOT NULL column without a
--     default, add the column to make_user() — the file runs in one
--     transaction, so a fixture failure is loud, never false-green.

begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select plan(17);

-- ===== Fixtures (run as the connecting superuser; RLS bypassed here) =====
-- Deterministic UUIDs so every assertion is exact.
--   owner    11111111-... owns L1
--   member   22222222-... joined L1, reserves G1
--   stranger 33333333-... owns L2, reserves G2
--   loner    44444444-... no access to any list
--   L1 7777...  G1 5555...   L2 8888...  G2 6666...

-- Insert auth.users with the NOT NULL columns that lack defaults.
-- auth.uid() reads JWT claims, so no password/session is required.
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

select make_user('11111111-1111-1111-1111-111111111111'::uuid, 'owner@x.test');
select make_user('22222222-2222-2222-2222-222222222222'::uuid, 'member@x.test');
select make_user('33333333-3333-3333-3333-333333333333'::uuid, 'stranger@x.test');
select make_user('44444444-4444-4444-4444-444444444444'::uuid, 'loner@x.test');

-- Lists (superuser bypasses RLS).
insert into public.gifts_lists (id, owner_id, name, share_token) values
  ('77777777-7777-7777-7777-777777777777'::uuid, '11111111-1111-1111-1111-111111111111'::uuid, 'L1', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid),
  ('88888888-8888-8888-8888-888888888888'::uuid, '33333333-3333-3333-3333-333333333333'::uuid, 'L2', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'::uuid);

-- Gifts.
insert into public.gifts (id, list_id, name, link, price) values
  ('55555555-5555-5555-5555-555555555555'::uuid, '77777777-7777-7777-7777-777777777777'::uuid, 'G1', 'https://g1.test', 10.00),
  ('66666666-6666-6666-6666-666666666666'::uuid, '88888888-8888-8888-8888-888888888888'::uuid, 'G2', 'https://g2.test', 20.00);

-- Membership: member joined L1.
insert into public.list_members (list_id, user_id)
values ('77777777-7777-7777-7777-777777777777'::uuid, '22222222-2222-2222-2222-222222222222'::uuid);

-- Reservations: the reservations table is revoke-all, so go through the
-- security-definer RPC, which stamps reserver_user_id = auth.uid() (this
-- is what my_reserved_gift_ids() asserts on later).
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
select public.reserve_gift('55555555-5555-5555-5555-555555555555'::uuid);
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}', true);
select public.reserve_gift('66666666-6666-6666-6666-666666666666'::uuid);
reset role;

-- ===== Privacy / identity assertions =====

-- member block: sanity (#1, #2) so a broken switch fails loudly, then
-- identity-column denial (#5), view scope (#9), own-reservations RPC (#12).
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
select is(current_user::text, 'authenticated', '#1 role switched to authenticated (member)');
select is(auth.uid(), '22222222-2222-2222-2222-222222222222'::uuid, '#2 auth.uid() reads member JWT sub');
-- 4-arg throws_ok with NULL errmsg asserts the SQLSTATE only; the 3-arg form
-- with a five-byte second argument treats the third argument as errmsg.
select throws_ok('select reserver_user_id from public.reservations', '42501', NULL, '#5 member denied reserver_user_id column');
select is(
  (select array_agg(gift_id order by gift_id) from public.reservation_status),
  ARRAY['55555555-5555-5555-5555-555555555555']::uuid[],
  '#9 member sees only [G1] via reservation_status, not G2'
);
select is(
  public.my_reserved_gift_ids(),
  ARRAY['55555555-5555-5555-5555-555555555555']::uuid[],
  '#12 member my_reserved_gift_ids = [G1]'
);
reset role;

-- owner block: no table read (#4), no cross-list leak (#10), no own
-- reservations (#13).
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
select throws_ok('select * from public.reservations', '42501', NULL, '#4 owner denied select * from reservations');
select is(
  (select array_agg(gift_id order by gift_id) from public.reservation_status),
  ARRAY['55555555-5555-5555-5555-555555555555']::uuid[],
  '#10 owner sees only [G1], no cross-list leak'
);
select is(
  public.my_reserved_gift_ids(),
  '{}'::uuid[],
  '#13 owner my_reserved_gift_ids = {}'
);
reset role;

-- stranger block: own-only, not global (#14).
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}', true);
select is(
  public.my_reserved_gift_ids(),
  ARRAY['66666666-6666-6666-6666-666666666666']::uuid[],
  '#14 stranger my_reserved_gift_ids = [G2] (own only, not global)'
);
reset role;

-- loner block: a non-participant sees nothing through the view (#11). This
-- also catches a column-privilege-only regression: if select_reservation_status
-- were not row-scoped, loner would see G1+G2.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"44444444-4444-4444-4444-444444444444","role":"authenticated"}', true);
select is(
  (select count(*) from public.reservation_status),
  0::bigint,
  '#11 loner sees 0 reservations (row-scoped policy)'
);
reset role;

-- anon block: anon has revoke all + no policy, so the table is fully closed (#3).
set local role anon;
select throws_ok('select * from public.reservations', '42501', NULL, '#3 anon denied select * from reservations');
reset role;

-- ===== View shape / scoping (run as superuser; reads pg_attribute) =====
select hasnt_column('public', 'reservation_status', 'reserver_user_id', '#6 view hides reserver_user_id');
select has_column('public', 'reservation_status', 'gift_id', '#7 view exposes gift_id');
select has_column('public', 'reservation_status', 'purchased_at', '#8 view exposes purchased_at');

-- ===== Realtime publication (identity must not ride a broadcast) =====
select is_empty(
  $$ select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='reservations' $$,
  '#15 reservations not in supabase_realtime'
);
select isnt_empty(
  $$ select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='gifts' $$,
  '#16 gifts in supabase_realtime'
);
select is_empty(
  $$ select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='list_members' $$,
  '#17 list_members not in supabase_realtime'
);

select * from finish();
rollback;
