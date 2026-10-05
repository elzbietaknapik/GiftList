# Change: reservation-privacy-tests (F-01)

Roadmap item: **F-01 — Weryfikacja prywatności rezerwacji (harness pgTAP)**.
Roadmap status: `planning` (see `context/foundation/roadmap.md`).

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
- `verification.md` — verification record, expected green output, Docker
  gate, fallbacks, and the DoD checklist mapped to artifacts.

## Execution status
- **Authoring:** complete (migration + test harness + seed + revert + record).
- **Execution:** BLOCKED on Docker Desktop, which is not installed / not on
  PATH (`docker --version` → command not found). `supabase start`,
  `supabase db reset`, and `supabase test db` cannot run locally until a
  human installs and starts Docker. The expected green output is fully
  documented in `verification.md` so a green run can be confirmed the moment
  Docker is available.
- **Roadmap F-01 status** stays `planning` until `supabase test db` is green
  twice (verifying idempotency); flip to `done` after that, then
  `/10x-archive` can move this folder to `context/archive/`.

## Out of scope (per plan)
CI wiring (Parked), behavioral tests (S-03/04/05/06: double-reserve,
purchase-only-by-reserver, delete protection, membership effects), any
`src/` change, any edit to the initial migration
(`20261005113900_initial_schema.sql`, which was already pushed to the linked
hosted project — forward-only).
