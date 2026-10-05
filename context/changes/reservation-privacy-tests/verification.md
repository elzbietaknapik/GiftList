# Verification record — F-01 `reservation-privacy-tests`

> Plan source of truth: `plan.md` (copy of
> `.kilo/plans/1791203567866-reservation-privacy-tests.md`). This record
> documents the expected green run; the actual run is gated on Docker
> (see "Execution gate").

## Execution gate (blocking)

Docker is **not** installed / not on PATH on the implementing machine:

```
> docker --version
docker : The term 'docker' is not recognized ...
```

`supabase start` / `supabase db reset` / `supabase test db` all require the
local Supabase stack, which requires Docker Desktop. Until a human installs
and starts Docker, the verification commands below cannot run locally.

This matches Plan Risk #1 ("Docker absent → tests authored but unrunnable")
and the handover: deliver the migration, the complete test file, and this
expected-output record. The authored artifacts below are ready; execution
is the only thing blocked.

## Prereq fixes already applied (Plan Task 3)

- `supabase/seed.sql` created (config.toml has `[db.seed] enabled = true`,
  `sql_paths = ["./seed.sql"]` but no seed file existed; `db reset` would
  have errored on the missing file). It is intentionally empty — the pgTAP
  harness creates its own fixtures inside a rolled-back transaction.
- Docker Desktop install is a **manual human gate**; it is not something a
  code change can satisfy.

## Verification commands (run after Docker is up)

```
npx supabase start          # pulls images first time
npx supabase db reset       # applies 20261005113900_initial_schema.sql +
                            # 20261005153300_reservation_status_scope.sql,
                            # then loads the (empty) seed
npx supabase test db        # runs supabase/tests/*.sql via pgTAP
# idempotency: run again, expect identical green
npx supabase test db
```

No `src/` files were touched by this change, so `npx expo lint` /
`npx tsc --noEmit` are unaffected (run only if `src/` is later modified).

## Expected `supabase db reset` behavior

Migrations apply in timestamp order. The new migration is additive
(grant + policy + `create or replace view`) and idempotent; it must not
error and must leave:

- `reservations` still `revoke all` from `anon, authenticated` (table-level
  closure preserved from the initial migration).
- A new column-level grant `select (gift_id, created_at, purchased_at) on
  public.reservations to authenticated` (identity columns `id`,
  `reserver_user_id` stay revoked).
- A new row-scoped policy `select_reservation_status` on `public.reservations`
  for `authenticated`.
- `reservation_status` re-declared `with (security_invoker = true)` exposing
  only `(gift_id, created_at, purchased_at)`.

## Expected `supabase test db` output (Plan DoD: all 17 green)

pgTAP emits one `ok N - <desc>` per assertion. The TAP sequence number is
the **execution order** in the test file; the description carries the plan's
`#N` tag. Expected:

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
Files=1, Tests=17,  N wallclock secs ( ... )
Result: PASS
```

The second `supabase test db` run must produce the same `Result: PASS` with
`Tests=17` — proving no cross-run residue (each file runs in its own
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
      exists; applied by `supabase db reset` (expected; pending Docker run).
- [x] `supabase/tests/reservation_privacy.test.sql` exists; `plan(17)`
      matches the 17 assertions; green run expected (pending Docker).
- [x] `anon`/`authenticated` still cannot read `reservations`
      (`select *` → 42501) — asserted by #3, #4, #5.
- [x] `reservation_status` works for owners/members, leaks no identity and
      no cross-list rows — asserted by #6–#11.
- [x] `reservations` and `list_members` absent from `supabase_realtime`;
      `gifts` present — asserted by #15–#17.
- [x] Only additive migration objects; the initial migration is untouched.
- [x] No `src/` change; lint/typecheck unaffected.

## Risks carried forward

- **Risk #1 (Docker absent)** — unblocked by installing Docker Desktop; this
  record makes the green run verifiable as soon as Docker is available.
- **Risk #2 (false green)** — mitigated by sanity assertions #1–#2 at the top
  of the member identity block; a broken switch fails loudly.
- **Risk #3 (schema/grant drift vs hosted)** — the repair is additive
  (grant + policy + `create or replace view`); after Docker is up, run
  `npx supabase db diff --linked` to confirm no unexpected diff before
  pushing to the linked hosted project.
- **Risk #5 (seed file missing)** — resolved by adding `supabase/seed.sql`.
- **Risk #6 (`plan(N)` drift)** — count is pinned to 17 and comments call out
  keeping it in sync; pgTAP fails loudly on mismatch.
