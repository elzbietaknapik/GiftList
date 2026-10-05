---
bootstrapped_at: 2026-09-28T11:22:00Z
starter_id: expo
starter_name: "Expo (React Native)"
project_name: gift-list
language_family: js
package_manager: npm
cwd_strategy: subdir-then-move
bootstrapper_confidence: verified
phase_3_status: ok
audit_command: "npm audit --json"
---

## Hand-off

Verbatim copy of `context/foundation/tech-stack.md`:

```yaml
---
starter_id: expo
package_manager: npm
project_name: gift-list
hints:
  language_family: js
  team_size: solo
  deployment_target: appstore-via-eas
  ci_provider: github-actions
  ci_default_flow: auto-deploy-on-merge
  bootstrapper_confidence: verified
  path_taken: standard
  quality_override: false
  self_check_answers: null
  has_auth: true
  has_payments: false
  has_realtime: false
  has_ai: false
  has_background_jobs: false
---
```

### Why this stack

GiftList is a mobile product targeting a small user base with a 5-week MVP deadline. The recommended default for `(mobile, js)` is Expo (React Native), which delivers cross-platform iOS and Android from a single TypeScript codebase. Auth is the only technology-forcing feature in scope (FR-001/FR-002 require registration and login for both roles); Expo's ecosystem supports mature auth libraries (Supabase Auth, Firebase Auth, or custom). All four agent-friendly criteria pass — typed, convention-based, popular in training data, and well-documented. Bootstrapper confidence is verified, so scaffolding will be smooth. CI runs on GitHub Actions with auto-deploy-on-merge via EAS Build.

## Pre-scaffold verification

| Signal       | Value                                     | Severity | Notes                                       |
| ------------ | ----------------------------------------- | -------- | ------------------------------------------- |
| npm package  | create-expo-app v5.0.0 published 2026-09-23 | fresh    | resolved from cmd_template (`npx create-expo-app`) |
| GitHub repo  | not run                                   | —        | card.docs_url is `https://docs.expo.dev`, not a GitHub URL |

## Scaffold log

**Resolved invocation**: `npx create-expo-app .bootstrap-scaffold --yes --template default`
**Strategy**: subdir-then-move
**Exit code**: 0
**Files moved**: 13 (`.git`, `.vscode`, `assets`, `node_modules`, `scripts`, `src`, `.gitignore`, `app.json`, `LICENSE`, `package-lock.json`, `package.json`, `README.md`, `tsconfig.json`)
**Conflicts (.scaffold siblings)**: `.claude` → `.claude.scaffold`; `AGENTS.md` → `AGENTS.md.scaffold`; `CLAUDE.md` → `CLAUDE.md.scaffold`
**.gitignore handling**: moved silently (no pre-existing cwd `.gitignore` to merge)
**context/ handling**: scaffold shipped no `context/`; cwd `context/` preserved untouched
**.bootstrap-scaffold cleanup**: deleted (empty after move-up)
**Note**: `create-expo-app` initialized its own repo (single `Initial commit`, no remote). It was moved up with the tree. Bootstrapper does not manage git; the user may keep it or re-init.

## Post-scaffold audit

**Tool**: npm audit --json
**Summary**: 0 CRITICAL, 0 HIGH, 14 MODERATE, 0 LOW
**Direct vs transitive**: 3 MODERATE direct of 14 total (npm audit distinguishes direct vs transitive)

#### CRITICAL findings

None.

#### HIGH findings

None.

#### MODERATE findings

| Package | Severity | Scope      | Via / cause                                             |
| ------- | -------- | ---------- | ------------------------------------------------------- |
| expo    | moderate | direct     | @expo/cli; @expo/config; @expo/config-plugins; @expo/local-build-cache-provider; @expo/metro-config |
| expo-router | moderate | direct | query-string                                            |
| expo-splash-screen | moderate | direct | @expo/config-plugins                          |
| @expo/cli | moderate | transitive | @expo/config; @expo/config-plugins; @expo/inline-modules; @expo/metro-config; @expo/prebuild-config |
| @expo/config | moderate | transitive | @expo/config-plugins                                 |
| @expo/config-plugins | moderate | transitive | xcode                                        |
| @expo/inline-modules | moderate | transitive | @expo/config-plugins                        |
| @expo/local-build-cache-provider | moderate | transitive | @expo/config                   |
| @expo/metro-config | moderate | transitive | @expo/config                                 |
| @expo/prebuild-config | moderate | transitive | @expo/config; @expo/config-plugins         |
| decode-uri-component | moderate | transitive | (leaf advisory)                             |
| query-string | moderate | transitive | decode-uri-component                        |
| uuid     | moderate | transitive | (leaf advisory)                                         |
| xcode    | moderate | transitive | uuid                                                    |

Root causes: the `xcode` toolchain depends on an outdated `uuid@7.x` (npm deprecation warning at install), and `query-string`/`decode-uri-component`. Both are pulled through the Expo CLI toolchain, not through app runtime code.

#### LOW / INFO findings

None.

## Hints recorded but not acted on

| Hint                       | Value                 |
| -------------------------- | --------------------- |
| bootstrapper_confidence    | verified              |
| quality_override           | false                 |
| path_taken                 | standard              |
| self_check_answers         | null                  |
| team_size                  | solo                  |
| deployment_target          | appstore-via-eas      |
| ci_provider                | github-actions        |
| ci_default_flow            | auto-deploy-on-merge  |
| has_auth                   | true                  |
| has_payments               | false                 |
| has_realtime               | false                 |
| has_ai                     | false                 |
| has_background_jobs        | false                 |

## Next steps

Next: a future skill will set up agent context (CLAUDE.md, AGENTS.md). For now, your project is scaffolded and verified — happy hacking.

Useful manual steps in the meantime:
- `git init` (if you have not already) to start your own repo history. Note: `create-expo-app` left its own single-commit repo in place; keep or replace it as you see fit.
- Review the `.scaffold` siblings the conflict policy created (`.claude.scaffold`, `AGENTS.md.scaffold`, `CLAUDE.md.scaffold`) and decide which version of each to keep. `diff AGENTS.md AGENTS.md.scaffold` to compare.
- Address audit findings per your project's risk tolerance — the full breakdown is in this log.
