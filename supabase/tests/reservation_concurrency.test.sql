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
-- Connections: race_admin, race_a, race_b are opened here: race_admin is the
-- autocommit fixture/cleanup channel, race_a and race_b are the two race
-- sessions. dblink refuses passwordless connections from non-superusers, and
-- the pgTAP harness connects as `postgres`, which is NOT a superuser in this
-- image (pg_hba: `local all supabase_admin trust`). The file therefore
-- reconnects as `supabase_admin` first; the gate command stays
-- `npx supabase test db`.
--
-- Run: `npx supabase test db` (WSL). Assertion count is pinned to plan(11):
-- the race (two interleaved live transactions), the state it leaves behind,
-- the client-visible proof of who won, and a cheap sequential refusal.
--
-- Why not `throws_ok` on dblink_get_result for #4 (measured on this image):
--   * the async remote error surfaces at get_result with SQLSTATE P0001 but
--     an empty message, and pgTAP's throws_ok also compares errmsg, so it
--     fails even when the error is raised;
--   * get_result is timing dependent. In the same statement that commits the
--     winner (inside a DO block) the error was raised in every run; in a later
--     statement it was already dropped and the call quietly returned zero rows
--     in 5 of 5 runs.
-- So #4 reads the loser's result in a helper that catches the error, returns
-- its SQLSTATE, and asserts that with `is`. It sits at the same point in the
-- race as the get_result call would.
--
-- `set_config` is called with is_local = false: a local (`true`) setting is
-- discarded when the surrounding statement ends, so results recorded inside a
-- DO block would not be visible to the next (assertion) statement.

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

-- ===== Assertions (Phase 2: race + refusal) =====
-- plan(11) role map:
--   #1  race_admin and race_b connections opened
--   #2  winner's reserve_gift succeeded (no error)
--   #3  loser was blocked on a lock before the winner committed
--   #4  loser got the explicit P0001 refusal
--   #5  gift status is 'reserved'
--   #6  exactly one reservation row exists
--   #7  reservation identity == giver_a (winner)
--   #8  winner's my_reserved_gift_ids() contains the gift
--   #9  loser's my_reserved_gift_ids() does not contain the gift
--   #10 sequential refusal is P0001
--   #11 zero residue after cleanup

-- #1: both channels the race depends on are usable.
select is(
  (select x.n::text from dblink('race_admin', 'select 1::int as n') as x(n int)) || '|' ||
  (select x.n::text from dblink('race_b', 'select 1::int as n') as x(n int)),
  '1|1',
  '#1 race_admin and race_b connections open'
);

-- ===== Race with a state-based synchronization point =====
-- Pitfalls that shaped this design (verified against this image):
--   * dblink() and dblink_send_query() run a query in its own implicit
--     transaction that COMMITS as soon as it returns, so a row lock taken in
--     such a call is gone before the other side runs. The winner's lock must
--     therefore be held by an explicit transaction opened with
--     dblink_exec(conn, 'begin').
--   * Inside a multi-statement simple-Query message, set_config(..., true)
--     and `set local role` are rolled back when that message ends, so
--     `set_config(...); set local role ...; select reserve_gift(...)` runs
--     reserve_gift as the connecting superuser with no JWT claims. Wrapping
--     the identity switch and the RPC in ONE statement (a DO block) keeps
--     them in force for the RPC.
--   * dblink_exec rejects any query that returns rows, so the RPC is invoked
--     with PERFORM inside that DO block rather than a bare SELECT.

-- #2: winner (giver_a) opens an explicit transaction and calls reserve_gift,
-- which leaves the gifts row lock held and uncommitted. dblink_exec raises on
-- a remote error, and an error in a PL/pgSQL block without an exception
-- handler aborts the whole DO statement, so reaching the following statement
-- already means the call succeeded; the outcome is also recorded so #2 can
-- assert it without depending on that.
do $$
begin
  perform set_config('race.winner_ok', 'false', false);
  perform dblink_exec('race_a', 'begin');
  perform dblink_exec('race_a', $q$
    do $inner$
    begin
      perform set_config('request.jwt.claims',
        '{"sub":"cccccccc-cccc-cccc-cccc-cccccccccc02","role":"authenticated"}', true);
      set local role authenticated;
      perform public.reserve_gift('cccccccc-cccc-cccc-cccc-ccccccccccd1'::uuid);
    end
    $inner$;
  $q$);
  perform set_config('race.winner_ok', 'true', false);
end $$;

-- #3: loser (giver_b) sends the same DO block asynchronously while the
-- winner's transaction still holds the gifts row lock; the MAIN session polls
-- pg_stat_activity until the loser's backend waits on a lock. Ordering is
-- confirmed by STATE, never by time; an unconfirmed lock fails #3 with a
-- diagnostic warning instead of passing silently.
--
-- The poll loop runs in autocommit, outside the assertion DO block: a DO
-- statement's own block starts an implicit transaction, and dblink_get_result
-- (#4) raises the loser's error reliably only on the first get_result of an
-- implicit transaction. Keeping the poll out of that transaction keeps #4
-- deterministic. The loser is therefore dispatched in one statement and the
-- synchronization poll runs in the next one.
do $$
begin
  perform set_config('race.lock_observed', 'false', false);

  perform dblink_send_query('race_b', $q$
    do $inner$
    begin
      perform set_config('request.jwt.claims',
        '{"sub":"cccccccc-cccc-cccc-cccc-cccccccccc03","role":"authenticated"}', true);
      set local role authenticated;
      perform public.reserve_gift('cccccccc-cccc-cccc-cccc-ccccccccccd1'::uuid);
    end
    $inner$;
  $q$);
end $$;

do $$
declare
  v_blocked boolean := false;
  v_state   text;
  v_start   timestamptz := clock_timestamp();
  v_waited  double precision;
begin
  -- Bounded retry: ~200 iterations, ~10 s ceiling. pg_sleep is a poll
  -- interval, not the ordering condition; only the Lock wait state is.
  for i in 1..200 loop
    select exists (
      select 1 from pg_stat_activity a
       where a.application_name = 'race_b'
         and a.datid = (select oid from pg_database where datname = current_database())
         and a.wait_event_type = 'Lock'
    ) into v_blocked;
    exit when v_blocked;
    select a.state into v_state
      from pg_stat_activity a
     where a.application_name = 'race_b'
       and a.datid = (select oid from pg_database where datname = current_database());
    perform pg_sleep(0.05);
    perform pg_stat_clear_snapshot();
  end loop;

  v_waited := extract(epoch from clock_timestamp() - v_start) * 1000;
  perform set_config('race.lock_observed', v_blocked::text, false);
  perform set_config('race.wait_ms', round(v_waited)::text, false);

  if not v_blocked then
    perform set_config('race.diag',
      format('loser never blocked (state=%s, waited=%s ms)',
        coalesce(v_state, '<no backend>'), round(v_waited)::text), false);
    raise warning 'race: %', current_setting('race.diag');
  end if;
end $$;

select ok(
  coalesce(current_setting('race.winner_ok', true), '') = 'true',
  '#2 winner reserve_gift succeeded without error'
);

select ok(
  coalesce(current_setting('race.lock_observed', true), '') = 'true',
  '#3 loser blocked on lock before winner committed'
);

-- #4: winner commits; the loser's blocked UPDATE then re-evaluates the
-- `status = 'free'` predicate against the committed row, updates zero rows
-- and reserves nothing, so reserve_gift raises 'gift is not free' (P0001).
--
-- The loser's async result is read here, right after the commit releases it,
-- by a DO block that runs dblink_get_result inside an exception handler: on
-- this image the async remote error surfaces with SQLSTATE P0001 but an empty
-- message, which throws_ok would reject even when it did raise. The SQLSTATE
-- is stored in a session GUC (`false` = session-scoped, survives the
-- statement) because results written inside a DO block are not otherwise
-- visible to the asserting statement. See the header note.
select dblink_exec('race_a', 'commit');

do $$
declare
  v_sqlstate text := '';
begin
  begin
    perform * from dblink_get_result('race_b') as t(x text);
  exception when others then
    v_sqlstate := sqlstate;
  end;
  perform set_config('race.loser_sqlstate', v_sqlstate, false);
end $$;

select is(
  coalesce(current_setting('race.loser_sqlstate', true), '<empty>'),
  'P0001',
  '#4 loser refused with P0001'
);

-- Both race connections are closed from the main session here (disconnect
-- rolls back any open transaction), so a later aborted assertion cannot
-- leave them holding locks or fixture rows.
select dblink_disconnect('race_a');
select dblink_disconnect('race_b');

-- #5: gift status after the race.
select is(
  (select x.status from dblink(
     'race_admin',
     $q$ select status::text from public.gifts
          where id = 'cccccccc-cccc-cccc-cccc-ccccccccccd1'::uuid $q$
   ) as x(status text)),
  'reserved'::text,
  '#5 gift status is reserved'
);

-- #6: exactly one reservation for the gift.
select is(
  (select x.n from dblink(
     'race_admin',
     $q$ select count(*)::int from public.reservations
          where gift_id = 'cccccccc-cccc-cccc-cccc-ccccccccccd1'::uuid $q$
   ) as x(n int)),
  1,
  '#6 exactly one reservation exists'
);

-- #7: the reservation belongs to the winner (giver_a). Checked by the
-- privileged channel in the test only; the client contract stays closed.
select is(
  (select x.reserver::text from dblink(
     'race_admin',
     $q$ select reserver_user_id::text from public.reservations
          where gift_id = 'cccccccc-cccc-cccc-cccc-ccccccccccd1'::uuid $q$
   ) as x(reserver text)),
  'cccccccc-cccc-cccc-cccc-cccccccccc02'::text,
  '#7 reservation identity is the winner (giver_a)'
);

-- #8: winner sees the gift through the client-facing RPC. Identity switching
-- goes through the main session (local transaction) so request.jwt.claims is
-- visible to my_reserved_gift_ids()'s auth.uid().
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"cccccccc-cccc-cccc-cccc-cccccccccc02","role":"authenticated"}', true);
select is(
  'cccccccc-cccc-cccc-cccc-ccccccccccd1'::uuid = any(public.my_reserved_gift_ids()),
  true,
  '#8 winner my_reserved_gift_ids() contains the gift'
);
rollback;

-- #9: loser does not.
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"cccccccc-cccc-cccc-cccc-cccccccccc03","role":"authenticated"}', true);
select isnt(
  'cccccccc-cccc-cccc-cccc-ccccccccccd1'::uuid = any(public.my_reserved_gift_ids()),
  true,
  '#9 loser my_reserved_gift_ids() does not contain the gift'
);
rollback;

-- #10: sequential refusal — a member calls reserve_gift on the now-reserved
-- gift in the main session. Catches gate removal but not CAS vs
-- check-then-act; that distinction belongs to #4.
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"cccccccc-cccc-cccc-cccc-cccccccccc03","role":"authenticated"}', true);
select throws_ok(
  $q$ select public.reserve_gift('cccccccc-cccc-cccc-cccc-ccccccccccd1'::uuid) $q$,
  'P0001',
  NULL,
  '#10 sequential refusal is P0001'
);
rollback;

-- ===== Cleanup (through race_admin) BEFORE finish() so #11 can see it =====
-- Lists first: cascade removes gifts, memberships and reservations. Then
-- users. Identical to the entry cleanup and the post-finish teardown.
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

-- #11: zero residue after cleanup. Each marker row is grouped by its literal
-- name so the result is a fixed row set ('lists', ...), and its value is the
-- offending count (0 when clean).
select is_empty(
  $$ select m.marker, m.n from dblink(
       'race_admin',
       $q$
         select 'lists' as marker, count(*) as n from public.gifts_lists
          where id = 'cccccccc-cccc-cccc-cccc-ccccccccccc1'::uuid
         union all
         select 'users', count(*) from auth.users
          where id in ('cccccccc-cccc-cccc-cccc-cccccccccc01'::uuid,
                       'cccccccc-cccc-cccc-cccc-cccccccccc02'::uuid,
                       'cccccccc-cccc-cccc-cccc-cccccccccc03'::uuid)
         union all
         select 'gifts', count(*) from public.gifts
          where id = 'cccccccc-cccc-cccc-cccc-ccccccccccd1'::uuid
         union all
         select 'reservations', count(*) from public.reservations
          where gift_id = 'cccccccc-cccc-cccc-cccc-ccccccccccd1'::uuid
         union all
         select 'members', count(*) from public.list_members
          where list_id = 'cccccccc-cccc-cccc-cccc-ccccccccccc1'::uuid
       $q$
     ) as m(marker text, n bigint)
     where m.n <> 0 $$,
  '#11 zero residue after cleanup'
);

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

-- Drop the dblink connections opened by this session. race_a / race_b may
-- already have been closed by the #4 disconnects, so this tolerates a second
-- close (dblink_disconnect raises 08003 on an unknown connection) instead of
-- aborting the teardown.
select dblink_disconnect('race_admin');
do $$
begin
  perform dblink_disconnect('race_a');
exception when others then null;
end $$;
do $$
begin
  perform dblink_disconnect('race_b');
exception when others then null;
end $$;
