---
project: "GiftList"
researched_at: "2026-10-05"
recommended_platform: "Supabase"
runner_up: "Convex"
context_type: "mvp"
tech_stack:
  language: "TypeScript"
  framework: "Expo (React Native 0.86) / Expo SDK 57"
  runtime: "React 19.2, Node.js for EAS Build"
  database: "Postgres (managed by Supabase)"
deployment_target: "EAS Build → App Store / Google Play (mobile binary); Supabase for backend"
---

## Recommendation

**Deploy the GiftList backend on Supabase.**

Supabase is the right fit because: (a) the Expo project ships with `eas integrations:supabase:connect` as a first-class integration, so a single CLI command provisions the project, writes `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` to `.env.local` and to all EAS environments, and installs `@supabase/supabase-js` + `expo-sqlite`; (b) it colocates every backend concern the PRD names — Auth (FR-001/002), Postgres for the gift list / gifts / reservations schema (FR-003…FR-011), Realtime for the "immediately visible" reservation rule, and Row Level Security to enforce the "hidden identity" guardrail at the database layer rather than in client code; (c) the user is already comfortable on Supabase, which the interview flagged as a tie-breaker; (d) the platform publishes its pricing and docs as markdown (`pricing.md`, GitHub-hosted MDX), ships an MCP server (OAuth), and exposes a deterministic `supabase` CLI (`init`, `start`, `db push`, `db diff`, `functions deploy`, `secrets set`) — all five agent-friendly criteria pass; (e) pricing weights favor DX over raw cost, and Supabase's free tier (50,000 MAU, 500 MB database, 1 GB storage, 50,000 Realtime messages) is more than enough for a 5-week MVP targeting a small user base.

The mobile binary continues to deploy via EAS Build to the App Store / Play Store (as already locked in `tech-stack.md`); Supabase is the data, auth, and realtime plane the Expo client talks to.

## Platform Comparison

Scoring rubric from `references/agent-friendly-criteria.md`: each criterion is **Pass / Partial / Fail**. Hard filters applied first: persistent-connection requirement is **No** (so serverless-first BaaS stays in the pool); tech-stack compatibility is met by every candidate listed below. Soft weights from the interview: DX > cost, familiarity = Supabase, single region, colocation preferred. GA status checked 2026-10-05.

| Platform | CLI-first | Managed / Serverless | Agent-accessible docs | Stable deploy API | MCP / first-class integration | Verdict |
|---|---|---|---|---|---|---|
| **Supabase** | Pass — `supabase` CLI; deterministic `db push`, `functions deploy`, `secrets set`; official `eas integrations:supabase:connect` for Expo | Pass — managed Postgres + Auth + Realtime + Storage + Edge Functions; no infra to operate | Pass — docs published as MDX on GitHub; `pricing.md` exposed; `llms.txt` available | Pass — `supabase deploy` and `supabase functions deploy <name>` are deterministic, support env-specific deploys | Pass — Supabase MCP server (OAuth, GA) referenced from supabase.com | **5 / 5 Pass** |
| **Firebase** | Pass — `firebase` CLI; well-known `firebase deploy` workflow | Pass — fully managed on Google Cloud; Firestore + Auth + Storage + Functions | Partial — `firebase.google.com/docs` is rendered HTML; some GitHub-hosted but pricing page is JS-rendered | Pass — `firebase deploy` and GitHub Actions integration are stable | Pass — Firebase MCP server (`stdio`) is shipped with the Firebase CLI and integrates with Claude Code, Cursor, Windsurf, Gemini CLI | **4 / 5 Pass, 1 Partial** |
| **Convex** | Pass — `convex` CLI (`npx convex dev`, `npx convex deploy`); official `eas integrations:convex:connect` for Expo | Pass — fully managed serverless with reactive queries; no infra to operate | Pass — `docs.convex.dev` is MDX on GitHub | Pass — `npx convex deploy` and per-PR preview deployments | Partial — official EAS integration covers Expo provisioning, but a standalone Convex MCP server is not widely documented | **4 / 5 Pass, 1 Partial** |
| **Appwrite** | Pass — `appwrite` CLI; `appwrite deploy` | Pass — managed Auth + DB + Functions + Storage + Sites | Pass — docs and changelogs are markdown, open source | Pass — `appwrite deploy` is deterministic | Pass — Appwrite MCP server (`https://mcp.appwrite.io`) and Appwrite Skills (`npx skills add appwrite/skills`) are first-class | **5 / 5 Pass**, but **React Native SDK was "open beta" as of 2024-04-08** — current GA status in 2026 must be verified before adoption |
| **Fly.io** (custom backend) | Pass — `flyctl` (`fly deploy`, `fly logs`, `fly releases`, `fly status`) is the gold standard for agent operability | Partial — Firecracker VMs, not serverless; you operate the runtime, the container image, and the schema | Pass — `fly.io/docs` is MDX on GitHub | Pass — `fly deploy` and machine API are deterministic | Partial — no first-class Fly MCP server; CLI is the agent path | **3 / 5 Pass, 2 Partial** |
| **Railway** (custom backend) | Pass — `railway` CLI (`railway logs`, `railway run`, `railway up`); IaC being sunset (Aug 28, 2026 → Dec 1, 2026) — version-sensitive | Partial — VM/container-based with managed Postgres / MySQL / Redis plugins | Pass — docs are markdown on GitHub | Pass — `railway up` and GitHub integration are stable | Pass — Railway MCP server exists (region-limited coverage noted in changelog) | **3 / 5 Pass, 2 Partial** |

### Per-platform notes

- **Supabase.** Five passes; weakest signal is the realtime quota (Free 200 concurrent peaks + 2M messages/month), which is generous in development and tightens under real-world fan-out. Free plan pauses after 1 week of low compute activity — non-fatal for an actively-developed MVP, fatal if a preview environment goes idle and exhausts the 2-free-projects quota.
- **Firebase.** Strong offline persistence and RN SDK maturity, but Spark "shuts the app off on quota breach" rather than overage-billing, and phone authentication has required a Cloud Billing account since September 2024 — a phone-first login flow forces Blaze from the start. Firestore's document model means the "hidden identity" guardrail becomes a Security Rules exercise rather than an RLS policy you can read next to the schema.
- **Convex.** `useQuery` updates without manual refetch is a clean fit for "Po rezerwacji prezent jest natychmiast widoczny" (PRD acceptance criterion), but authorization lives in Convex function bodies, not at the schema layer — the PRD's identity-hiding rule becomes a code invariant rather than a database invariant, and auditability is worse. S16 free tier has a 40-deployment-per-team cap, which constrains preview-environment sprawl.
- **Appwrite.** Five passes and the open-source / self-hostable story is appealing, but the React Native SDK was explicitly "open beta" as of 2024-04-08 — production readiness for RN is a 2026 question that has to be answered before recommending it. Marked down because the SDK status is unverified, not because of the platform itself.
- **Fly.io.** Strongest CLI of any candidate, but introduces a backend that has to be written (Hono / Express / tRPC) and operated (image builds, schema migrations, secrets rotation). For a 5-week MVP with no backend code yet, this is 1-2 weeks of work the team has not budgeted. Pricing update effective October 1, 2026.
- **Railway.** Fastest custom-backend DX with built-in Postgres, but Hobby plan ($5/mo with $5 of usage credit) hits ~$25-40/month for a multi-service app, the free tier was killed in July 2023, and the current Config-as-code system is being sunset Aug 28 → Dec 1, 2026 — a near-term migration the team would absorb.

### Why Supabase beats Firebase and Convex for *this* MVP

| Axis | Supabase | Firebase | Convex |
|---|---|---|---|
| DX for Expo (5-week deadline) | `eas integrations:supabase:connect` one-command | Manual wiring; mature SDK but more config surface | `eas integrations:convex:connect` one-command |
| Hidden-identity guardrail auditability | **RLS in SQL**, next to the schema | Firestore Security Rules (separate language) | Convex function bodies (code, not schema) |
| Interview fit (familiarity + colocation) | ✅ | ❌ (no familiarity stated) | ❌ (no familiarity stated) |
| Free-tier behavior on overage | Overage billing on Pro, pause on Free after inactivity | Spark **shuts the app down** | Overage on Starter, errors on Free |
| Realtime coverage | 200 concurrent connections / 2M messages (Free) | Subscriptions on Firestore docs / RTDB | Reactive `useQuery` per query, no quota to count |

## Anti-Bias Cross-Check: Supabase

### Devil's Advocate — Weaknesses
1. **RLS policy misconfiguration can leak reservation identity silently.** The PRD's "hidden identity" guardrail is enforced by Postgres policies; a single overly-permissive `select` policy on `reservations` exposes `reserver_user_id` to any logged-in viewer. Failures don't fire tests — they surface only under load or in screenshots.
2. **Free plan pauses after 1 week of inactivity.** With the 2-active-projects cap, a stale preview environment can exhaust quota during a quiet sprint and force a delete-or-upgrade choice before the MVP ships.
3. **Realtime quotas look generous until a real event.** 200 concurrent peak connections (Free) / 500 (Pro); 2M messages/month (Free). One family-sized shared list with multiple devices per user can saturate the cap — failure mode is "new clients can't subscribe," not graceful degradation.
4. **Pro plan is not $25.** $25 plan + $10/Micro compute (covered by $10 compute credit on Min one) + egress + storage. A "small MVP" can be $40-60/month before any user signs up; budget caps are manual.
5. **`autoRefreshToken` on RN needs explicit AppState wiring.** Tokens expire silently when the device sleeps for a long time and users are logged out without warning. The Supabase Expo guide mentions this, but the generic quickstart omits it.

### Pre-Mortem — How This Could Fail
Six months after launch, the Supabase backend turned out to be a disaster. The hidden-identity rule that the PRD treats as the centerpiece was the first casualty: during a refactor of the `reservations` table, a new RLS policy read `auth.uid()` directly but didn't isolate the column projection — any authenticated viewer could `select *` from `reservations` and see who reserved what. The team learned of the leak only when an Obdarowujący shared a screenshot of the reservation dashboard. The second blow was Realtime. On a holiday weekend, 200+ family members opened the same list and the 200-concurrent-connection cap hit instantly; new clients failed to subscribe, reservations looked broken, and the team fell back to polling — breaking the "immediately visible" requirement the PRD made a must-have. The third hit was billing: Pro $25 + Micro compute $10 + storage + egress turned into $40–60/month for what was supposed to be a small-scale MVP, forcing a painful migration while users were active. Lesson: Supabase's RLS is a sharp tool, and Realtime quotas look generous until a real event crowds the system.

### Unknown Unknowns
- **RLS does not automatically apply to Realtime broadcasts the same way it applies to REST.** Policies must be wired per channel; an incorrect assumption here can leak identity through a subscription path that REST tests never exercised. (Status: not widely documented; flag for this investigation.)
- **`service_role` keys bypass RLS entirely.** Any secret placed in `EXPO_PUBLIC_*` env vars is shipped in the Expo bundle and is discoverable via APK reverse-engineering. `EXPO_PUBLIC_*` is public by design — keep `service_role` only in EAS Secrets, never in the client.
- **Free-plan "1 week inactivity" is defined as low compute activity, not zero requests.** A project can pause while a user is logged in on a phone in a remote area; manual unpause is the only fix.
- **RLS performance regression risk.** Policies that hit `auth.uid()` against every row of an unindexed `reservations` table silently degrade once the table grows; Supabase does not warn.
- **Postgres logical replication lag during high write periods** can cause Realtime subscribers to miss the most recent update, showing stale "free" status — the opposite of the surprise-preserving guarantee.

## Operational Story

How Supabase operates day-to-day for this Expo MVP:

- **Preview deploys.** EAS Branch Preview builds ship the JS bundle that talks to the **Preview** Supabase project (the Supabase EAS integration creates a separate project per EAS environment when `--environment` is used). To enable a Preview Supabase project, run `eas integrations:supabase:connect --environment preview`; the project URL and publishable key are written only to that EAS environment, leaving Production untouched. Preview environments share the same Auth/RPC surface as production, so client code does not branch on URL — the env var points where it needs to.
- **Secrets.** `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` are public-by-design (the client needs them) and live in `.env.local` (gitignored) and in the EAS project's named environments (Production / Preview / Development). **Never** store `SUPABASE_SERVICE_ROLE_KEY` in `EXPO_PUBLIC_*` — use `eas env:create` with `--environment production` and read it server-side only (Edge Functions or webhook handlers). Database password and JWT secret stay in Supabase's project vault and are rotated from the dashboard.
- **Rollback.** Schema is migrated forward via `supabase db push` against a linked project; there is no first-class rollback — destructive migrations must be written as forward-only with an explicit `down.sql` kept under `supabase/migrations/`. Edge Function rollbacks are `supabase functions deploy <name>` with the previous tag — Supabase keeps function version history. To revert the schema, write a corrective `down` migration in `supabase/migrations/<timestamp>_revert_<feature>.sql` and run `supabase db push`. Real-time publication changes are gated to migrations, not to function deploys.
- **Approval.** Schema migrations, function deploys, and secret rotations are dev and may be performed unattended by an agent via the `supabase` CLI with a scoped access token. **Destructive actions are reserved for the human**: dropping a project, rotating the primary service-role key, deleting the Auth user base, and removing a realtime publication that removes a product. Manual steps take 30 seconds in the dashboard; cleaning up an automated mistake takes hours. CI secrets (the `SUPABASE_ACCESS_TOKEN`) are scoped per-project via a Personal Access Token with the minimum scopes the agent needs.
- **Logs.** `supabase logs <function-name>` (Edge Functions), `supabase db logs` (Postgres logs), and `supabase storage logs` (Storage logs) — all read-only via the CLI. The Supabase MCP server exposes typed log tools (read-only) so the agent does not parse CLI output. For Postgres, `psql` against the connection string with a read-only user is the escape hatch for slow queries during incident response.

## Risk Register

Each row ties the entry to the lens that surfaced it. Mitigation is concrete and actionable at MVP scope.

| # | Risk | Source | Likelihood | Impact | Mitigation |
|---|---|---|---|---|---|
| 1 | RLS misconfiguration leaks `reserver_user_id` to logged-in viewers, breaking the "hidden identity" guardrail | Devil's advocate | M | H | Add a Supabase test suite (`supabase test db`) that runs as the `authenticated` role for both Życzący and Obdarowujący and asserts `select` from `reservations` never returns the reserver column. Pin the test to CI on the GitHub Actions auto-deploy flow. |
| 2 | Free-plan pause after 1 week inactivity knocks preview environment offline during a quiet sprint | Devil's advocate | M | M | Either upgrade the preview organization to Pro ($25/mo) before demo day, or pin a manual unpause reminder to the team's calendar; document unpause command (`supabase projects list` → dashboard → Restore). |
| 3 | Realtime 200-concurrent-connection cap saturates on a single large shared list (family of 30+) | Devil's advocate / Pre-mortem | M | H | Architect the reservation status as a `supabase.from('gifts')` refetch under `useFocus` rather than realtime-only; treat Realtime as an enhancement, not the source of truth. Document the fallback in the gift detail screen. |
| 4 | Pro plan math is not $25 — $10 compute + $25 plan + egress + storage reaches $40-60/month | Devil's advocate | L | M | Set a spending cap via Supabase's budget alert; downgrade to Free for any week with zero MAU growth; treat compute credits as the variable cost and review the monthly invoice in week 4. |
| 5 | RN token refresh breaks when the device sleeps — users get logged out silently | Devil's advocate | M | M | Wire `AppState.addEventListener('change', state => { supabase.auth.startAutoRefresh() / .stopAutoRefresh() })` in `src/lib/supabase.ts`; add a comment pinning the wiring to Supabase Expo guide. |
| 6 | RLS does not auto-apply to broadcast channels — identity leaks via subscription path that REST tests never exercised | Unknown unknowns | L | H | Test both REST and Realtime paths against the `authenticated` role in CI; document the realtime publication rules in `supabase/migrations/<timestamp>_realtime_policies.sql`. |
| 7 | `service_role` key accidentally bundled in `EXPO_PUBLIC_*` env var → full DB access in the client | Unknown unknowns | L | H | Pre-commit grep on `.env*` and `app.config.ts` for `service_role`; add a CI step that fails the build when `EXPO_PUBLIC_SUPABASE_SERVICE_ROLE_KEY` (or any `EXPO_PUBLIC_*_SECRET_*`) is set. |
| 8 | RLS performance regression on unindexed `reservations` table silently degrades at scale | Unknown unknowns | M | M | Add an index on `reservations(gift_id)` and an EXPLAIN check in CI for the `select` path the gift list uses; alert if query plan changes between deploys. |
| 9 | Postgres logical replication lag causes Realtime subscribers to miss the most recent reservation update | Unknown unknowns | L | M | On the reservation screen, optimistically mark "reserved" client-side immediately after `insert` resolves, before Realtime confirms. Never block UX on Realtime. |
| 10 | Free-plan quota exhaustion when running production + preview + dev as separate projects (2-active-projects cap) | Research finding | M | M | Use the preview org to host the **preview** environment, not a separate org; pair down to one dev project for free-tier development and rely on EAS Preview + Production branches for the rest. |
| 11 | `detectSessionInUrl` is `false` on RN but `true` on web — copying from Supabase quickstart omits this and breaks auth on mobile | Research finding | L | M | Set `detectSessionInUrl: false` explicitly in the Supabase client init; add a lint rule or comment in `src/lib/supabase.ts` noting the platform difference. |

## Getting Started

Concretely, in this order, with the version-pinned Expo / EAS / Supabase toolchain:

1. **Link the Expo project to EAS** (if not already linked by `/10x-bootstrapper`):
   ```bash
   npm install -g eas-cli
   eas init
   ```
2. **Connect Supabase via the official EAS integration.** This one command provisions the Supabase project, writes `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` to `.env.local` and to all EAS environments, installs `@supabase/supabase-js` and `expo-sqlite`, and adds the `expo-sqlite` config plugin. Reference: https://docs.expo.dev/guides/using-supabase/
   ```bash
   eas integrations:supabase:connect
   ```
3. **Initialize local Supabase dev environment.** Runs Postgres + Auth + Storage in Docker so migrations are testable locally before push.
   ```bash
   npx supabase init
   npx supabase start
   ```
   On Windows, ensure Docker Desktop is running before `supabase start`.
4. **Author the schema as forward-only SQL with RLS policies** under `supabase/migrations/`:
   - `gifts_lists`, `gifts`, `reservations` tables
   - RLS: `gifts_lists` readable by any logged-in user with a valid share token; `gifts` readable by anyone with the list share token; `reservations` readable for status columns (`free / reserved / purchased`) but the `reserver_user_id` column is **never** returned to any client (enforced via a Postgres `view` that omits the column).
   - Realtime publication for `gifts` and `reservations` only (not `reservations.reserver_user_id`).
5. **Wire the Expo client.** Create `src/lib/supabase.ts` with the client config from Step 2 of the Expo guide, including the AppState refresh wiring (Risk #5) and `detectSessionInUrl: false` (Risk #11).
6. **Wrap the Expo Router root** in any providers needed (none today) and ship to EAS Preview branch to verify the backend before promoting to Production.

## Out of Scope

The following were not evaluated in this research:
- Docker image configuration for a custom backend (no custom backend was chosen).
- CI/CD pipeline setup beyond the GitHub Actions auto-deploy-on-merge already locked in `tech-stack.md`.
- Production-scale architecture (multi-region, HA, DR, dedicated tenant isolation). Free/Pro plans cover MVP scope; Team / Enterprise plans are a separate decision.
- Migrating the Auth user base off Supabase (out of MVP scope; portable Postgres + portable auth model mean an exit is technically open but not currently scheduled).
- Self-hosted Supabase (a deployment variant available to Supabase customers on Enterprise plans; not needed for MVP).