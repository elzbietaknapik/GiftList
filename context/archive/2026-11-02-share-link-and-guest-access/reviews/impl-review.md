<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Share Link and Guest Access — Implementation Plan

- **Plan**: context/changes/share-link-and-guest-access/plan.md
- **Scope**: Full plan
- **Reviewed phases**: 1, 2, 3, 4, 5
- **Date**: 2026-11-02
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 2 warnings, 3 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | WARNING |
| Scope Discipline | WARNING |
| Safety & Quality | PASS |
| Architecture | PASS |
| Pattern Consistency | WARNING |
| Success Criteria | WARNING |

## Findings

### F1 — Provider file name differs from plan and the Progress row asserts a path that does not exist

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: src/lib/share-link-provider.tsx:14
- **Detail**: Phase 4 planned `src/lib/share-link.tsx`; the file was implemented as `src/lib/share-link-provider.tsx` (reasonable — it avoids colliding with the pure `share-link.ts` module of the same basename), but the plan was never amended. Progress row 4.3 still claims "`src/lib/share-link.tsx` exists" and is checked `[x]` with SHA `bef2539`, so the recorded success criterion is provably false as written.
- **Fix**: Amend the Phase 4 Contract and Progress row 4.3 to name `src/lib/share-link-provider.tsx` (keep the `[x]` and SHA), and add a one-line ADAPT note in the change.
- **Decision**: FIXED (Fix A: plan amended to `src/lib/share-link-provider.tsx`, Progress 4.3 corrected)

### F2 — Phase 1 commit bundled unrelated test/tooling changes

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Scope Discipline
- **Location**: d18c843 (commit contents)
- **Detail**: The Phase 1 commit `d18c843` contains, besides `app.json` and `package.json`/`package-lock.json`, files this plan explicitly excludes: `playwright.config.ts`, `vitest.config.mts`, `stryker.config.json`, `tests/e2e/seed.spec.ts`, `supabase/tests/reservation_privacy.test.sql`, plus a large `.agents/`, `.claude/`, `.kilo/`, `AGENTS.md`, `CLAUDE.md` footprint. These look like pre-existing dirty work swept into the phase commit rather than authored by this change. The plan's "What We're NOT Doing" lists test scaffolding and Playwright, so at plan scope the commit is not reviewable in isolation.
- **Fix A ⭐ Recommended**: Record the collateral in `change.md` Notes as "swept-in unrelated changes" so `/10x-archive` and future reviews do not attribute it to this plan; leave history untouched.
  - Strength: history is already shared; annotating is cheap and keeps the source of truth honest.
  - Tradeoff: commit still looks broader than the phase.
  - Confidence: HIGH — no code in this change depends on the extras.
  - Blind spot: whether the extras were intentional in the same work session.
- **Fix B**: Split the unrelated files out with an interactive rebase.
  - Strength: restores one-concern-per-commit.
  - Tradeoff: rewrites already-committed local history; risk of losing the extras if the split is wrong.
  - Confidence: LOW — the bundle is large and partially generated.
  - Blind spot: whether any of it is referenced by the phase commits.
- **Decision**: FIXED (Fix A: swept-in collateral recorded in change.md Notes)

### F3 — pendingToken is derived during render, not in an effect as planned

- **Severity**: 🔵 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/lib/share-link-provider.tsx:19–29
- **Detail**: The plan specified "Efekt: gdy `loading === false`, `session === null` …". The implementation instead uses the React "adjust state during render" pattern (`prevKey` comparison + conditional `setPendingToken`). Behaviour is correct and this is a documented React pattern (avoids an extra commit pass), but it deviates from the plan wording and from the effect-based pattern used elsewhere in the repo (`session.tsx`, `index.tsx`).
- **Fix**: Either leave as-is and note the choice in the plan, or move the derivation into `useEffect` on `[loading, session, url]` to match the planned contract.
- **Decision**: FIXED (Fix A: render-phase derivation documented in Phase 4 Contract)

### F4 — Guest route does not reset loading/error when the token param changes in place

- **Severity**: 🔵 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/app/(app)/list/[token].tsx:20–44
- **Detail**: `loading` is initialised once from `valid` and `error` once from token validity; when the same screen instance receives a different `token` (push to another `/list/<token>` while mounted), the effect re-runs but `loading` is never set back to `true` and the previous `error` is never cleared. The user can briefly see the previous list/error. Not reachable through the plan's current flows (one push after login), so it is not a correctness failure today.
- **Fix**: At the top of the effect, `setLoading(true)` and `setError(valid ? null : 'Nieprawidłowy link.')`, and reset `list`/`gifts` before refetching.
- **Decision**: FIXED (token change resets list/gifts/loading/error via render-phase prev-token compare)

### F5 — Typed-route path is escaped with `as unknown as Href`

- **Severity**: 🔵 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/app/(app)/_layout.tsx:14
- **Detail**: `router.push({ pathname: '/list/[token]', params: { token } } as unknown as Href)` double-casts, which suppresses type checking of the route literal. Plan Phase 5 Step 2 required regenerating `.expo/types/` first; the cast suggests the generated route type was not visible when this was written. `tsc` and `lint` pass because of the cast, so the gate cannot catch a future route rename here.
- **Fix**: Remove the cast and let typed routes validate the object; if the generated type is missing, run `npx expo start` once to regenerate `.expo/types/`.
- **Decision**: FIXED (cast removed; typed routes validate the push without it)

## Notes

- Post-triage (2026-11-02): all five findings resolved � F1/F2/F3 plan and change notes amended, F4/F5 code fixed; 
px tsc --noEmit and 
px expo lint re-run green afterwards.

- Automated gates re-run at review time: `npx tsc --noEmit` → exit 0; `npx expo lint` → exit 0.
- Manual Progress rows (1.4, 3.4–3.5, 4.4–4.6, 5.4–5.7) are all `[x]` with phase-5 SHA `fff7a4c`; they are device-only checks and cannot be re-verified here.
- Scope verified against the plan: no direct `supabase` import in the guest route, no DB/RLS changes, no reservation UI, statuses read from `gifts.status`.
