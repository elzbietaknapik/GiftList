# Impl review — reservation-privacy-tests (F-01)

Reviewed: `context/changes/reservation-privacy-tests/plan.md`,
`revert.sql`, `verification.md`, and the landed artifacts
`supabase/migrations/20261005153300_reservation_status_scope.sql`,
`supabase/tests/reservation_privacy.test.sql`, `supabase/seed.sql`.
Verdict: **APPROVE WITH FOLLOW-UPS** (F-01 DoD met; one high-severity
follow-up required before S-04).
Date: 2026-10-23

## Execution evidence

```
npx supabase db reset        # initial + forward migration + empty seed: OK
npx supabase test db         # 17/17 PASS (run 1)
npx supabase test db         # 17/17 PASS (run 2, idempotency)
npx supabase test db         # 17/17 PASS (after adversarial probes)
```

Adversarial probes against the live local DB (all fixture mutations inside
rolled-back transactions):

- As `member`: `select reserver_user_id`, `where reserver_user_id = …`,
  `order by reserver_user_id`, whole-row (`select r`), and `to_jsonb(r)`
  all fail with `42501` — no identity oracle through projection, predicate,
  ordering, or row serialization.
- As `anon`: `select *`, `select gift_id`, `count(*)` on `reservations`, and
  `select *`, `update`, `delete`, `insert` on `reservation_status` all fail
  with `42501` (base-table privileges deny through the `security_invoker`
  view).
- As `loner`: table count = 0, view count = 0, RPC = `{}`.
- Column grants: only `(gift_id, created_at, purchased_at)` for
  `authenticated`; `reserver_user_id` and `id` remain revoked; no table-level
  grants for `anon`/`authenticated`.
- Policy `select_reservation_status` is a permissive SELECT policy for
  `authenticated` with the expected row-scope expression.
- Re-applying the forward migration fails:
  `policy "select_reservation_status" … already exists` (42710).

No active identity leak was found in the tested paths.

## Findings and triage

### 1. HIGH — `anon` retains EXECUTE on every RPC and ALL grants on the view

Evidence:

```
pg_proc.proacl = {postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}
  for open_shared_list, reserve_gift, mark_gift_purchased, my_reserved_gift_ids

pg_class.relacl (reservation_status) = {postgres=arwdDxtm/postgres,anon=arwdDxtm/postgres,...}
has_function_privilege('anon','public.my_reserved_gift_ids()','execute') = true
has_table_privilege('anon','public.reservation_status','select')          = true
```

Root cause: Supabase's default privileges in `public` grant explicitly to
`anon`/`authenticated`/`service_role`. `revoke all … from public`
(`20261005113900_initial_schema.sql:135-136`) removes only PUBLIC grants, not
the explicit `anon` grant. The forward migration fixes the `reservations`
table (the plan's table-specific "anon remains fully revoked" note is true)
but never revokes `anon` from the view or the functions.

Current exploitability: **no identity leak proven**. Probes with real fixtures
show `anon` `my_reserved_gift_ids()` = `{}`, `open_shared_list(valid_token)`
aborts with `23502` (inserts `NULL` user_id), `reserve_gift` raises
`no access`, and no rows/state change. It is still a least-privilege
violation and a latent privacy risk: S-04/S-05 will wire these RPCs into the
client, and the harness claims to cover "any client-reachable path".

Decision: **FIX BEFORE S-04** (recommended as a second forward migration; do
not edit the applied migration).

```sql
revoke all on function public.open_shared_list(uuid), public.reserve_gift(uuid),
                 public.mark_gift_purchased(uuid), public.my_reserved_gift_ids()
  from anon;

revoke all on public.reservation_status from anon;

-- keep SELECT for authenticated; remove the default-ACL write bits
revoke insert, update, delete, truncate, references, trigger
  on public.reservation_status from authenticated;
grant select on public.reservation_status to authenticated;
```

Add pgTAP assertions (and update `plan(N)`):

```sql
select is(has_function_privilege('anon','public.my_reserved_gift_ids()','execute'), false, '#18 anon cannot execute my_reserved_gift_ids');
select is(has_function_privilege('anon','public.reserve_gift(uuid)','execute'), false, '#19 anon cannot execute reserve_gift');
select is(has_function_privilege('anon','public.mark_gift_purchased(uuid)','execute'), false, '#20 anon cannot execute mark_gift_purchased');
select is(has_function_privilege('anon','public.open_shared_list(uuid)','execute'), false, '#21 anon cannot execute open_shared_list');
select is(has_table_privilege('anon','public.reservation_status','select'), false, '#22 anon cannot read the view');
select is(has_table_privilege('authenticated','public.reservation_status','update'), false, '#23 authenticated cannot write through the view');
```

Note: `revert.sql` restores the baseline; if this hardening lands, the revert
must re-grant `anon` to return to the exact baseline (document that the
baseline includes the anon grants).

### 2. MEDIUM — the migration is not idempotent (header claims it is)

`20261005153300_reservation_status_scope.sql:17` says "Idempotent and
additive", but `create policy select_reservation_status` (line 29) has no
`if not exists` (Postgres has none for policies). Re-applying the file fails
with `42710 policy … already exists`.

Decision: **FIX NOW** (one line, keeps the claim true and makes partial
re-runs safe).

```sql
drop policy if exists select_reservation_status on public.reservations;
create policy select_reservation_status …;
```

### 3. MEDIUM — test gaps that would miss a future privacy regression

- `#3` tests only `select *` as `anon`
  (`reservation_privacy.test.sql:151`). A partial column grant to `anon`
  (e.g. `grant select (gift_id)`) still makes `select *` fail while allowing
  `select gift_id` / `count(*)`. Add `throws_ok('select gift_id …', '42501',
  NULL, …)` and/or `has_column_privilege('anon', …) = false`.
- No stranger assertion on `reservation_status`; `#14` covers only the RPC.
  Add a stranger view assertion (`array_agg = [G2]`) to pin cross-list scope
  on the view too.
- No explicit predicate-oracle test. Manual probes show
  `where reserver_user_id = …` → `42501`; pin it in the harness so a future
  grant change cannot silently create an identity oracle.
- The `anon` block inherits the loner `request.jwt.claims` GUC (no
  `set_config` after `set local role anon` at line 150). Today `#3` is
  privilege-based and unaffected, but any future anon RPC assertion would run
  with `auth.uid()` = loner. Set `{"role":"anon"}` (or clear the GUC) for a
  true anonymous context.

Decision: **FIX NOW** for the anon column/catalog assertions and anon claims
hygiene (they are cheap and directly protect the invariant);
**FOLLOW-UP** for the stranger view assertion.

### 4. LOW — `my_reserved_gift_ids()` has no defined ordering

`20261005113900_initial_schema.sql:131` uses `array_agg(gift_id)` without
`ORDER BY`. With more than one reservation the array order is
nondeterministic; current tests use one element so they cannot catch it.
If clients compare arrays or rely on order, add
`array_agg(gift_id ORDER BY gift_id)` (or `created_at, gift_id`) and a
two-reservation test.

Decision: **FOLLOW-UP** unless the UI compares arrays.

### 5. LOW — RLS performance: `auth.uid()` not wrapped in a subquery

The policy calls `auth.uid()` per row (`20261005153300…sql:36,41`). Supabase's
recommended pattern is `(select auth.uid())` so the planner caches it in an
InitPlan. Index coverage is otherwise good: `gifts(id)` PK, `gifts(list_id)`
index, `gifts_lists(id)` PK, `list_members(list_id,user_id)` PK,
`reservations(gift_id)` unique. At MVP scale this is negligible; revisit with
`EXPLAIN ANALYZE` if lists grow.

Decision: **ACCEPT for MVP** (note for the scale pass).

### 6. LOW — documentation inconsistency on Realtime

`context/foundation/infrastructure.md:124` says the publication should cover
`gifts` and `reservations`; the migration and roadmap decision 1 publish only
`gifts`, and `#15` asserts `reservations` is absent. The test is the correct
privacy choice (publishing `reservations` would broadcast identity unless
Realtime RLS is proven). Correct the infra doc so a future engineer does not
"fix" the test by publishing `reservations`.

Decision: **FIX NOW** (docs only).

### 7. LOW — data minimization in the view

`reservation_status` exposes `created_at` and `purchased_at`
(`20261005153300…sql:52`). The PRD requires status visibility, not reservation
timestamps; `created_at` adds a timing-inference surface without a stated
requirement. Consider dropping it from the view/grant if the UI does not need
it. Product decision, not a blocker.

Decision: **ACCEPT** (documented trade-off).

### 8. Adjacent / out of scope — owner can UPDATE `gifts.status`

The initial `update_gifts` policy lets the owner update every gift column,
including `status`. Flipping a reserved gift back to `free` makes the UI
inconsistent; a subsequent `reserve_gift` hits the unique
`reservations.gift_id` constraint (23505) and rolls back, so there is no
identity leak or double reservation. This belongs to S-04/S-06 integrity
hardening, not F-01.

Decision: **OUT OF SCOPE** (track for S-06).

### 9. Minor docs

- `change.md` typo "auto-appplied".
- `verification.md` says anon has "no grant at all" — true for the
  `reservations` table; add that `anon` still has default-ACL grants on the
  view/functions until finding 1 lands (otherwise the record overstates the
  invariant).

Decision: **FIX NOW** (docs).

## Strengths

- Enforcement lives in RLS + a column-limited grant, not in a
  security-definer view; the view is `security_invoker`, so invoker
  privileges and RLS govern it. This is auditable and safe.
- `reserver_user_id` and `id` are excluded from the grant; `select *`,
  direct identity projection, predicates, ordering, whole-row and JSON
  serialization all fail with `42501` (verified).
- Row scope is correct: owner/member see their list, stranger/loner see
  nothing; the `gifts` RLS provides defense in depth.
- Tests run as real `authenticated`/`anon` roles with JWT claims, use
  deterministic fixtures, and assert concrete arrays/counts (no weak
  existence assertions). The sanity checks `#1–#2` fail loudly on a broken
  role switch.
- Realtime publication is pinned to `gifts`; `reservations` and
  `list_members` absence is asserted.
- Forward-only migration; revert kept outside `supabase/migrations/`;
  empty seed prevents `db reset` failure; verification record now reflects
  the executed green runs.

## Gates

- `npx supabase db reset` — PASS
- `npx supabase test db` — PASS, 17/17, twice (+ post-probe re-run)
- `npx expo lint` / `npx tsc --noEmit` — N/A (no `src/` change)
- `npx supabase db diff --linked` — NOT RUN (no access token; manual gate
  before pushing to the linked hosted project)

## Verdict

**APPROVE WITH FOLLOW-UPS.** F-01 delivers the harness and proves the
identity-hiding invariant on the table, view, RPC and realtime paths it
tests; no active identity leak was found. Before S-04 exposes the RPCs to the
client, land finding 1 (revoke `anon` EXECUTE/view grants + catalog
assertions). Findings 2 and the test-gap items are cheap and should ride with
that migration; the rest are documented follow-ups.
