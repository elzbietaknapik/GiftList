-- reservation-concurrency (testing-reservation-lifecycle, Phase 1): harness
-- for the two-givers-race risk (#1).
--
-- Proves that when two gift-givers call reserve_gift() on the same free
-- gift concurrently, exactly one wins, the loser gets an explicit P0001
-- refusal, and exactly one reservation with the winner's identity remains.
-- The decisive proof needs two real, interleaved transactions, so this file
-- drives them over dblink connections rather than sequential calls.
--
-- Fixture model differs from F-01 on purpose:
--   * dblink sessions do NOT see uncommitted data from the main session, so
--     every fixture (auth.users, list, memberships, gift) is inserted through
--     the dedicated `race_admin` dblink connection in autocommit mode.
--   * Because those commits are independent, this file is NOT wrapped in a
--     begin/rollback; cleanup runs on entry and on exit through race_admin and
--     is idempotent.
--   * UUIDs live in the `cccccccc-...` space so the file can run alongside
--     F-01 (which uses 1111..8888 and share tokens aaaa../bbbb..) without
--     colliding.
--
-- Connections: race_admin, race_a, race_b are opened here so Phase 2 can use
-- them. dblink refuses passwordless connections from non-superusers, and the
-- pgTAP harness connects as `postgres`, which is NOT a superuser in this image
-- (pg_hba: `local all supabase_admin trust`). The file therefore reconnects as
-- `supabase_admin` first; the gate command stays `npx supabase test db`.
--
-- Run: `npx supabase test db` (WSL). Assertion count is pinned to plan(11);
-- the assertion body is intentionally empty in Phase 1 and filled by Phase 2,
-- so this file is expected to report a plan/assertion mismatch until then.

\connect "dbname=postgres user=supabase_admin"

create extension if not exists dblink with schema extensions;
set search_path = public, extensions;

select plan(11);

-- ===== Deterministic fixture identities (cccccccc-... namespace) =====
--   owner    cccc...01 owns L
--   giver_a  cccc...02 member of L, wins the race
--   giver_b  cccc...03 member of L, loses the race
--   L cccc...c1   G cccc...d1   share token cccc...aa

-- ===== Open the dblink connections (kept usable for Phase 2) =====
-- race_admin: autocommit fixture/cleanup channel.
-- race_a / race_b: the two race sessions; application_name lets the Phase 2
-- synchronization loop identify the loser's backend in pg_stat_activity.
select dblink_connect('race_admin', 'dbname=postgres user=supabase_admin');
select dblink_connect('race_a', 'dbname=postgres user=supabase_admin application_name=race_a');
select dblink_connect('race_b', 'dbname=postgres user=supabase_admin application_name=race_b');

-- ===== Idempotent cleanup on entry (through race_admin) =====
-- Delete lists first: on delete cascade removes gifts, memberships and
-- reservations. Then delete the test users.
select dblink_exec('race_admin', $$
  delete from public.gifts_lists
   where id in (
     'cccccccc-cccc-cccc-cccc-ccccccccccc1'::uuid
   );
$$);
select dblink_exec('race_admin', $$
  delete from auth.users
   where id in (
     'cccccccc-cccc-cccc-cccc-cccccccccc01'::uuid,
     'cccccccc-cccc-cccc-cccc-cccccccccc02'::uuid,
     'cccccccc-cccc-cccc-cccc-cccccccccc03'::uuid
   );
$$);

-- ===== Fixtures (through race_admin, autocommit -> visible to all) =====
-- auth.users, following the make_user column set from F-01 (self-contained;
-- no dependency on that file). auth.uid() reads JWT claims, so no password
-- or session is required.
select dblink_exec('race_admin', format(
  $f$insert into auth.users (
    id, instance_id, aud, role, email, encrypted_password,
    email_confirmed_at, created_at, updated_at, is_anonymous
  ) values (
    %L, '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', %L, '',
    now(), now(), now(), false
  )$f$,
  'cccccccc-cccc-cccc-cccc-cccccccccc01'::text, 'cowner@x.test'::text));
select dblink_exec('race_admin', format(
  $f$insert into auth.users (
    id, instance_id, aud, role, email, encrypted_password,
    email_confirmed_at, created_at, updated_at, is_anonymous
  ) values (
    %L, '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', %L, '',
    now(), now(), now(), false
  )$f$,
  'cccccccc-cccc-cccc-cccc-cccccccccc02'::text, 'cgiver_a@x.test'::text));
select dblink_exec('race_admin', format(
  $f$insert into auth.users (
    id, instance_id, aud, role, email, encrypted_password,
    email_confirmed_at, created_at, updated_at, is_anonymous
  ) values (
    %L, '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', %L, '',
    now(), now(), now(), false
  )$f$,
  'cccccccc-cccc-cccc-cccc-cccccccccc03'::text, 'cgiver_b@x.test'::text));

-- The list, owned by owner (role `supabase_admin` bypasses RLS in the remote
-- session too, since race_admin connects as supabase_admin).
select dblink_exec('race_admin', format(
  $f$insert into public.gifts_lists (id, owner_id, name, share_token)
  values (%L, %L, 'L', %L)$f$,
  'cccccccc-cccc-cccc-cccc-ccccccccccc1'::text,
  'cccccccc-cccc-cccc-cccc-cccccccccc01'::text,
  'cccccccc-cccc-cccc-cccc-ccccccccccaa'::text));

-- One free gift on the list.
select dblink_exec('race_admin', format(
  $f$insert into public.gifts (id, list_id, name, link, price)
  values (%L, %L, 'G', 'https://cg.test', 10.00)$f$,
  'cccccccc-cccc-cccc-cccc-ccccccccccd1'::text,
  'cccccccc-cccc-cccc-cccc-ccccccccccc1'::text));

-- Memberships: giver_a and giver_b joined the list.
select dblink_exec('race_admin', format(
  $f$insert into public.list_members (list_id, user_id)
  values (%L, %L)$f$,
  'cccccccc-cccc-cccc-cccc-ccccccccccc1'::text,
  'cccccccc-cccc-cccc-cccc-cccccccccc02'::text));
select dblink_exec('race_admin', format(
  $f$insert into public.list_members (list_id, user_id)
  values (%L, %L)$f$,
  'cccccccc-cccc-cccc-cccc-ccccccccccc1'::text,
  'cccccccc-cccc-cccc-cccc-cccccccccc03'::text));

-- ===== Assertions (Phase 2 fills the 11 assertions here) =====

select * from finish();

-- ===== Teardown (through race_admin, idempotent) =====
select dblink_exec('race_admin', $$
  delete from public.gifts_lists
   where id in (
     'cccccccc-cccc-cccc-cccc-ccccccccccc1'::uuid
   );
$$);
select dblink_exec('race_admin', $$
  delete from auth.users
   where id in (
     'cccccccc-cccc-cccc-cccc-cccccccccc01'::uuid,
     'cccccccc-cccc-cccc-cccc-cccccccccc02'::uuid,
     'cccccccc-cccc-cccc-cccc-cccccccccc03'::uuid
   );
$$);

-- Drop the dblink connections opened by this session.
select dblink_disconnect('race_admin');
select dblink_disconnect('race_a');
select dblink_disconnect('race_b');
