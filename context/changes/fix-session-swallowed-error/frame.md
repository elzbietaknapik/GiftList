# Frame Brief: Swallowed session bootstrap error (P-03)

> Framing step before /10x-plan. This document captures what is *actually*
> at issue, separated from what was initially assumed.

## Reported Observation

Static finding P-03 from `context/audits/observability/2026-10-30_reservations-gifts.md`:
`getSession().then(...)` in `src/lib/session.tsx:21-25` has no `.catch`, and `setLoading(false)`
runs only inside `.then`. A rejection would leave `loading = true`, and `RootNavigator`
(`src/app/_layout.tsx:13-15`) returns `null` while loading.

No runtime or user-facing symptom has been observed. The user confirmed: nothing was
observed, and it is unknown under which conditions this happens.

## Initial Framing (preserved)

- **User's stated cause or approach**: `getSession()` rejects and the rejection is not handled, so the app hangs on a blank screen. Fix: add `.catch(console.error)` and `.finally(setLoading(false))`, pass the error through state, and clear loading.
- **User's proposed direction**: Handle rejection, log the full error object with context via `console.error`, make sure `loading` is cleared and the error is available or signalled.
- **Pre-dispatch narrowing**: "Nic nie zaobserwowano" (no observed symptom); conditions "Nie wiem / nie sprawdzałem" (unknown).

## Dimension Map

The observed-in-audit effect (no bootstrap completion) could originate at any of these dimensions:

1. **Rejection of `getSession()`** — storage read or lock/initialize throws; no `.catch` → `loading` stuck. ← initial framing
2. **Resolution with `{ error }`** — `getSession()` resolves, `error` is non-null, `session` is `null`; `error` is ignored and the app routes to `(auth)` login.
3. **Splash layer** — `SplashScreen.hideAsync()` rejection in `src/components/animated-icon.tsx:50-55` (audit P-05). Would hide the splash overlay path, not the session state.
4. **Data layer after login** — `getMyList` / `listGifts` error funnel (audit G-01, P-01). Happens after session is established; cannot explain a bootstrap hang.

## Hypothesis Investigation

Read directly (small surface, no sub-agents dispatched): `src/lib/session.tsx`, `src/app/_layout.tsx`, `src/lib/supabase.ts`, `node_modules/@supabase/auth-js` 2.117.2 (`GoTrueClient.js`: `getSession` 2412, `_useSession` 2491, `__loadSession` 2510-2577, `_callRefreshToken` 4188).

| Hypothesis | Evidence | Verdict |
| --- | --- | --- |
| 1. Rejection of `getSession()` → permanent `loading` | `session.tsx:21-25`: `.then` only, no `.catch`/`.finally`. `_layout.tsx:13-15`: `loading` → `null`. auth-js `_useSession` (2493-2503) is `try/finally` with **no catch**, so storage/lock exceptions propagate as rejections. Mechanism is real. Trigger frequency unknown; no reproduction. | STRONG (mechanism) / WEAK (real-world frequency) |
| 2. Resolves with `{ error }`, silently routed to login | `__loadSession` (2544-2570): a failed refresh with no usable stored session returns `{ data: { session: null }, error }`. `session.tsx:21-23` destructures only `data` and ignores `error`. Result: `setLoading(false)`, `session = null`, `(auth)` login is shown with no log and no message. This is the *common* failure path in this SDK version and it does **not** hang. | STRONG |
| 3. Splash `hideAsync` rejection | `animated-icon.tsx:50-55` (audit P-05). Affects the splash overlay, not the session state. Does not explain a null `session`/`loading` state. | WEAK for this symptom |
| 4. Data-layer error funnel | `(app)/index.tsx`, `lib/gifts.ts`, `lib/lists.ts` (audit G-01, P-01). Only reachable after a session exists. | NONE for bootstrap |

## Narrowing Signals

- Hypothesis 1 is the one the change targets, and it is structurally real, but its trigger is unknown and was not observed (user: "Nic nie zaobserwowano" / "Nie wiem").
- Hypothesis 2 is verified in the installed SDK source. It is the path where an error is actually produced and discarded with no `catch` involved. A `.catch` added as the change proposes **does not touch it**.
- Adding only `.finally(() => setLoading(false))` would convert the hang (1) into a silent login redirect, which is the same hidden-failure shape the audit warns against: the user sees "logged out" and no evidence is kept.

## Cross-System Convention

The audit's convention (`context/audits/observability/2026-10-30_reservations-gifts.md` §4, §6): one reporting sink (`reportError(error, context)`), no `catch` that only sets a message, no failure rendered as a normal "no data / logged out" state, and no swallowed `{ error }` results (audit P-04 covers the same pattern for `signOut`). The change's `console.error` is a local stand-in for that sink; P-02 (no sink exists in `src/`) is a separate item in the audit's fix order, item 1.

## Reframed (or Confirmed) Problem Statement

> **The actual problem to plan around is**: a failed session bootstrap is invisible in both of its forms. It either never completes (rejection, hypothesis 1) or completes as "no session" (`{ error }` ignored, hypothesis 2), and in neither case does the code record the error or tell the user it was a failure rather than a logged-out state.

The reframe is narrower than "the promise has no `.catch`" and broader in scope: the fix must cover the resolved-with-error path, which the current change does not mention. Without that, the change fixes the less likely path and leaves the more likely one silent.

## Confidence

- **MEDIUM** — both mechanisms are verified in source (`session.tsx`, `_layout.tsx`, auth-js 2.117.2). Neither has been reproduced, the trigger for hypothesis 1 is unknown, and no runtime evidence exists (`runtime_proof: not-run`).

Verification step before or during /10x-plan: write a failing unit test (see below) that simulates (a) `getSession` rejecting and (b) `getSession` resolving with `{ error }`, and confirm both currently end in an unlogged, silent state.

## What Changes for /10x-plan

The plan should cover the bootstrap state machine, not only a `.catch`:

1. Handle **both** rejection (`.catch`) and `error` in the resolved result, in `session.tsx`.
2. Record the failure: expose an error (e.g. `error` / `bootstrapError`) in `SessionContextValue` so the UI can distinguish "failed" from "no session".
3. Route the failure to a visible state with retry (not `null`, not the login screen silently). Decide the minimal UI: a dedicated error view in `_layout.tsx`.
4. Log with full context. Decide the sink now: `console.error` as an interim, or the `reportError` seam from audit P-02. Do not embed PII.
5. Start with failing tests. `vitest` covers `src/**` but `src/` has 0 tests (audit P-07). The plan must decide the test harness and make the two failing cases red before implementing.

## References

- Source files: `src/lib/session.tsx:21-25`, `src/app/_layout.tsx:8-15`, `src/lib/supabase.ts:17-26`, `src/components/animated-icon.tsx:50-55`
- SDK: `node_modules/@supabase/auth-js/dist/module/GoTrueClient.js:2412-2425, 2491-2504, 2510-2577, 4188-4192`
- Audit: `context/audits/observability/2026-10-30_reservations-gifts.md` — P-02, P-03, P-04, P-05, P-07, §6 item 1
- Change: `context/changes/fix-session-swallowed-error/change.md`
- Related research: none
- Investigation tasks: none dispatched (direct reads; surface small)
