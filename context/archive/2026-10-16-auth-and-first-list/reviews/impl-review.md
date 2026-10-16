# Impl review — auth-and-first-list

Reviewed phases: 1, 2, 3
Verdict: APPROVE
Date: 2026-10-16

## Findings and triage

1. `useEffect` dependency `[user]` instead of `[user?.id]` (`src/app/(app)/index.tsx`)
   - Decision: FIX NOW
   - Action: dependency narrowed to `userId` (`user?.id`) so token refresh no longer re-runs the list fetch. Landed in commit `6cb81f1`.

2. Shared `error` state without a retry affordance for `getMyList`
   - Decision: SKIP (Accept risk)
   - Rationale: MVP (S-01) scope; the form does not crash and a retry happens on re-opening the view. Advanced network-state handling and a retry affordance are out of this slice.

3. `createList` throws on an empty name (double validation)
   - Decision: DISMISS / KEEP AS IS
   - Rationale: Intentional defense-in-depth — the data layer should not fully trust UI form validation.

## Gates

- `npx tsc --noEmit` — PASS
- `npx expo lint` — PASS

No blockers. Approved.
