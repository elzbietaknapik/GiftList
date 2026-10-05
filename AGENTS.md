<!-- BEGIN @przeprogramowani/10x-cli -->

## Zestaw narzędzi AI 10xDevs — Moduł 1, Lekcja 4

Wprowadź agenta do projektu, którego szkielet utworzyłeś w Lekcji 3, za pomocą **łańcucha kontekstu agenta**:

```
(/10x-init  →  /10x-shape  →  /10x-prd  →  /10x-tech-stack-selector  →  /10x-bootstrapper)  →  /10x-agents-md  →  /10x-rule-review  →  /10x-lesson
```

Łańcuch PRD → tech-stack → bootstrap pochodzi z Lekcji 1–3 (został ponownie dołączony, aby można było poprawić projekt w trakcie pracy). `/10x-agents-md`, `/10x-rule-review` i `/10x-lesson` to główne tematy lekcji. W Lekcji 5 łańcuch zostaje rozszerzony o krok infra/deploy.

### Router zadań — Od czego zacząć

| Umiejętność | Użyj jej, gdy |
| --- | --- |
| **Kontekst agenta (temat lekcji)** | |
| `/10x-agents-md` | Repozytorium ma utworzony szkielet, ale agent nie ma wdrożenia specyficznego dla projektu. Analizuje repozytorium (manifest pakietów, README, skrypty, konfigurację lint/test, układ, historię commitów) i zapisuje zwięzłe, uporządkowane „Repository Guidelines” w `AGENTS.md` (lub, gdy jest wywoływane z podkatalogu, `AGENTS.md` na poziomie katalogu, przeformułowane wokół lokalnych konwencji i dominującej jednostki). Użyj jako alternatywy dla wbudowanego `/init` hosta lub jako rozwiązania awaryjnego dla narzędzi, które go nie mają. Treść na poziomie repozytorium ma docelowo ~200 linii; przewodniki na poziomie katalogu mają docelowo 120–250 słów. |
| `/10x-rule-review <path>` | Masz plik reguł dla AI (`AGENTS.md`, plik konfiguracji AI projektu (AGENTS.md), `.cursor/rules/*.mdc`, `.github/copilot-instructions.md`, `.windsurfrules`, zagnieżdżone pliki dla poszczególnych obszarów) i chcesz uzyskać kartę wyników w 5 osiach: długość, osadzone fragmenty kodu/konfiguracji, precyzja języka, redundancja z wiedzą publiczną oraz kolejność reguł. Niezależne od narzędzia — ocenia stan artefaktu, a nie projektu. Domyślne wyjście jest tylko do odczytu; tylko Check 5 (zmiana kolejności) może edytować i wyłącznie po wyraźnej akceptacji. |
| `/10x-lesson [seed]` | Zauważyłeś powtarzającą się regułę wartą uwidocznienia w przyszłych uruchomieniach `/10x-frame`, `/10x-research`, `/10x-plan`, `/10x-plan-review`, `/10x-implement` i `/10x-impl-review`. Dopisuje pojedynczy wpis (Context / Problem / Rule / Applies to) do `context/foundation/lessons.md`. Przy pierwszym użyciu sam inicjalizuje plik z kanonicznym nagłówkiem `# Lessons Learned`. Tylko dopisywanie — nigdy nie zmienia kolejności ani nie przepisuje wcześniejszych wpisów. |
| **W razie potrzeby uruchom ponownie wcześniejsze kroki** | |
| `/10x-init` / `/10x-shape` / `/10x-prd` / `/10x-tech-stack-selector` / `/10x-bootstrapper` / `/10x-stack-assess` / `/10x-health-check` | Zgrupowane, aby można było poprawić PRD, zmienić stack lub ponownie utworzyć szkielet w trakcie pracy. Jeśli `/10x-rule-review` oznaczy `FAIL`, którego nie da się rozwiązać przez skrócenie, często wskazuje to na niejednoznaczne decyzje dotyczące PRD lub stacku — uruchom ponownie wcześniejszą umiejętność zamiast wypełniać `AGENTS.md` poprawkami. |

### Jak łańcuch przekazuje pracę dalej

- `/10x-agents-md` zapisuje (lub precyzyjnie aktualizuje) `AGENTS.md` w rozstrzygniętym zakresie. Zakres na poziomie repozytorium = plik znajduje się w katalogu głównym repozytorium i opisuje projekt jako całość; zakres na poziomie katalogu = plik znajduje się obok kodu, którym zarządza, i jest przeformułowany wokół lokalnej jednostki, całkowicie pomijając opis całego repozytorium. Umiejętność nigdy nie nadpisuje po cichu — gdy docelowy plik istnieje, przechodzi do przepływu aktualizacji.
- `/10x-rule-review` czyta dowolny plik markdown z regułami dla AI, który mu wskażesz, i wyświetla kartę wyników z 5 kontrolami (`OK` / `WARN` / `FAIL`) wraz z konkretnymi poprawkami. Nie zależy od wcześniejszego uruchomienia `/10x-agents-md`; możesz tak samo sprawdzać `.cursor/rules/`, instrukcje Copilot lub ręcznie napisany plik konfiguracji AI projektu (AGENTS.md).
- `/10x-lesson` przy pierwszym użyciu sam inicjalizuje `context/foundation/lessons.md`, a następnie dopisuje po jednym wpisie Context/Problem/Rule/Applies-to na każde wywołanie. Plik jest wykorzystywany jako wcześniejsza wiedza przez umiejętności fazy planowania i przeglądu wprowadzone później w przepływie pracy — `/10x-frame`, `/10x-research`, `/10x-plan`, `/10x-plan-review`, `/10x-implement`, `/10x-impl-review`.

### Co przechwytują umiejętności tej lekcji (i czego NIE przechwytują)

- **`/10x-agents-md` przechwytuje**: strukturę projektu, polecenia build/test/lint faktycznie obecne w skryptach, konwencje commitów wywnioskowane z historii, specyficzne dla repozytorium pułapki, które agent mógłby inaczej przeoczyć, odwołania do kanonicznych plików przez ścieżki `@` zamiast wklejania ich zawartości. Zakres na poziomie katalogu dodatkowo przechwytuje: lokalne wzorce nazewnictwa/układu wywnioskowane z sąsiednich elementów, dozwolone/zabronione importy, wzorzec testów używany przez sąsiednie elementy oraz pułapki widoczne w bezpośrednim obszarze.
- **`/10x-agents-md` NIE** wkleja zawartości `tsconfig.json` / `eslint.config` / dokumentacji frameworka, którą agent już zna; NIE generuje ogólnych intencji typu „write clean code”; NIE zastępuje wbudowanego `/init` hosta, gdy taki istnieje — jest pozycjonowane jako alternatywa lub rozwiązanie awaryjne, a nie domyślne.
- **`/10x-rule-review` przechwytuje**: ocenę długości (OK ≤ 200 niepustych linii, WARN 201–500, FAIL 501+), bloki kodu/konfiguracji, które powinny być zamiast tego odwołaniami `@`, język niejasnych intencji, redundancję z dokumentacją frameworka, którą agent zna już z treningu, oraz propozycję zmiany kolejności w Check 5, która przenosi krytyczne reguły na górę.
- **`/10x-rule-review` NIE** edytuje pliku domyślnie; NIE ocenia zawartości projektu (architektury, wyborów stacku) — ocenia stan artefaktu reguł; NIE generuje „poprawionej wersji” pliku (Check 5 może przenosić sekcje po wyraźnej akceptacji, ale nigdy nie przepisuje brzmienia reguł).
- **`/10x-lesson` przechwytuje**: jeden wpis na wywołanie z krótkim rozkazującym tytułem H2 (tytuł JEST regułą), Context (podsystem / faza / wzorzec pliku, wystarczająco konkretny, aby można było dopasować wzorzec), Problem (co konkretnie psuje się bez reguły, najlepiej wraz z wcześniejszym incydentem), Rule (1–2 zdania w trybie rozkazującym, które można dosłownie wkleić do przyszłego ustalenia przeglądu), Applies to (podzbiór `frame`, `research`, `plan`, `plan-review`, `implement`, `impl-review` lub `all`).
- **`/10x-lesson` NIE** edytuje ani nie usuwa istniejących lekcji — plik celowo obsługuje wyłącznie dopisywanie (bezmyślne przepisywanie powtarzających się reguł jest trybem porażki, któremu ta konwencja zapobiega); NIE grupuje wielu reguł na wywołanie; NIE wypełnia pól proaktywnie (użytkownik wykonuje pisanie — to cena przechwytywania reguł poza ustrukturyzowanym przeglądem).

### Test kwalifikacji (filtr dla AGENTS.md / pliku konfiguracji AI projektu (AGENTS.md))

Przed dodaniem reguły do dowolnego pliku reguł dla AI zapytaj: *czy agent mógłby wiedzieć to bez tego pliku? Czy publiczne dane treningowe — książki, blogi, repozytoria w tym stacku — mogły go na to przygotować?* Jeśli tak, usuń to. Jeśli nie, zachowaj. Plik służy do wdrożenia agenta, który zna już TypeScript / Python / twój framework, ale NIE zna twoich lokalnych konwencji.

Należy:
- nieoczywiste konwencje projektu (kształt odpowiedzi błędów, nazewnictwo plików, dozwolone ścieżki importów)
- specyficzne dla projektu pułapki i „żenujące” obejścia związane z historią lub błędami zależności
- odwołania do kanonicznych plików przez ścieżki `@` (np. `@src/features/users/user.service.ts` jako odniesienie do wzorca, a nie wklejony kod)

NIE należy:
- dokumentacja popularnych frameworków
- zawartość README, którą agent i tak przeczyta (połącz przez `@README.md`)
- popularne ogólne porady („use TypeScript strict mode”), które są już wymuszane przez konfigurację
- stwierdzenia intencji („write clean code”, „follow good practices”) — przekształć w sprawdzalne zachowanie albo usuń

### U-kształtna uwaga i szczegółowe reguły

LLM-y zwracają największą uwagę na początek i koniec kontekstu (Lost-in-the-Middle / U-shaped attention). Długi monolityczny plik konfiguracji AI projektu (AGENTS.md) umieszcza reguły ze środka w strefie najsłabszej uwagi. Dwie praktyczne konsekwencje:

1. **Najważniejsze reguły trafiają na górę** każdego pliku reguł.
2. **Reguły dla poszczególnych obszarów powinny znajdować się obok ich kodu** — zagnieżdżone `AGENTS.md` / plik konfiguracji AI projektu (AGENTS.md) wewnątrz `src/api/`, `.cursor/rules/*.mdc` z globami plików itd. Szczegółowe pliki są ładowane selektywnie i docierają w całości blisko początku własnej sekcji, zamiast być zakopane w linii 400 jednego dużego pliku.

`/10x-rule-review` Check 5 (zmiana kolejności) wdraża konsekwencję (1); test kwalifikacji wraz z `/10x-agents-md` na poziomie katalogu wdraża konsekwencję (2).

### Ćwiczenie kalibracyjne pięciu wzorców

Przed zapisaniem reguły sprawdź, czy agent rzeczywiście łamie konwencję bez niej. Wybierz jeden wzorzec ze swojego projektu (kształt odpowiedzi błędów, nazewnictwo plików, styl importów, struktura modułów, obsługa dat). Następnie:

1. Poproś agenta o zaimplementowanie wzorca 3–5 razy z czystego stanu, bez reguły.
2. Zanotuj miejsca, w których złamał konwencję; zapisz czas uruchomienia, przeanalizowane pliki oraz widoczny koszt/tokeny, jeśli host je udostępnia.
3. Dodaj regułę składającą się z 1–3 zdań w odpowiednim zakresie (root lub poziom obszaru).
4. Uruchom ponownie to samo zadanie w świeżej sesji i porównaj zgodność z konwencją, czas, pliki oraz iteracje.

Jeśli agent już bez reguły wykazuje tendencję do stosowania konwencji, nie potrzebujesz tej reguły. Jeśli systematycznie wybiera niewłaściwy wzorzec, znalazłeś regułę o dużej dźwigni, którą warto dodać. To ćwiczenie pokazuje, jak w praktyce wygląda „zasłużenie na regułę poprzez powtarzającą się porażkę”.

### Hierarchia i interoperacyjność narzędzi

- **twój asystent AI do programowania** ładuje plik konfiguracji AI projektu (AGENTS.md) z katalogu użytkownika (`katalog konfiguracji narzędzia AI/AGENTS.md`), katalogu głównego repozytorium oraz każdego podkatalogu, w którym działa agent. Głębsze pliki nadpisują lub uzupełniają pliki położone wyżej.
- **Codex** i **GitHub Copilot** ładują `AGENTS.md` od bieżącego katalogu w górę — wygrywa najbliższy plik.
- Jeden kanoniczny plik jest lepszy niż trzy duplikaty. Typowy wzorzec: `AGENTS.md` jako źródło prawdy, plik konfiguracji AI projektu (AGENTS.md) jako cienka nakładka asystenta AI z importem `@AGENTS.md`, `.github/copilot-instructions.md` tylko wtedy, gdy Copilot potrzebuje własnych dodatków. Dowiązanie symboliczne (`ln -s AGENTS.md AGENTS.md`) jest najprostszą deduplikacją, gdy narzędzia wymagają obu nazw.
- Automatyczna pamięć (np. `katalog konfiguracji narzędzia AI/projects/<dir-with-slashes-as-dashes>/memory/MEMORY.md` twojego asystenta AI do programowania) jest lokalna dla maszyny i nie zastępuje `AGENTS.md`. Reguły wiążące zespół znajdują się w repozytorium; automatyczna pamięć to osobisty cache, okresowo możliwy do przeglądu.

### Hooki wewnętrznej pętli (deterministyczne informacje zwrotne bez promptowania)

Mechaniczne, niepodlegające wyborowi kontrole powinny trafiać do hooków (np. hooka po akcji twojego asystenta AI do programowania), a nie do pliku reguł. Agent kończy edycję; uruchamia się formatter lub szybki lint; wynik wraca jako informacja zwrotna bez przypominania mu o tym. Szablon ustawień (`settings.json.template`) jest dostarczany w pakiecie lekcji jako punkt wejścia konfiguracji. Proceduralne przepływy pracy (głębszy przegląd, lista kontrolna wydania, deploy na sandbox) trzymaj w umiejętnościach, a hooki rezerwuj dla deterministycznych sygnałów narzędziowych.

### Ścieżki foundation używane przez tę lekcję

- `AGENTS.md` / plik konfiguracji AI projektu (AGENTS.md) (oraz warianty dla poszczególnych obszarów) — wynik `/10x-agents-md`
- `context/foundation/lessons.md` — wynik `/10x-lesson` (rejestr tylko do dopisywania, wykorzystywany przez przyszłe umiejętności planowania/przeglądu)
- `context/foundation/prd.md`, `context/foundation/tech-stack.md` — dane wejściowe z wcześniejszych lekcji, nadal obecne
- `docs/reference/contract-surfaces.md` — rejestr nazw mających kluczowe znaczenie (szkielet utworzony przez `/10x-init`)

### Uniwersalny język

Dostarczone umiejętności nie zawierają odniesień do 10xDevs / kohorty / certyfikacji. `/10x-agents-md` wykrywa informacje z repozytorium, w którym jest wywoływane; `/10x-rule-review` jest niezależne od narzędzia i traktuje każdy plik jako „artefakt reguł dla AI”; `/10x-lesson` zapisuje jeden format wpisu niezależnie od domeny projektu. Ćwiczenie kalibracyjne pięciu wzorców ma charakter ilustracyjny — zastąp wzorce wzorcami z własnego stacku.

Umiejętności nie mogą zapisywać do `context/archive/`. Zarchiwizowane zmiany są niezmienne; jeśli rozstrzygnięta ścieżka docelowa zaczyna się od `context/archive/`, przerwij z komunikatem: „This change is archived. Open a new change with `/10x-new` instead.”

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
