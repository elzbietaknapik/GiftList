<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Reservation lifecycle integrity — risk #1 (two concurrent reservations)

- **Plan**: context/changes/testing-reservation-lifecycle/plan.md
- **Scope**: Full plan
- **Reviewed phases**: 1, 2, 3
- **Date**: 2026-10-30
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 2 warnings, 3 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | WARNING |
| Scope Discipline | WARNING |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | WARNING |
| Success Criteria | PASS |

## Findings

### F1 — dblink connections and committed fixtures survive a raised-error path

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: supabase/tests/reservation_concurrency.test.sql:195-210
- **Detail**: pgTAP assertion failures do not raise, so the disconnects at 321-322 and 465-475 still run on a normal red. A *raised* error (e.g. the remote `dblink_exec('race_a', …)` at 199 failing after `begin` at 198) aborts the enclosing DO block and the rest of the file: `race_a` keeps the gift row lock in an open remote transaction, and the fixtures committed through `race_admin` (92-149) persist until the session ends. The exit teardown is never reached. The next run self-heals through the idempotent entry cleanup, so this is transient residue, not a permanent leak.
- **Fix**: wrap the winner/loser dispatch in an exception handler that disconnects race_a/race_b and runs the `race_admin` cleanup before re-raising, mirroring the tolerance already present in the teardown block.
- **Decision**: PENDING

### F2 — Assertion #4 can flake red when the async error is dropped before get_result

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: supabase/tests/reservation_concurrency.test.sql:298-316
- **Detail**: `dblink_exec('race_a', 'commit')` (298) and `dblink_get_result('race_b')` (305) are separate statements. The file's own header (33-43) records that in a later statement the error was already dropped and the call "quietly returned zero rows in 5 of 5 runs"; in that case `race.loser_sqlstate` stays `''` and #4 fails with `have: <empty> want: P0001`. That is a false red, never a false green (the dropped-error path fails loudly), and it did not reproduce in the Phase 3 runs.
- **Fix A ⭐ Recommended**: accept as a documented residual flake and add a bounded retry of `dblink_get_result` inside the same DO block before recording the SQLSTATE.
  - Strength: keeps the race shape and the measured workaround intact; removes the only timing window in the file.
  - Tradeoff: slightly more code in an already subtle DO block.
  - Confidence: MEDIUM — a retry cannot recover an error the server already dropped, so it only narrows the window.
  - Blind spot: have not reproduced the flake locally, so its real frequency is unknown.
- **Fix B**: read the loser's result in the same statement that commits the winner, as the header notes was deterministic in every measured run.
  - Strength: closes the window entirely rather than narrowing it.
  - Tradeoff: couples the commit and the result read, which is the shape the current code deliberately split for the poll transaction.
  - Confidence: MEDIUM — the header's 5/5 measurement supports it.
  - Blind spot: not re-measured under this structure.
- **Decision**: PENDING

### F3 — The whole test-plan.md is first tracked by this change's Phase 3 commit

- **Severity**: 🔵 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: context/foundation/test-plan.md:1
- **Detail**: The file existed in the worktree but was untracked; commit 0c62e40 is the first that tracks it, so the diff shows 214 added lines (§1-§5, §6.1, §6.3-§6.6) while the plan frames the work as replacing a §6.2 placeholder and says other §6 sections are unchanged. The §6.2 content itself matches the contract. Nothing was rewritten by this change; the commit just carries the file's pre-existing content.
- **Fix**: add one line to change.md notes stating that test-plan.md was tracked for the first time in 0c62e40, so /10x-archive and future reviews do not mistake the 214-line diff for Phase 3 scope creep.
- **Decision**: PENDING

### F4 — Assertion #4 uses captured SQLSTATE instead of the planned throws_ok

- **Severity**: 🔵 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: supabase/tests/reservation_concurrency.test.sql:300-316
- **Detail**: The plan (Phase 2 step 4) specifies wrapping `dblink_get_result` in `throws_ok` with `P0001`. The implementation catches the error in a helper and asserts the SQLSTATE with `is`, because on this image the async remote error surfaces with an empty message and `throws_ok` compares errmsg too. The deviation is documented in the file header (33-43) and in verification.md. Intent (the loser gets `P0001`) is preserved and proven.
- **Fix**: add a short "Implementation notes" line to plan.md recording the documented deviation, so the plan and the file do not disagree on a re-read.
- **Decision**: PENDING

### F5 — The concurrency file creates dblink but not pgtap

- **Severity**: 🔵 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: supabase/tests/reservation_concurrency.test.sql:51
- **Detail**: The F-01 harness explicitly does `create extension if not exists pgtap with schema extensions` to stay self-contained when run another way (reservation_privacy.test.sql:16-28). This file creates dblink the same way but relies on `supabase test db` for pgtap, so it is only self-contained for one of its two extensions.
- **Fix**: add `create extension if not exists pgtap with schema extensions;` next to the dblink line.
- **Decision**: PENDING
