# Verification record — reservation lifecycle, Phase 1 (risk #1)

> Plan source of truth: `context/changes/testing-reservation-lifecycle/plan.md`
> (§Phase 3). This record documents the executed green run, the residue
> check, and the mutation proof it verified.

## Environment

Docker Desktop is not installed on the Windows host, but Docker Engine runs
inside WSL (`Ubuntu-22.04`) with the local Supabase stack already up. The
default WSL Node is v12, which the Supabase CLI 2.x cannot load
(`SyntaxError: Unexpected token '?'`), so every command below runs under
Node 20 from `nvm`:

```
source ~/.nvm/nvm.sh      # node -v -> v20.20.2
npx supabase@2.122.0 ...  # -> supabase CLI 2.122.0
```

`npx supabase` (unpinned) resolves the same CLI; the pin only keeps the
record reproducible.

## Execution result — PASS (2026-10-30)

```
npx supabase@2.122.0 db reset
  Applying migration 20261005113900_initial_schema.sql...
  Applying migration 20261005153300_reservation_status_scope.sql...
  Seeding data from supabase/seed.sql...
  Finished supabase db reset on branch master.
```

Two consecutive `db test` runs on that freshly reset database, no reset in
between:

```
run 1: npx supabase@2.122.0 test db
  supabase/tests/reservation_concurrency.test.sql .. ok
  supabase/tests/reservation_privacy.test.sql ...... ok
  Files=2, Tests=28
  Result: PASS

run 2: npx supabase@2.122.0 test db
  supabase/tests/reservation_concurrency.test.sql .. ok
  supabase/tests/reservation_privacy.test.sql ...... ok
  Files=2, Tests=28
  Result: PASS
```

Assertion counts: `reservation_concurrency.test.sql` — 11 (`plan(11)`, risk
#1), `reservation_privacy.test.sql` — 17 (F-01 regression). The second run
also proves the new file leaves no fixture behind that would break its own
entry cleanup.

## Residue check after the run

Query through the same privileged channel the fixtures use
(`supabase_admin`), against the deterministic `cccccccc-...` UUIDs:

```
marker|count
lists|0
users|0
gifts|0
reservations|0
members|0
(5 rows)
```

The file's own assertion `#11 zero residue after cleanup` covers the same
state from inside pgTAP; this query is the independent post-run check.

## Mutation proof

`public.reserve_gift(uuid)` was replaced in the local database (migration
file untouched) with the same body minus the `and status = 'free'` predicate
on the conditional `update`. Then:

```
npx supabase@2.122.0 test db
  # Failed test 4: "#4 loser refused with P0001"
  #         have: 23505
  #         want: P0001
  # Failed test 10: "#10 sequential refusal is P0001"
  #       caught: 23505: duplicate key value violates unique constraint "reservations_gift_id_key"
  #       wanted: P0001
  Failed 2/11 subtests
  Result: FAIL
```

Both expected failures appeared: without the predicate the loser reaches the
`reservations.gift_id` unique guard, so it gets `23505` instead of the RPC's
explicit `P0001`. The original definition was then restored in the local
database and the suite went green again:

```
npx supabase@2.122.0 test db
  All tests successful.
  Files=2, Tests=28
  Result: PASS
```

Residue was re-checked after the mutation and restore runs: all five markers
still `0`. The migration definition was never edited.

## Gates

```
npx tsc --noEmit   -> exit 0
npx expo lint      -> exit 0 (no changes in src/)
```

## Ryzyka przeniesione

- The test needs local access to `dblink` as `supabase_admin` without a
  password (pg_hba `local all supabase_admin trust`). The pgTAP harness
  itself connects as `postgres`, which is not a superuser on this image, so
  the file reconnects with `\connect "dbname=postgres user=supabase_admin"`
  before opening its `dblink` sessions.
- Because of that dependency it runs only locally: it is part of
  `npx supabase test db`, not of the hosted project, and `dblink` is created
  in the test file only — never in a migration.
- The file cannot be wrapped in one `begin`/`rollback` like F-01: `dblink`
  sessions cannot see uncommitted fixtures, so fixtures and cleanup commit
  through the `race_admin` connection and the file cleans up on entry and
  exit.
- Ordering is proven by `pg_stat_activity` state (loser waiting on a lock),
  not by elapsed time; the bounded loop's `pg_sleep` is only a poll interval.
  A run that never observes the lock fails `#3` with a diagnostic warning.
