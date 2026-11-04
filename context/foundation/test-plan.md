# Test Plan

> Phased test rollout for this project. Strategy is frozen at the top
> (§1–§5); cookbook patterns at the bottom (§6) fill in as phases ship.
> Read before writing any new test.
>
> Refresh: re-run `/10x-test-plan --refresh` when stale (see §8).
>
> Last updated: 2026-11-04

---

## 1. Strategy

Tests follow three non-negotiable principles for this project:

1. **Cost × signal.** The cheapest test that gives a real signal for the
   risk wins. Do not promote to e2e because e2e "feels safer." Do not put a
   vision model on top of a deterministic visual diff that already catches
   the regression.
2. **User concerns are first-class evidence.** Risks anchored in "<the
   team is worried about X, and the failure would surface somewhere in
   <area>>" carry the same weight as PRD lines or hot-spot data.
3. **Risks are scenarios, not code locations.** This plan documents *what
   could fail* and *why we believe it's likely* — drawn from documents,
   interview, and codebase *signal* (churn, structure, test base). It does
   NOT claim to know which line owns the failure. That knowledge is
   produced by `/10x-research` during each rollout phase. If the plan and
   research disagree about where the failure lives, research is the
   ground truth.

Hot-spot scope used for likelihood weighting: `src/`, `supabase/`.

---

## 2. Risk Map

The top failure scenarios this project must protect against, ordered by
risk = impact × likelihood. Risks are failure scenarios in user / business
terms, not test names.

| # | Risk (failure scenario)                                                                                     | Impact | Likelihood | Source (evidence — not anchor)                                                                                     |
|---|-------------------------------------------------------------------------------------------------------------|--------|------------|--------------------------------------------------------------------------------------------------------------------|
| 1 | Two gift-givers reserve the same free gift; both see success                                                 | High   | High       | Interview Q1 ("podwójna rezerwacja"); roadmap S-04 Risk (race between reservers); PRD FR-009                       |
| 2 | Reserving identity leaks through an API response, realtime payload, or UI                                   | High   | Medium     | PRD Guardrails, FR-010, NFR "never leaks"; roadmap F-01 (partial coverage); hot-spot dir `supabase/` (2 commits/30d) |
| 3 | A person without the link or account reads the list, or reserves a gift by ID from a list they cannot see     | High   | Medium     | PRD Access Control (redirect to login), FR-007/FR-008; roadmap S-03 proposed; hot-spot dir `src/app` (17 commits/30d) |
| 4 | Owner deletes or edits a gift or list that already has a reservation                                         | Medium | Medium     | PRD FR-004, FR-006, FR-012; ADR-002; roadmap S-06, S-07                                                            |
| 5 | Status "purchased" is set by someone other than the reserving gift-giver                                    | Medium | Low        | PRD FR-011; roadmap S-05 Risk (`my_reserved_gift_ids` control)                                                     |
| 6 | Gift with an invalid price or link is persisted and breaks the list for gift-givers                          | Medium | Low        | PRD FR-005, Guardrail (data durability); roadmap S-02 Risk (S-02 done)                                             |

Order rows by impact × likelihood. Protect High × High first.

**Abuse / security lens:** risks 3 (IDOR / authorization) and 6 (untrusted input) cover the abuse classes for this product (auth and user input present).

### Risk Response Guidance

| Risk | What would prove protection | Must challenge | Context `/10x-research` must ground | Likely cheapest layer | Anti-pattern to avoid |
|------|-----------------------------|----------------|--------------------------------------|-----------------------|-----------------------|
| #1 | Two concurrent reservations of one free gift: exactly one succeeds, the other gets an explicit refusal; the first reserver's identity is untouched | "Sequential calls equal a race" | Atomicity of the reservation RPC and the status guard; what the client shows while realtime lags | integration (pgTAP inside the database) | Sequential-only test that never exercises concurrency |
| #2 | A signed-in gift-giver sees no reserving identity in any response, URL, or realtime payload, not just in rendered UI | "The UI not showing it means it does not leak" | Every read path: table, view, RPC, realtime publication set | integration (pgTAP, extending the existing privacy harness) | Assertion only on rendered UI text |
| #3 | A user outside the list cannot read it or reserve a gift from it by ID | "Logged in means authorized" | List ownership model and the RLS/RPC checks on reservation | integration (pgTAP, RLS/RPC) | Test that only covers the owner |
| #4 | Deleting a reserved gift or list, or editing a reserved gift, is refused with an explanation | "A disabled button means blocked" | Delete and edit paths enforced at the data layer (client guard + RLS) | unit (Vitest, client guard) + integration (pgTAP) | Checking only the UI control |
| #5 | Someone other than the reserving gift-giver cannot set "purchased" | "The owner can do it too" | Identity comparison at the status-change point | integration (pgTAP) | Happy path only for the reserver |
| #6 | Invalid price or link is rejected by the data layer, not only by the form | "UI validation is enough" | Validation rules at the data boundary | unit (jest-expo) + integration (pgTAP) | Asserting validation only on the form |

Every top risk gets one row. These rows avoid file anchors and test code.
They state how the risk should be attacked, which assumption must be
challenged, and what context must be grounded before planning tests.

**Risk #4 mitigation (2026-11-04).** Editing is blocked in three layers: the
UI hides the edit action for `reserved`/`purchased` gifts, `updateGift` in
`src/lib/gifts.ts` rejects non-free gifts or gifts with a reservation, and the
`update_gifts` RLS policy in
`supabase/migrations/20261104120000_gift_editing_guard.sql` enforces the same
rule in `USING` and `WITH CHECK`. `src/lib/gifts.test.ts` exercises the client
guard under `npm test` (Vitest) and needs no Docker.
`supabase/tests/gift_editing_guard.test.sql` proves the database layer with
eight pgTAP assertions (reserved, purchased, free-with-reservation, WITH CHECK,
non-owner, and unchanged data after refusal). Risk #4 is fully covered at both
the unit and integration layers.

---

## 3. Phased Rollout

Each row is a discrete rollout phase that will open its own change folder
via `/10x-new`. Status moves left-to-right through the values below; the
orchestrator updates Status as artifacts appear on disk.

| # | Phase name                          | Goal (one line)                                                                                 | Risks covered | Test types                        | Status      | Change folder |
|---|-------------------------------------|--------------------------------------------------------------------------------------------------|---------------|-----------------------------------|-------------|---------------|
| 1 | Reservation lifecycle integrity     | Prove two concurrent reservations never overwrite each other and status transitions stay allowed | #1, #5        | integration (pgTAP)               | complete | context/changes/testing-reservation-lifecycle/ |
| 2 | Identity and access boundary        | Prove reserving identity and list access hold for every role and every read path                | #2, #3        | integration (pgTAP), API contract | complete | context/changes/reservation-privacy-tests/     |
| 3 | Protected mutations and validation  | Prove deletes of reserved items are refused and invalid gift data is rejected at the data layer | #4, #6        | integration (pgTAP), unit (Vitest) | complete | context/changes/gift-editing/                  |
| 4 | Quality-gates wiring                | Lock the baseline locally: lint, typecheck, pgTAP, unit tests                                   | cross-cutting | gates                             | complete | —                                              |

**Status vocabulary** (fixed — parser literals):

| Value          | Meaning                                                                          |
|----------------|----------------------------------------------------------------------------------|
| `not started`  | No change folder for this rollout phase yet.                                     |
| `change opened` | `context/changes/<id>/` exists with `change.md`; research not done.            |
| `researched`   | `research.md` exists in the change folder.                                       |
| `planned`      | `plan.md` exists with a `## Progress` section.                                   |
| `implementing` | Progress section has at least one `[x]` and at least one `[ ]`.                  |
| `complete`     | Progress section is fully `[x]`.                                                 |

Order rationale: phase 1 covers risk #1 (High × High) and uses the RPC already present in the baseline migration. Phase 2 extends the existing pgTAP privacy harness from F-01. Phase 3 is the first consumer of the JS unit runner. Phase 4 locks the floor after the earlier phases exist. AI-native phases were omitted: no risk in this milestone has a signal that classic tests cannot provide cheaply.

---

## 4. Stack

The classic test base for this project. AI-native tools are not used in this
rollout.

| Layer                | Tool                                              | Version | Notes                                                                                   |
|----------------------|---------------------------------------------------|---------|-----------------------------------------------------------------------------------------|
| unit (client)        | Vitest                                            | 5.x (installed) | Runs via `npm test`; Supabase client mocked at the module boundary. No React Native renderer in this rollout. |
| DB integration / RLS / RPC | pgTAP via `npx supabase test db`             | existing | Harness from F-01 (`supabase/tests/reservation_privacy.test.sql`, plan(17)); requires local Docker |
| API mocking          | none yet — see §3 Phase 3                          | n/a     | Mock only at the network edge (Supabase client boundary), never internal modules         |
| e2e                  | none yet — deferred to a later lesson / milestone  | n/a     | Expo documents Maestro for EAS E2E flows (Context7, checked: 2026-10-23); not in scope for this rollout |
| lint + typecheck     | `npx expo lint`, `npx tsc --noEmit`                | existing | Already passing on archived slices                                                       |
| (optional) AI-native | not used                                          | n/a     | No risk in §2 where AI-native gives signal that classic tests do not; checked: 2026-10-23 |

**Stack grounding tools (current session):**
- Docs: Context7 — checked Expo unit-testing guidance (jest-expo preset, Jest); checked: 2026-10-23
- Search: Exa.ai — available, not used; checked: 2026-10-23
- Runtime/browser: Playwright MCP — not available in current session; checked: 2026-10-23
- Provider/platform: GitHub / Supabase MCP — not available in current session; checked: 2026-10-23

Use docs MCPs for current framework/library APIs and setup details. Use
search MCPs for discovery or current status only, then prefer official docs
as the evidence. Do not use MCP docs/search to infer code failure anchors;
those belong in per-phase `/10x-research`.

---

## 5. Quality Gates

The full set of gates that must pass before a change reaches production.
"Required for §3 Phase <N>" means the gate is enforced once that rollout
phase lands; before that, the gate is `planned`.

| Gate                        | Where               | Required?                     | Catches                                   |
|-----------------------------|---------------------|-------------------------------|-------------------------------------------|
| lint + typecheck            | local (CI deferred) | required                      | syntactic / type drift                    |
| pgTAP privacy / RLS / RPC   | local               | required after §3 Phase 1     | reservation races, identity leaks, access |
| unit (Vitest)               | local               | required after §3 Phase 3     | validation and client logic regressions   |
| CI wiring of the gates above | GitHub Actions     | required after the CI milestone (deferred in roadmap) | merges that skip the gates |

Every row corresponds to a gate that either is wired or will be wired by a
named rollout phase or milestone. CI wiring is deferred in the roadmap
(Parked); it is listed so the gap is visible, not ignored.

---

## 6. Cookbook Patterns

How to add new tests in this project. Each sub-section is filled in once
the relevant rollout phase ships; before that, the sub-section reads
"TBD — see §3 Phase <N>."

### 6.1 Adding a unit test

- Where: `src/**/*.test.ts`, run by `npm test` (Vitest). `vitest.config.mts`
  maps the `@/*` alias to `src/*`.
- Pattern: mock the Supabase client at the module boundary
  (`vi.mock("@/lib/supabase")`) with a chainable query stub; never mock
  `src/lib/gifts.ts` itself.
- Assert the domain error (`GiftNotEditableError`) and that the mutating call
  was not reached; add a happy path that proves the guard does not block a
  free gift.
- Reference file: `src/lib/gifts.test.ts` (risk #4 — editing a reserved gift
  is refused without Docker).

### 6.2 Adding an integration test

- Where: `supabase/tests/`, one `*.test.sql` file per behaviour, run by
  `npx supabase test db` (WSL, Node 20; the stack must be up).
- Pattern: open with `select plan(N)` where `N` equals the number of
  assertions, and pin the assertion count in a comment map so a new check
  cannot land without updating `N`.
- Fixtures: rows must be committed before a `dblink` session can see them, so
  insert them through a dedicated administrative `dblink` connection in
  autocommit mode instead of wrapping the whole file in `begin`/`rollback`;
  clean up on entry and on exit with deterministic UUIDs, and assert zero
  residue as the last assertion.
- Ordering: prove "one side waited for the other" from `pg_stat_activity`
  (e.g. `application_name` + `wait_event_type = 'Lock'`) in a bounded retry
  loop; `pg_sleep` may only be the poll interval, never the condition.
- Reference file: `supabase/tests/reservation_concurrency.test.sql` (risk #1 —
  two concurrent `reserve_gift` calls on one free gift: exactly one succeeds,
  the other gets an explicit `P0001`).

### 6.3 Adding an e2e test

- TBD — e2e is out of scope for this rollout; revisit at a later milestone.

### 6.4 Adding a test for a new API endpoint or RPC

- Reference file: `supabase/tests/reservation_privacy.test.sql` (17
  assertions) — switch role/JWT per actor, assert the positive and negative
  paths on every read path, and keep the file transactional.
- Wrap the whole file in `begin`/`rollback`; pin `plan(N)` and keep the
  numbered assertion map in a comment.

### 6.5 Adding a test for a protected mutation

- Reference file: `supabase/tests/gift_editing_guard.test.sql` (risk #4 — RLS
  `update_gifts` refuses edits of reserved, purchased, and reserved-backed
  gifts).
- Pattern: run the mutation as the affected role, assert `0` updated rows when
  `USING` rejects the old row, use `throws_ok(..., '42501', NULL, ...)` when
  `WITH CHECK` rejects the new row, and add a positive control on a free row.
- Keep a final assertion that the refused mutations left the protected rows
  unchanged.

### 6.6 Per-rollout-phase notes

(Optional. After each phase lands, `/10x-implement` appends a 2-3 line note
here capturing anything surprising the rollout phase taught.)

---

## 7. What We Deliberately Don't Test

Exclusions agreed during the rollout (Phase 2 interview, Q5). Future
contributors should respect these unless the underlying assumption changes.

- **Static screens (no logic)** — rendering-only screens without behavior are not worth test budget. Re-evaluate if a static screen starts carrying business logic. (Source: Phase 2 interview Q5.)

---

## 8. Freshness Ledger

- Strategy (§1–§5) last reviewed: 2026-11-04
- Stack versions last verified: 2026-11-04
- AI-native tool references last verified: 2026-11-04

Refresh (`/10x-test-plan --refresh`) when:

- a new top-3 risk surfaces from the roadmap or archive,
- a recommended tool's `checked:` date is older than three months,
- the project's tech stack changes (new framework, new test runner),
- §7 negative-space no longer matches what the team believes.
