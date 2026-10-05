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

## Why this stack

GiftList is a mobile product targeting a small user base with a 5-week MVP deadline. The recommended default for `(mobile, js)` is Expo (React Native), which delivers cross-platform iOS and Android from a single TypeScript codebase. Auth is the only technology-forcing feature in scope (FR-001/FR-002 require registration and login for both roles); Expo's ecosystem supports mature auth libraries (Supabase Auth, Firebase Auth, or custom). All four agent-friendly criteria pass — typed, convention-based, popular in training data, and well-documented. Bootstrapper confidence is verified, so scaffolding will be smooth. CI runs on GitHub Actions with auto-deploy-on-merge via EAS Build.
