<!-- BEGIN @przeprogramowani/10x-cli -->

## Zestaw narzędzi AI 10xDevs - Moduł 2, Lekcja 1

Przejdź od konfiguracji sprint-zero do orkiestracji projektu za pomocą **łańcucha roadmapy**:

```
(Module 1 foundation docs) -> /10x-roadmap -> backlog-ready roadmap items
```

`/10x-roadmap` jest głównym tematem lekcji. `/10x-new` jest celowo wprowadzane w Module 2, Lesson 2, gdy wybrany element roadmapy staje się folderem zmiany implementacyjnej.

### Router zadań - Od czego zacząć

| Umiejętność | Użyj jej, gdy |
| --- | --- |
| **Roadmapa (główny temat lekcji)** | |
| `/10x-roadmap` | Masz `context/foundation/prd.md` oraz bazę projektu ze szkieletem i potrzebujesz roadmapy MVP z podejściem vertical-first. Umiejętność odczytuje PRD, sprawdza bazę kodu, korzysta z dostępnych dokumentów fundamentowych, takich jak `tech-stack.md`, `infrastructure.md` i `deploy-plan.md`, a następnie zapisuje `context/foundation/roadmap.md`. Użyj jej PRZED tworzeniem folderów dla poszczególnych zmian lub planów implementacji. |
| **Ponownie uruchom wcześniejsze kroki, jeśli to konieczne** | |
| `/10x-shape` / `/10x-prd` / `/10x-tech-stack-selector` / `/10x-bootstrapper` / `/10x-agents-md` / `/10x-infra-research` | Zebrane z Module 1, aby kontrakty fundamentowe można było poprawić przed sekwencjonowaniem roadmapy. Jeśli generowanie roadmapy ujawni lukę w PRD, popraw PRD, zanim uznasz, że backlog jest gotowy. |

### Jak łańcuch przekazuje dalej

- `/10x-roadmap` łączy produkt z implementacją. Nie wybiera frameworków, nie projektuje schematów ani nie pisze planu implementacji dla poszczególnych zmian.
- Wynikiem jest `context/foundation/roadmap.md`: uporządkowane kamienie milowe, vertical slices, ograniczone fundamenty, zależności, niewiadome, ryzyko oraz pola przekazania do backlogu.
- Elementy roadmapy powinny otrzymać stabilne, czytelne dla człowieka identyfikatory w narzędziach backlogu. Właściwy folder `context/changes/<change-id>/` jest tworzony w Lesson 2 za pomocą `/10x-new`.

### Granice roadmapy

- Domyślnie stosuj vertical slices: widoczne dla użytkownika rezultaty obejmujące UI, dane, logikę biznesową i integracje.
- Praca horyzontalna jest dozwolona wyłącznie jako ograniczony enabler, który wskazuje odblokowywany przez siebie późniejszy pionowy kamień milowy.
- Unikaj osieroconej pracy horyzontalnej, takiej jak „zbuduj całą bazę danych”, „zbuduj wszystkie endpointy API” lub „zaprojektuj całe UI” przed pierwszym widocznym dla użytkownika przepływem.
- Roadmapa nie jest estymacją kalendarzową. Nie wymyślaj dat, story points ani velocity sprintu, chyba że użytkownik wyraźnie prosi o osobny artefakt planistyczny.

### Ścieżki fundamentów używane przez tę lekcję

- `context/foundation/prd.md` - wejście
- `context/foundation/tech-stack.md` - opcjonalne wejście
- `context/foundation/infrastructure.md` - opcjonalne wejście
- `context/deployment/deploy-plan.md` - opcjonalne wejście
- `context/foundation/roadmap.md` - wyjście
- `context/foundation/lessons.md` - powtarzające się reguły i pułapki
- `docs/reference/contract-surfaces.md` - rejestr kluczowych nazw

Umiejętności nie mogą zapisywać do `context/archive/`. Zarchiwizowane zmiany są niezmienne; jeśli rozstrzygnięta ścieżka docelowa zaczyna się od `context/archive/`, przerwij z komunikatem: "This change is archived. Open a new change with `/10x-new` instead."

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
