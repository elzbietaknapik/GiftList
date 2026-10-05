# Plan: F-01 `reservation-privacy-tests`

Roadmap item: **F-01 — Weryfikacja prywatności rezerwacji (harness pgTAP)** (Change ID `reservation-privacy-tests`)
Source: `.kilo/plans/1791202495154-roadmap-giftlist-mvp.md` (the roadmap file is not yet materialized on disk — see Task 0)
Goal: a local pgTAP harness under `supabase/tests/` that, running as the `authenticated` role (Życzący and Obdarowujący) and `anon`, proves the reserving identity never leaks through any client-reachable path.

> **Language note:** comments in commit/PR text may be Polish to match the repo; SQL identifiers and error codes stay as-is.

## Decisions locked for this plan

1. **Scope = privacy only.** F-01 delivers the harness + identity-leak proofs. Behavioral tests (double-reserve, purchase-only-by-reserver, delete protection, `open_shared_list` membership effects) belong to S-03/S-04/S-05/S-06 and are out of scope here.
2. **Repair `reservation_status` (do not just test it).** The current view is created `with (security_invoker = true)` in `supabase/migrations/20261005113900_initial_schema.sql:89` while `revoke all ... from authenticated` is applied to `reservations` (`:85`). A `security_invoker` view checks the **invoker's** privileges on the base table, so `authenticated` gets `permission denied` — the view is currently unusable. Repair via a **new forward migration** (never edit the applied migration).
3. **Enforcement stays in RLS.** The repair grants only the identity-free columns and adds a row-scoped SELECT policy; it does **not** reopen the table.
4. **No CI wiring.** CI is Parked in the roadmap; F-01 only makes the tests runnable locally.

## Verified current state

- CLI: `supabase` 2.119.0 (via `npx`). Project linked: `bdbgjyzypmrkvbhfilqj` (org `vhcpaccdgzqiejiikjrz`).
- `supabase/tests/` does **not** exist. No `seed.sql` exists (config.toml `[db.seed] enabled = true`, `sql_paths = ["./seed.sql"]`).
- **Docker is NOT installed / not on PATH** (`supabase status` → `docker: command not found`). `supabase start` / `supabase test db` cannot run until Docker Desktop is installed — this is a manual gate.
- Schema: `public.gifts_lists`, `public.gifts` (carries `status`), `public.list_members`, `public.reservations` (identity column `reserver_user_id`, `revoke all` from `anon`+`authenticated`), view `public.reservation_status`, RPCs `open_shared_list`, `reserve_gift`, `mark_gift_purchased`, `my_reserved_gift_ids`. Realtime publication includes only `public.gifts`.
- `context/foundation/roadmap.md` does not exist.

## Task 0 — Materialize the roadmap (bookkeeping prerequisite)

`/10x-plan` cannot flip the roadmap item's `Status` because `context/foundation/roadmap.md` is absent. The roadmap exists only inside `.kilo/plans/1791202495154-roadmap-giftlist-mvp.md` (fenced block, lines ~9–205).

- Copy that fenced markdown verbatim to `context/foundation/roadmap.md`.
- Then set the F-01 row/description `Status: ready` → `planning` (both the "At a glance" table and the `### F-01` block).
- If the team prefers to skip roadmap edits for now, mark this task skipped and treat the plan file as the source of truth; the tests are self-contained either way.

Non-plan docs (this is the only task that touches them); the rest is code + migrations.

## Task 1 — Forward migration repairing `reservation_status`

Create `supabase/migrations/<timestamp>_reservation_status_scope.sql` (timestamp after `20261005113900`). Do **not** modify the initial migration.

```sql
-- F-01: make reservation_status usable for authenticated WITHOUT exposing reserver identity.
-- Narrow, column-limited read on the otherwise-closed reservations table.
grant select (gift_id, created_at, purchased_at) on public.reservations to authenticated;

-- Row scope: only reservations on lists the caller owns or has joined.
create policy select_reservation_status on public.reservations
  for select to authenticated
  using (
    exists (
      select 1
      from public.gifts g
      join public.gifts_lists gl on gl.id = g.list_id
      where g.id = reservations.gift_id
        and (
          gl.owner_id = auth.uid()
          or exists (
            select 1 from public.list_members m
            where m.list_id = gl.id and m.user_id = auth.uid()
          )
        )
    )
  );

-- Ensure the identity-free view is (re)declared with the invoker semantics the policy relies on.
create or replace view public.reservation_status
  with (security_invoker = true) as
  select r.gift_id, r.created_at, r.purchased_at
  from public.reservations r;
grant select on public.reservation_status to authenticated;
```

Notes:
- Table-level `revoke all ... from authenticated` from the initial migration stays in force; `grant select (columns)` adds column-level access only. `select * from reservations` and `select reserver_user_id` must still fail with `42501`.
- `anon` remains fully revoked (no grant, no policy).
- Write the reverse as a **new** revert migration per `infrastructure.md` rollback convention (`revoke select (…)`, `drop policy`, `create or replace view` back to the original) — keep it as a sibling file, not an edit.

## Task 2 — pgTAP harness

Create `supabase/tests/reservation_privacy.test.sql`, self-contained, wrapped in one transaction:

```sql
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select plan(17);
-- fixtures + assertions (below)
select * from finish();
rollback;
```

Extension is created inside the transaction and rolled back, so it is never pushed to hosted and re-created each run.

### Fixtures (run as the connecting superuser, before any `set role`)

Fixed UUIDs so assertions are deterministic:

- `owner`   = `11111111-1111-1111-1111-111111111111` (owns list L1)
- `member`  = `22222222-2222-2222-2222-222222222222` (joined L1)
- `stranger`= `33333333-3333-3333-3333-333333333333` (owns list L2)
- `loner`   = `44444444-4444-4444-4444-444444444444` (no access to anything)

1. Insert the four users into `auth.users` (minimal columns: `id`, `instance_id` = `00000000-0000-0000-0000-000000000000`, `aud`/`role` = `authenticated`, `email`). If any `NOT NULL` column lacks a default, add explicit values; no password is needed because `auth.uid()` reads the JWT claim, not a session.
2. Insert L1 (`owner`), L2 (`stranger`) with fixed `share_token` values; gifts G1 on L1, G2 on L2.
3. Insert `(L1, member)` into `public.list_members`.
4. Create reservations by calling the RPC (the table is closed to direct inserts): as `member` → `reserve_gift(G1)`; as `stranger` → `reserve_gift(G2)`.

### Identity switching (use explicitly in each block)

```sql
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"<uuid>","role":"authenticated"}', true);
-- back to superuser between identities:
reset role;
-- anonymous:
set local role anon;
```

`auth.uid()` reads `request.jwt.claim.sub` then `request.jwt.claims->>'sub'`. Always follow a switch with the sanity assertions (#1–#2) so a broken switch fails loudly instead of false-greening (roadmap Risk).

### Assertions (17)

Privacy / identity:
1. `is(current_user::text, 'authenticated', ...)` after switching (member block) — proves the role switch took effect.
2. `is(auth.uid(), '<member uuid>'::uuid, ...)` — proves JWT claims drive `auth.uid()`.
3. `throws_ok('select * from public.reservations', '42501', ...)` as `anon`.
4. `throws_ok('select * from public.reservations', '42501', ...)` as `owner`.
5. `throws_ok('select reserver_user_id from public.reservations', '42501', ...)` as `member` — the direct identity column.

View shape / scoping (`reservation_status`):
6. `hasnt_column('public','reservation_status','reserver_user_id', ...)`.
7. `has_column('public','reservation_status','gift_id', ...)`.
8. `has_column('public','reservation_status','purchased_at', ...)`.
9. As `member`: `is((select array_agg(gift_id order by gift_id) from public.reservation_status), array['<G1>']::uuid[], ...)` — sees own list only, **not** G2.
10. As `owner`: same expected array `[G1]` — no cross-list leak.
11. As `loner`: `is((select count(*) from public.reservation_status), 0::bigint, ...)` — a non-participant sees nothing.

`my_reserved_gift_ids()` (identity-scoped RPC):
12. As `member`: `is(public.my_reserved_gift_ids(), array['<G1>']::uuid[], ...)`.
13. As `owner`: `is(public.my_reserved_gift_ids(), '{}'::uuid[], ...)`.
14. As `stranger`: `is(public.my_reserved_gift_ids(), array['<G2>']::uuid[], ...)` — own only, not global.

Realtime publication (identity must not ride a broadcast — infra.md Risk #6):
15. `is_empty($$ select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='reservations' $$, ...)`.
16. `isnt_empty($$ ... tablename='gifts' $$, ...)`.
17. `is_empty($$ ... tablename='list_members' $$, ...)`.

Keep `select plan(N)` exactly equal to the assertion count.

### Fallbacks

- If `authenticated` cannot execute pgtap helpers from `extensions` (permission), create the extension `with schema public` instead of `extensions` (local-only, rolled back) and adjust `search_path`.
- If `create extension pgtap` fails, add `create extension if not exists pgtap with schema extensions;` to a **local-only** migration; do not push it to hosted.

## Task 3 — Local run prerequisites

- **Manual gate:** install Docker Desktop (not on PATH) and start it.
- If `supabase start`/`db reset` errors on the missing seed file, create an empty `supabase/seed.sql` (config.toml enables seeding) or set `[db.seed] enabled = false`.

## Verification (implementation agent)

1. `npx supabase start` (pulls images first time).
2. `npx supabase db reset` — applies initial + new migration cleanly.
3. `npx supabase test db` — all 17 TAP assertions green; record output.
4. Run `npx supabase test db` a second time — still green (idempotent; proves no cross-run residue).
5. Confirm no app source changed; `npx expo lint` and `npx tsc --noEmit` are unaffected (run only if something under `src/` was touched).

## DoD

- `supabase/migrations/<ts>_reservation_status_scope.sql` exists and is applied by `supabase db reset`.
- `supabase/tests/reservation_privacy.test.sql` exists; `plan(N)` matches assertion count; `npx supabase test db` green on a freshly reset DB.
- `anon`/`authenticated` still cannot read `reservations` (`select *` → 42501); `reservation_status` works for owners/members and leaks no identity and no cross-list rows.
- `reservations` and `list_members` are absent from the `supabase_realtime` publication; `gifts` present.
- Only additive migration objects; initial migration untouched.

## Risks

| # | Risk | Mitigation |
|---|------|------------|
| 1 | Docker absent → tests authored but unrunnable | Manual gate in Task 3; treat plan as "ready, execution blocked on Docker Desktop". |
| 2 | False-green if the role/JWT switch silently fails | Sanity assertions #1–#2 at the start of each identity block. |
| 3 | `schema`/`grant` drift if the initial migration was already pushed to hosted | Repair is a new forward migration (grant + policy + `create or replace`), additive and safe; run `npx supabase db diff --linked` to confirm no unexpected diff. |
| 4 | pgtap not present / not executable | Fallbacks in Task 2. |
| 5 | Seed file missing breaks `db reset` | Empty `supabase/seed.sql` or disable seeding (Task 3). |
| 6 | `plan(N)` drift when assertions are edited | Keep count and assertions updated together; test fails loudly if mismatched. |

## Out of scope

- CI wiring (`supabase test db` in GitHub Actions) — roadmap Parked.
- Behavioral tests: double-reserve guard, purchase-only-by-reserver, delete protection, `open_shared_list` membership effects — S-03/S-04/S-05/S-06.
- Any client/UI code, Realtime subscription tests, or changes to `src/`.
- Any change to the initial schema migration (forward-only).

## Open questions

1. Should Task 0 (materialize `context/foundation/roadmap.md` + flip F-01 to `planning`) be executed now, or deferred until the roadmap is regenerated? **Recommendation: execute now** — cheap and keeps `/10x-plan` bookkeeping consistent; skip only if the roadmap will be regenerated as a whole.
2. `change.md` identity file under `context/changes/reservation-privacy-tests/`: `/10x-new`/`/10x-plan` own that contract and are not installed here. **Recommendation:** create the change folder with the plan copy and a minimal `change.md` once the roadmap is materialized; do not invent a schema if `/10x-new` becomes available.
