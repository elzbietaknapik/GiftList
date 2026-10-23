# Change: reservation-privacy-tests (F-01)

Roadmap item: **F-01 — Weryfikacja prywatności rezerwacji (harness pgTAP)**.
Roadmap status: `done` (see `context/foundation/roadmap.md`).

> Minimal identity file. The canonical change contract (`change.md` schema,
> frontmatter, status lifecycle) is owned by `/10x-new` and is not installed
> here, so no frontmatter schema is invented. Treat `plan.md` as the source
> of truth for this change.

## Identity
- **Change ID:** reservation-privacy-tests
- **Roadmap ID:** F-01
- **Source plan:** `plan.md` (verbatim copy of
  `.kilo/plans/1791203567866-reservation-privacy-tests.md`).
- **Linked Supabase project:** `bdbgjyzypmrkvbhfilqj` (the linked hosted
  project; migrations are forward-only relative to it).

## Artifacts produced by this change
- `supabase/migrations/20261005153300_reservation_status_scope.sql` —
  forward repair (column-limited grant + row-scoped SELECT policy + view
  redeclare). Applied by `supabase db reset` / pushable to the linked
  project as a new forward migration.
- `supabase/tests/reservation_privacy.test.sql` — pgTAP harness, 17
  assertions, identity-leak proofs across table / view / RPC / realtime.
- `supabase/seed.sql` — empty seed (config.toml has seed enabled with no
  seed file; this prevents `db reset` from erroring).
- `revert.sql` — manual rollback artifact, kept **out** of
  `supabase/migrations/` (see its header for why; an auto-appplied revert
  there would undo the fix on every `db reset`).
- `verification.md` — verification record, executed green output, pgTAP
  overload fix, remaining hosted gate, fallbacks, and the DoD checklist
  mapped to artifacts.
- `reviews/impl-review.md` — code review verdict, execution evidence,
  findings and triage.

## Execution status
- **Authoring:** complete (migration + test harness + seed + revert + record).
- **Execution:** complete. Docker Desktop is absent on the Windows host, but
  Docker Engine is available inside WSL; from WSL with Node 20:
  `supabase db reset` applied both migrations + empty seed, and
  `supabase test db` was green twice (`Tests=17`, `Result: PASS`). See
  `verification.md` for the full output.
- **Test fix during execution:** pgTAP's three-argument
  `throws_ok(sql, errcode, description)` treats the third argument as
  `errmsg` when the second is five bytes; switched the three permission-denied
  assertions to `throws_ok(sql, '42501', NULL, description)`.
- **Roadmap F-01 status** is `done`. Pushing the migration to the linked
  hosted project is still a manual step (`supabase login` +
  `supabase db diff --linked` first); `/10x-archive` can then move this
  folder to `context/archive/`.
- **Review:** APPROVE WITH FOLLOW-UPS (`reviews/impl-review.md`). One
  high-severity hardening item must land before S-04: `anon` still has
  default-ACL EXECUTE on the RPCs and ALL on `reservation_status` (verified;
  no identity leak today, but the privilege surface contradicts the
  least-privilege invariant). Also fix the migration's false "idempotent"
  claim and add grant-level pgTAP assertions.

## Out of scope (per plan)
CI wiring (Parked), behavioral tests (S-03/04/05/06: double-reserve,
purchase-only-by-reserver, delete protection, membership effects), any
`src/` change, any edit to the initial migration
(`20261005113900_initial_schema.sql`, which was already pushed to the linked
hosted project — forward-only).
