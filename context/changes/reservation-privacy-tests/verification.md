# Verification record — F-01 `reservation-privacy-tests`

> Plan source of truth: `plan.md` (copy of
> `.kilo/plans/1791203567866-reservation-privacy-tests.md`). This record
> documents the executed green run and the artifacts it verified.

## Execution result — PASS (2026-10-23)

Docker Desktop is not installed on the Windows host, but Docker Engine
20.10.23 is available inside WSL (`Ubuntu-22.04`) with the local Supabase
stack already running. The verification was executed from WSL with Node 20
(`nvm`) against the same checkout:

```
node -v                     # v20.20.2
npx supabase@2.121.0 db reset
npx supabase@2.121.0 test db   # run 1: Result: PASS (Tests=17)
npx supabase@2.121.0 test db   # run 2: Result: PASS (Tests=17)
```

`db reset` applied both migrations and the empty seed without error:

```
Applying migration 20261005113900_initial_schema.sql...
Applying migration 20261005153300_reservation_status_scope.sql...
Seeding data from supabase/seed.sql...
Finished supabase db reset on branch foundation/reservation-privacy-tests.
```

Both `test db` runs produced identical output:

```
supabase/tests/reservation_privacy.test.sql .. ok
All tests successful.
Files=1, Tests=17,  0 wallclock secs
Result: PASS
```

The first executed run failed 3 of 17 assertions because of a pgTAP overload
pitfall: in the three-argument `throws_ok(sql, errcode, description)` form a
second argument exactly five bytes long is treated as `errcode` and the third
argument as `errmsg`, so the test description was compared against
`permission denied for table reservations`. Fixed by using the documented
four-argument form with `NULL` errmsg:
`throws_ok(sql, '42501', NULL, description)`. Re-run green twice.

## Prereq fixes applied (Plan Task 3)

- `supabase/seed.sql` created (config.toml has `[db.seed] enabled = true`,
  `sql_paths = ["./seed.sql"]` but no seed file existed; `db reset` would
  have errored on the missing file). It is intentionally empty — the pgTAP
  harness creates its own fixtures inside a rolled-back transaction.

## Verification commands

```
npx supabase start          # stack already running in WSL
npx supabase db reset       # applies 20261005113900_initial_schema.sql +
                            # 20261005153300_reservation_status_scope.sql,
                            # then loads the (empty) seed
npx supabase test db        # runs supabase/tests/*.sql via pgTAP
# idempotency: run again, expect identical green
npx supabase test db
```

No `src/` files were touched by this change, so `npx expo lint` /
`npx tsc --noEmit` are unaffected (run only if `src/` is later modified).

## `supabase db reset` behavior (observed)

Migrations apply in timestamp order. The new migration is additive
(grant + policy + `create or replace view`) and idempotent; it leaves:

- `reservations` still `revoke all` from `anon, authenticated` (table-level
  closure preserved from the initial migration).
- A new column-level grant `select (gift_id, created_at, purchased_at) on
  public.reservations to authenticated` (identity columns `id`,
  `reserver_user_id` stay revoked).
- A new row-scoped policy `select_reservation_status` on `public.reservations`
  for `authenticated`.
- `reservation_status` re-declared `with (security_invoker = true)` exposing
  only `(gift_id, created_at, purchased_at)`.

## `supabase test db` assertions (Plan DoD: all 17 green)

pgTAP emits one `ok N - <desc>` per assertion. The TAP sequence number is
the **execution order** in the test file; the description carries the plan's
`#N` tag.

```
supabase/tests/reservation_privacy.test.sql ..
1..17
ok 1 - #1 role switched to authenticated (member)
ok 2 - #2 auth.uid() reads member JWT sub
ok 3 - #5 member denied reserver_user_id column
ok 4 - #9 member sees only [G1] via reservation_status, not G2
ok 5 - #12 member my_reserved_gift_ids = [G1]
ok 6 - #4 owner denied select * from reservations
ok 7 - #10 owner sees only [G1], no cross-list leak
ok 8 - #13 owner my_reserved_gift_ids = {}
ok 9 - #14 stranger my_reserved_gift_ids = [G2] (own only, not global)
ok 10 - #11 loner sees 0 reservations (row-scoped policy)
ok 11 - #3 anon denied select * from reservations
ok 12 - #6 view hides reserver_user_id
ok 13 - #7 view exposes gift_id
ok 14 - #8 view exposes purchased_at
ok 15 - #15 reservations not in supabase_realtime
ok 16 - #16 gifts in supabase_realtime
ok 17 - #17 list_members not in supabase_realtime
ok
All tests successful.
Files=1, Tests=17
Result: PASS
```

The second `supabase test db` run produced the same `Result: PASS` with
`Tests=17`, proving no cross-run residue (each file runs in its own
rolled-back transaction).

## Why each assertion passes (design reference)

- **#1, #2** — sanity for the member block. `auth.uid()` reads
  `request.jwt.claims->>'sub'` from the GUC set by `set_config(..., true)`,
  not a DB session. Failing here means a broken switch (Plan Risk #2), not a
  silent green.
- **#3, #4, #5** — `reservations` is `revoke all` from `anon, authenticated`
  (initial migration) and the forward migration grants only
  `(gift_id, created_at, purchased_at)`. `select *` needs all 5 columns → 42501;
  `select reserver_user_id` → 42501; anon has no grant at all → 42501.
- **#6, #7, #8** — the view definition omits `reserver_user_id`.
- **#9, #10, #11** — `reservation_status` is `security_invoker`, so the base
  table's RLS + column grant govern. The `select_reservation_status` policy
  row-scopes to reservations on lists the caller owns or joined; the gifts
  RLS (`select_gifts`) provides defense-in-depth (hides gifts the caller
  can't see). Loner (#11) seeing `0` is the regression guard: a
  column-privilege-only (un-row-scoped) policy would let loner count G1+G2.
- **#12, #13, #14** — `my_reserved_gift_ids()` is security-definer and filters
  `reserver_user_id = auth.uid()`. Returns `coalesce(array_agg(gift_id), '{}')`
  → `'{}'::uuid[]` for owners who reserved nothing (#13).
- **#15, #16, #17** — the initial migration sets the realtime publication to
  only `public.gifts`; `reservations` (identity) and `list_members` are absent,
  so identity cannot ride a broadcast (infra.md Risk #6).

## Fallbacks (Plan Task 2, only if a run fails)

1. **pgTAP not callable as `authenticated` in `extensions`** — change
   `create extension if not exists pgtap with schema extensions` →
   `with schema public` in the test file, and set
   `search_path = public;` (drop `extensions`). The `extensions` schema is
   documented as "accessible to public by default" by Supabase, so this is
   unlikely, but the one-line switch is documented. Do NOT push a local
   pgtap-enabling migration to the linked hosted project.

2. **`auth.users` insert fails on a NOT NULL column without a default** in a
   newer Supabase auth schema — add the offending column to `make_user()`
   in the test file. Because the whole file runs in one transaction, a fixture
   failure is loud (the file aborts), never a false green.

3. **`create extension pgtap` fails entirely** — Supabase's local image ships
   pgTAP and `supabase test db` auto-runs
   `create extension if not exists pgtap with schema extensions`; if a custom
   image lacks it, add a local-only migration installing pgTAP and never
   push it to the linked hosted project.

## DoD checklist (Plan §DoD) — mapped to artifacts

- [x] `supabase/migrations/20261005153300_reservation_status_scope.sql`
      exists; applied by `supabase db reset` (verified green).
- [x] `supabase/tests/reservation_privacy.test.sql` exists; `plan(17)`
      matches the 17 assertions; green twice on a freshly reset DB.
- [x] `anon`/`authenticated` still cannot read `reservations`
      (`select *` → 42501) — asserted by #3, #4, #5.
- [x] `reservation_status` works for owners/members, leaks no identity and
      no cross-list rows — asserted by #6–#11.
- [x] `reservations` and `list_members` absent from `supabase_realtime`;
      `gifts` present — asserted by #15–#17.
- [x] Only additive migration objects; the initial migration is untouched.
- [x] No `src/` change; lint/typecheck unaffected.

## Risks carried forward

- **Risk #1 (Docker absent on Windows host)** — resolved for execution by
  using Docker Engine inside WSL. Local CLI verification must run from WSL
  (`npx supabase ...`); the Windows shell alone still has no Docker.
- **Risk #2 (false green)** — mitigated by sanity assertions #1–#2 at the top
  of the member identity block; a broken switch fails loudly.
- **Risk #3 (schema/grant drift vs hosted)** — the repair is additive
  (grant + policy + `create or replace view`). `npx supabase db diff --linked`
  could not be run here because the CLI has no access token
  (`supabase login` / `SUPABASE_ACCESS_TOKEN` is a manual gate). Run it before
  pushing the migration to the linked hosted project.
- **Risk #5 (seed file missing)** — resolved by adding `supabase/seed.sql`.
- **Risk #6 (`plan(N)` drift)** — count is pinned to 17 and comments call out
  keeping it in sync; pgTAP fails loudly on mismatch.
