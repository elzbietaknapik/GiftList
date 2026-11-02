<!-- BEGIN @przeprogramowani/10x-cli -->

## Zestaw narzędzi AI 10xDevs — Moduł 4, Lekcja 1 (Kontekst na dużą skalę)

Ten plik reguł powinien być zwięzły i wskazywać na kontekst znajdujący się gdzie indziej. Duży codebase nie potrzebuje większego pliku głównego.

```
lean root rules file -> context/ (system of record) -> per-module rules only when a trigger signal appears
```

### Router zadań — od czego zacząć

| Umiejętność | Użyj jej, gdy |
| --- | --- |
| `/10x-agents-md` -> `/10x-rule-review` | Odchudzasz rozbudowany główny plik reguł: przenieś szczegóły do `context/` i pozostaw wskaźnik. |
| `/10x-ray <skill> [args]` | Chcesz zobaczyć, jak działa umiejętność: mapuje ona kroki umiejętności, rozgałęzienia i bramki wymagające udziału człowieka, następnie ją uruchamia i wyjaśnia każdy krok w trakcie jego wykonywania. Dodaj `--mode html`, aby obserwować w przeglądarce. |
| `/10x-lesson` | Błąd agenta, który stale wraca, powinien stać się zapisaną lekcją, a nie kolejną linią w tym pliku. |

### Twarde reguły

- **Pliki instrukcji sumują się; nie nadpisują się.** Narzędzia łączą pliki główne, zagnieżdżone i na poziomie użytkownika. Nie powtarzaj tej samej reguły na kilku poziomach.
- **Test włączenia.** Linia należy tutaj tylko wtedy, gdy agent popełniłby bez niej błąd. Fakty, które agent może odczytać z kodu lub z `context/`, pozostają tam i otrzymują wskaźnik.
- **Dodawaj strukturę per-module tylko wtedy, gdy pojawi się sygnał.** Przykłady: agent stale myli dwa obszary albo konwencje jednego modułu wypierają wszystko inne. Sam rozmiar repozytorium nie jest sygnałem.

<!-- END @przeprogramowani/10x-cli -->

## Project: Expo / React Native app

Expo SDK 57, React Native 0.86, React 19.2, TypeScript `strict: true`. Entrypoint is `expo-router/entry`. This repo was scaffolded by the 10x-bootstrapper; its intent lives in `context/foundation/prd.md` / `shape-notes.md` / `tech-stack.md`.

### Commands (npm — package-lock.json, not bun)

- `npx expo install <pkg>` — ALWAYS use to add a dependency so an SDK-compatible version is resolved; do not `npm install <pkg>` directly.
- `npx expo start` — dev server (`npm run web` for web; web output is static).
- `npx expo lint` — lint; `npx tsc --noEmit` — typecheck. Run both before declaring work done.
- `npx expo-doctor` — diagnose config/dependency issues; `npx expo install --fix` — repair incompatible versions.
- No test runner is configured — do not invent a `test` command.

### Routing & layout

- File-based routing (Expo Router): every file in `src/app/` is a screen; `_layout.tsx` defines navigators. Keep non-route code out of `src/app/` (`src/components/`, `src/hooks/`, `src/constants/`).
- Path aliases: `@/*` → `src/*`, `@/assets/*` → `assets/*` (tsconfig.json).
- Platform-suffixed files exist (`.web.tsx`, `.module.css`): edit the right variant — e.g. `animated-icon.web.tsx` vs `animated-icon.tsx`.
- Web styles use CSS / CSS modules (`src/global.css`, `.module.css`), which is unusual for a RN project.

### Gotchas

- Expo ships breaking changes every SDK. Check the `expo` version in `package.json` and consult https://docs.expo.dev/versions/v<major>.0.0/ (or /llms.txt) before using Expo/RN APIs instead of trusting memory.
- `ios/` and `android/` are generated (Continuous Native Generation) and gitignored — never hand-edit; configure native behavior in `app.json` and plugins.
- `app.json` enables `reactCompiler` and `typedRoutes` experiments. Typed routes generate `.expo/types/` (gitignored); regenerate via `npx expo start`.
- Expo Go bundles only its own native modules; adding a library with native code requires a dev build (`npx expo run:ios|android` or `eas build --profile development`).

### Workflow

- Do not edit inside the `<!-- BEGIN/END @przeprogramowani/10x-cli -->` block above — it is managed and re-synced by the 10x-cli tool.
- Never overwrite `context/` (PRD, plans, hand-offs); it is the source of truth for the bootstrap chain.

### UI tokens & components

- Design tokens (color roles `primary`, `onPrimary`, `destructive`, `ring`, plus `Radius` and `Spacing`) live in `src/constants/theme.ts`.
- Primitives `Button`, `TextField`, `FormError` live in `src/components/ui/` — check that directory before creating any component.
- No color literals, arbitrary values, or opacity in views (`src/app/`, `src/components/` except `src/components/ui/` and `constants/theme.ts`).
- The visual gate for primitives is `src/app/dev/ui-states.tsx` (dev route, returns `null` outside `__DEV__`).
