# Plan: S-03 `share-link-and-guest-access`

Roadmap item: **S-03 — Link udostępniania i widok gościa** (Change ID `share-link-and-guest-access`)
Sources:
- `context/changes/share-link-and-guest-access/expo-linking-research.md`
- `context/changes/share-link-and-guest-access/navigation-auth-research.md`

Goal (roadmap.md:115): Życzący może wygenerować link udostępniania; Obdarowujący po otwarciu linka i zalogowaniu widzi listę ze statusami (wolny/zarezerwowany/zrealizowany).

> **Language note:** comments in commit/PR text may be Polish to match the repo; identifiers stay as-is.

> **Blocker (from roadmap + research):** S-03 has `Prerequisites: S-02` (roadmap.md:118), and **S-02 (`add-gift`) is not implemented** (`Status: proposed`, roadmap.md:46 / 101–111; navigation-auth-research.md:39–48). There is **no gift-items view and no `src/lib/gifts.ts`** to share. Phase 4 (guest view) is therefore **BLOCKED** and is specified only to the extent the research supports; everything S-02-dependent is left in **Open Questions**. Phases 1–3 (native config, share-link emission, deep-link capture through auth) do **not** depend on S-02 and can proceed.

## Decisions locked for this plan (each with its research source)

| # | Decision | Source |
|---|----------|--------|
| D1 | Custom scheme `giftlist://` **requires a Development Build** (`expo-dev-client`); it does not work in standard Expo Go. | `expo-linking-research.md:3` (decision), `:73–75` (build steps) |
| D2 | Use the **`useLinkingURL()`** hook (`useURL()` is deprecated) plus `addEventListener('url')` + `getInitialURL()` for links arriving while the app runs. | `expo-linking-research.md:12`, `:16–33`, `:35–48` |
| D3 | Parse with **`Linking.parse(url)` → `{ hostname, path, queryParams }`**; for `giftlist://list/<token>`, `hostname === 'list'` and the **token is `path`** (a path segment, not a query param). | `expo-linking-research.md:13–14` |
| D4 | Register the scheme by setting `"scheme": "giftlist"` in `app.json` (currently the placeholder `"bootstrapscaffold"`) and add `expo-dev-client`; scheme is build-time only. | `expo-linking-research.md:54–75`; `navigation-auth-research.md:85–86` |
| D5 | Hook deep-link listening in the **root layout `src/app/_layout.tsx`**, as a provider/hook mounted **inside `SessionProvider`** — the only place above `Stack.Protected` and with `useSession()` access. | `navigation-auth-research.md:18–24` |
| D6 | The auth decision for an unauthenticated guest must read **`useSession().session`** and be taken only after `loading === false`. | `navigation-auth-research.md:28–35` |
| D7 | An unauthenticated guest is redirected to `(auth)` by `Stack.Protected guard={!session}`; therefore the incoming token must be **buffered ("pending") before the redirect and consumed after login**. | `navigation-auth-research.md:18–24` |
| D8 | DB token is a **UUID**: `gifts_lists.share_token uuid unique`; the guest path is the RPC **`open_shared_list(p_token uuid)`**, which is granted **only to `authenticated`** ⇒ the guest **must log in** (FR-008) before the list is visible. | `navigation-auth-research.md:51–59` |

## Current state (verified)

- Navigation (navigation-auth-research.md:6–16): root `src/app/_layout.tsx:29–37` wraps `SessionProvider` + `RootNavigator` with `Stack.Protected guard={!session}` → `(auth)` and `guard={!!session}` → `(app)`; `(auth)/_layout.tsx` = `Slot`; `(app)/_layout.tsx` = `Stack`; only `(app)/index.tsx` exists.
- Auth (navigation-auth-research.md:28–35): `src/lib/session.tsx` exposes `{ session, user, loading }` via `useSession()`.
- app.json (navigation-auth-research.md:61–87): `"scheme": "bootstrapscaffold"`, plugins `["expo-router", ["expo-splash-screen", …]]`, `experiments: { typedRoutes, reactCompiler }`; **no `expo-dev-client`**.
- Dependencies (verified in repo): `expo-linking` `~57.0.11` **is already installed** (`package.json:15`); `expo-dev-client` is **not** installed. `eas.json` **does not exist**.
- DB (navigation-auth-research.md:49–59): `share_token uuid unique` (`supabase/migrations/20261005113900_initial_schema.sql:8`); RPC `open_shared_list` (`:96–102`); `reservation_status` view (`:89–93`, re-scoped in `20261005153300_reservation_status_scope.sql`).
- Owner data layer (navigation-auth-research.md:45): `src/lib/lists.ts` — `GiftList` already carries `share_token: string` (`lists.ts:6`).
- Missing (S-02): no `src/lib/gifts.ts`, no gift-items screen, no gift/status UI (`(app)/index.tsx:99–105` shows only an empty state with "Dodawanie prezentów w kolejnym kroku").

## What We're NOT Doing

- **No gift-view implementation here if it belongs to S-02** — the read model and gift/status UI are S-02 deliverables; see Open Question O1 (navigation-auth-research.md:39–48).
- No reservations/realtime (S-04), no mark-purchased (S-05), no protected deletes (S-06).
- No DB migrations — schema + RPC + `reservation_status` already exist (navigation-auth-research.md:51–59). No edits to applied migrations.
- No OAuth/magic-link/auth changes; the existing email+password auth is reused unchanged (navigation-auth-research.md:28–35).
- No `service_role` or server code; only public `EXPO_PUBLIC_*`.
- No test runner or CI (roadmap Parked).
- Do not build the guest view against assumed gift fields — the gift read contract comes from S-02 (Open Question O1).

## Critical implementation details

- **Order of guards vs. parsing:** the root layout returns `null` while `loading` (navigation-auth-research.md:12–13). The deep-link provider must therefore live **inside** the `loading` gate's parent but must not itself block on session — it captures the URL regardless of auth state and holds it as `pendingToken` until `session` appears (D7).
- **Expo Router already routes deep links** to screens automatically; the custom hook/listener is needed only for the token logic (validation + `open_shared_list`), not for navigation (expo-linking-research.md:50–52). Do not duplicate routing.
- **Typed routes** (`experiments.typedRoutes`, navigation-auth-research.md:80) — after adding any new route file, regenerate `.expo/types/` (brief `npx expo start`) before `tsc`, else typed `href` may fail (pattern from S-01 plan).
- **Scheme is build-time:** after editing `app.json` a **new Development Build** is required; hot reload alone will not register `giftlist://` (expo-linking-research.md:54, 73–75).

---

## Phase 1 — Native config: scheme + development build

### Overview
Register the `giftlist` scheme and add `expo-dev-client` so a custom-scheme deep link can actually be delivered (D1, D4).

### Changes Required

#### 1. `app.json` — scheme and dev client
**File:** `app.json`
**Intent:** Replace the placeholder scheme and enable the development client.
**Contract:** set `expo.scheme` to `"giftlist"` and add `"expo-dev-client"` to `expo.plugins` (keep `expo-router` and the `expo-splash-screen` entry). Shape per source:
```json
{
  "expo": {
    "scheme": "giftlist",
    "plugins": ["expo-router", "expo-dev-client"]
  }
}
```
Source: `expo-linking-research.md:59–71` (exact fragment), `navigation-auth-research.md:85–86` (current placeholder + missing plugin).
**Out of scope here:** `name`/`slug` cosmetic rename — not required for the link (navigation-auth-research.md:87).

#### 2. Install dev-client and produce a development build
**Intent:** `expo-dev-client` must be installed and a native build produced.
**Contract:** `npx expo install expo-dev-client`, then build a development build (`npx expo run:android|ios` or `eas build --profile development`).
Source: `expo-linking-research.md:73–75`.
**Open:** which build path applies given there is **no `eas.json`** — see Open Question O2.

### Success Criteria
- **Automated:** `npx tsc --noEmit` and `npx expo lint` pass; `app.json` contains `"scheme": "giftlist"` and `expo-dev-client` in `plugins`.
- **Manual:** a development build installs on a device/emulator; opening `giftlist://` (any path) launches the app (not Expo Go).

### Implementation Note
Per S-01 convention, stop after automated verification for manual confirmation before Phase 2.

---

## Phase 2 — Share-link emission (owner side)

### Overview
Let Życzący obtain a `giftlist://list/<token>` link from their existing list.

### Changes Required

#### 1. Share-link helper
**File:** `src/lib/share-link.ts` (new)
**Intent:** Single place that builds the share URL from a list's `share_token`.
**Contract:** `buildShareUrl(shareToken: string): string` returning the literal form `giftlist://list/<share_token>`.
Source: `expo-linking-research.md:14` (defines the `giftlist://list/<token>` shape) and `navigation-auth-research.md:45` (`GiftList.share_token` exists, `lists.ts:6`).
**Note:** whether to build the string literally or via `Linking.createURL('/list/<token>')` is **not settled by the research** — Open Question O3.

#### 2. Share UI on the owner screen
**File:** `src/app/(app)/index.tsx`
**Intent:** Show the share link for the existing list (only when `list` is present).
**Contract:** when `list` exists, render the built URL and a copy/share action; do not add gift rendering (that is S-02). Reuses existing `list` state (`(app)/index.tsx:28`).
**Dependency note:** the owner already has `list.share_token` from S-01 (`src/lib/lists.ts:6`), so this phase is not blocked by S-02.

### Success Criteria
- **Automated:** `npx tsc --noEmit`, `npx expo lint`; file `src/lib/share-link.ts` exists.
- **Manual:** logged-in owner sees a link of the form `giftlist://list/<uuid>`; the token matches `gifts_lists.share_token`.

---

## Phase 3 — Deep-link capture and token-through-auth

### Overview
Capture incoming `giftlist://list/<token>` links at the root, buffer the token across the auth gate, and hand it to the guest flow once a session exists (D2, D3, D5, D6, D7).

### Changes Required

#### 1. Share-link provider / hook
**File:** `src/lib/share-link.tsx` (new) — mounted inside `SessionProvider` in the root layout.
**Intent:** One owner of "the pending shared token", surviving the redirect to `(auth)`.
**Contract:**
- Subscribe with `Linking.useLinkingURL()` (preferred) **and** `Linking.getInitialURL()` + `Linking.addEventListener('url', …)` for the already-running case; unsubscribe on cleanup.
- Parse with `Linking.parse(url)`; accept a token only when `hostname === 'list'` and `path` is non-empty; otherwise ignore.
- Expose state `{ pendingToken: string | null, clearPendingToken() }`.
- Do **not** act on the token itself; authentication/consumption happens after `session` is known.
Source: `expo-linking-research.md:12, 16–33, 35–48` (API), `:13–14` (parse shape), `navigation-auth-research.md:18–24` (buffer-before-redirect).

#### 2. Root layout wiring
**File:** `src/app/_layout.tsx`
**Intent:** Mount the provider inside `SessionProvider` so it sees the URL regardless of which route group is active.
**Contract:** keep `ThemeProvider` → `SessionProvider` → (ShareLinkProvider) → `AnimatedSplashOverlay` + `RootNavigator`; leave the `Stack.Protected` guards unchanged (`_layout.tsx:18–25`).
Source: `navigation-auth-research.md:10–11, 18–24`.

#### 3. Consume the token after login (gate only)
**File:** `src/lib/share-link.tsx`
**Intent:** When `loading === false` and `session` exists and `pendingToken` is set, the token is ready to be handed to the guest flow.
**Contract:** expose the pending token to a consumer that (a) validates it as a UUID and (b) calls `open_shared_list(p_token)`. The **UI/route** that consumes it is Phase 4 and is S-02-dependent.
Source: `navigation-auth-research.md:34–35` (session gate), `:51–59` (RPC + uuid + must-login).

### Success Criteria
- **Automated:** `npx tsc --noEmit`, `npx expo lint`; files `src/lib/share-link.tsx` exists; root layout mounts the provider.
- **Manual:**
  - Logged-in user opens `giftlist://list/<uuid>` → app opens, token captured (no crash).
  - **Logged-out** user opens the link → routed to `(auth)`; after logging in, the pending token is still available (buffer survives the redirect — D7).

---

## Phase 4 — Guest view (BLOCKED by S-02)

> **Status: BLOCKED. Do not implement against assumed gift fields.** The read model and the gift/status view are S-02 deliverables that do not exist yet (navigation-auth-research.md:39–48; roadmap.md:101–111). This phase is described only to the depth the research supports; the missing pieces are Open Questions, not guesses.

### Overview (only what is established)
On an incoming shared token and a confirmed session, the guest calls `open_shared_list(p_token)` to become a member and obtain the list, then views the list **with statuses** (FR-010).

### Established contract
- **RPC:** `open_shared_list(p_token uuid)` — inserts the caller into `list_members` and returns the `gifts_lists` row; executable **only by `authenticated`**, so the guest must be logged in (D8).
- **Token:** a `uuid` (not an opaque string) — validate before calling the RPC.
- **Statuses source:** the `reservation_status` view exists and is identity-free (FR-010).
Source: `navigation-auth-research.md:49–59`.

### Not established (→ Open Questions)
- Which **route/screen** hosts the guest view (and its path) — not decided by the research (O4).
- The **gift read model** (`src/lib/gifts.ts`), the gift/status UI component, and the status rendering itself — S-02 (O1).
- What the guest sees for FR-007 "generate a link" versus FR-008 "open a link" on the owner/guest split — the research only covers the guest-open path (O5).

### Success Criteria (pending O1/O4)
- **Manual (only after O1/O4 resolved):** logged-in guest opens `giftlist://list/<uuid>` → becomes a member → sees the list and the free/reserved/purchased statuses, with no reserver identity shown (FR-010).

---

## DoD (achievable within this plan's supported scope)

- `app.json` sets `"scheme": "giftlist"` and includes `expo-dev-client`; a development build is produced (D1, D4).
- `src/lib/share-link.ts` builds `giftlist://list/<token>` from `GiftList.share_token`; owner screen exposes it (Phase 2).
- `src/lib/share-link.tsx` captures and buffers a valid `hostname === 'list'` token across the auth redirect; the session gate exposes it post-login (D2, D3, D5, D6, D7).
- `npx tsc --noEmit` and `npx expo lint` pass.
- Phase 4 remains explicitly blocked until S-02 lands and O1/O4 are resolved.

## Risks

| # | Risk | Mitigation |
|---|------|------------|
| 1 | Implementing the guest view against assumed S-02 fields → rework | Gate Phase 4 on O1; do not start it before S-02 is `done`. |
| 2 | Token lost if the app is killed while at `(auth)` and never returns to foreground | Record as Open Question O6 (persistence); buffer is in-memory per source. |
| 3 | `giftlist://` not registered because a dev build wasn't rebuilt after `app.json` change | Phase 1 requires a fresh build (expo-linking-research.md:73–75); manual check that the app is not Expo Go. |
| 4 | Typed-route errors after adding routes | Regenerate `.expo/types/` before `tsc` (S-01 pattern). |
| 5 | Duplicating deep-link routing that Expo Router already performs | Only token logic in the hook; rely on Expo Router for navigation (expo-linking-research.md:50–52). |

## Out of scope

- Gift read model / gift UI / status rendering owned by S-02 (O1).
- Reservations & realtime (S-04), mark purchased (S-05), protected deletes (S-06).
- DB migrations; edits to applied migrations (`20261005113900_…`).
- Auth changes, OAuth/magic link, password reset.
- CI, test runner, `service_role`/server code.

## Open questions

1. **O1 — S-02 dependency (blocking Phase 4).** S-02 (`add-gift`) is not implemented: no `src/lib/gifts.ts`, no gift/status view (navigation-auth-research.md:39–48; roadmap.md:101–111). Does S-03 wait for S-02, or does it deliver a minimal owner-independent read view? **Owner: team. Block: Phase 4.**
2. **O2 — Development-build mechanism.** Research recommends `npx expo run:android|ios` **or** `eas build --profile development` (expo-linking-research.md:74–75), but the repo has **no `eas.json`**. Which path is authorized (local run vs. creating EAS config)? **Owner: team. Block: Phase 1 completion.**
3. **O3 — Share-link construction.** Build the literal `giftlist://list/<token>` string (per expo-linking-research.md:14) or use `Linking.createURL('/list/<token>')`? The research artifact does not show `createURL`, so this is not locked. **Owner: team. Block: no.**
4. **O4 — Guest route shape.** Research locates the *hook* in the root layout but does not define the guest **screen/route** (navigation-auth-research.md:18–24, 58–59). Decide the route file/path. **Owner: team. Block: Phase 4.**
5. **O5 — FR-007 scope here.** FR-007 is "generate a shareable link"; FR-008 is "open after login". Confirm Phase 2 (emission) is the full owner-side deliverable for this slice and that no per-viewer permission prompt is expected (prd.md:78–80). **Owner: team. Block: no.**
6. **O6 — Pending-token persistence.** The buffer is in-memory (navigation-auth-research.md:22–24). Should the pending token persist across an app kill (e.g., AsyncStorage is already a dependency, `package.json:7`)? **Owner: team. Block: no.**
7. **O7 — Bookkeeping.** Roadmap S-03 `Status` and whether to create a `change.md` identity file (no `/10x-new` installed here; cf. F-01 plan Open Question #2). Flip to `planning` now, or keep `proposed` until S-02 unblocks? **Owner: team. Block: no.**

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1 — Native config: scheme + development build

#### Automated
- [ ] 1.1 `npx tsc --noEmit` passes
- [ ] 1.2 `npx expo lint` passes
- [ ] 1.3 `app.json` has `"scheme": "giftlist"` and `expo-dev-client` in `plugins`

#### Manual
- [ ] 1.4 Development build installs; `giftlist://` opens the app (not Expo Go)

### Phase 2 — Share-link emission

#### Automated
- [ ] 2.1 `npx tsc --noEmit` passes
- [ ] 2.2 `npx expo lint` passes
- [ ] 2.3 `src/lib/share-link.ts` exists

#### Manual
- [ ] 2.4 Owner sees `giftlist://list/<uuid>` matching `share_token`

### Phase 3 — Deep-link capture and token-through-auth

#### Automated
- [ ] 3.1 `npx tsc --noEmit` passes
- [ ] 3.2 `npx expo lint` passes
- [ ] 3.3 `src/lib/share-link.tsx` exists; root layout mounts the provider

#### Manual
- [ ] 3.4 Logged-in user opens link → token captured, no crash
- [ ] 3.5 Logged-out user opens link → auth redirect; token survives until after login

### Phase 4 — Guest view (BLOCKED)
- [ ] 4.x Blocked by O1 (S-02) and O4 (route shape)

## References

- Research: `context/changes/share-link-and-guest-access/expo-linking-research.md`, `…/navigation-auth-research.md`
- Roadmap: `context/foundation/roadmap.md` (S-03 lines 47, 113–123; S-02 lines 46, 101–111; prerequisite line 118)
- PRD: `context/foundation/prd.md` (FR-007 line 78, FR-008 line 80, FR-010 line 86, US-01 line 46)
- Schema/RPC: `supabase/migrations/20261005113900_initial_schema.sql:8, 89–102`; `supabase/migrations/20261005153300_reservation_status_scope.sql`
- Client: `src/lib/supabase.ts:17`; `src/lib/session.tsx`; `src/lib/lists.ts:6`
- Layout: `src/app/_layout.tsx:18–25, 29–37`
