# Research: ui-first-list-screen

## Identity

- **Change:** `ui-first-list-screen` — audyt i poprawa jednego widoku: `src/app/(app)/index.tsx`.
- **Typ zmiany:** UI / system projektowy (istniejący, nie nowy).
- **Cel:** widok „Twoja lista” (S-01) ma czytać wartości i komponenty z repo, pokryć 7 stanów i zostawić regułę dla kolejnych widoków.
- **Poza zakresem:** nowa paleta, `shadcn init` / nowa biblioteka UI, rebranding całego MVP, nowy widok, którego nie ma.

## Wariant kontraktu systemu projektowego

**Istniejący system projektowy.** Nie wymieniamy go i nie zakładamy drugiego.

| Połowa kontraktu | Gdzie w tym repo | Stan |
| --- | --- | --- |
| Wartości (tokeny) | `src/constants/theme.ts` — `Colors.light` / `Colors.dark`, `Fonts`, `Spacing` | istnieje, ale nie ma ról: `primary`, `onPrimary`, `destructive`, `border`, `radius`, skali typografii |
| Publicznie przez | `useTheme()` → `Colors[scheme]`; `ThemedText` (`type`, `themeColor`); `ThemedView` (`type`) | działa; brak wariantu dark dla kolorów akcentu, bo role nie istnieją |
| Komponenty | `src/components/` (`themed-text`, `themed-view`, `auth-form`, `ui/collapsible`, …) | brak `Button` / `TextField` / `FormError`; `auth-form` jest de-facto referencją, ale specyficzną dla auth |

Dark mode jest realny: `app.json` ma `"userInterfaceStyle": "automatic"`, a `useColorScheme` przełącza `Colors.light` / `Colors.dark`. Dlatego każdy literał koloru w widoku jest błędem w jednym z motywów.

`src/global.css` zawiera tylko zmienne fontów (`--font-*`); **nie ma tam tokenów kolorów**. Źródłem wartości jest `theme.ts` — nie szukaj palety w CSS.

## Audyt dwukierunkowy

### Źródło → widoki

Użycia tokenów (import + odwołania) per plik:

| Plik | Odwołania do `theme.*` / `Colors` / `Spacing` / `Fonts` |
| --- | --- |
| `src/app/(app)/index.tsx` | 13 |
| `src/components/auth-form.tsx` | 16 |
| `src/components/ui/collapsible.tsx` | 9 |
| `src/app/(auth)/register.tsx` | 2 |
| `src/components/hint-row.tsx` | 3 |

- Tokeny są czytane — plik tokenów **nie jest martwy**. Problemem są brakujące role, nie brak konsumpcji.
- `src/constants/theme.ts:6` importuje `@/global.css` z modułu stałych — to jedyne miejsce ładowania CSS na webie; fonty web są referencjami `var(--font-*)` (`theme.ts:46-51`). Działa, ale mieszanie warstwy CSS do modułu tokenów warto zostawić bez zmian w tej zmianie.
- Katalog komponentów (`src/components/`) zawiera **cztery nieużywane pliki ze startera**: `hint-row.tsx`, `web-badge.tsx`, `ui/collapsible.tsx`, `external-link.tsx` (żadnego importu w `src/app/`), w tym z literałami (`ui/collapsible.tsx:55` `borderRadius: 12`) i domyślnym tekstem „Try editing / app/index.tsx” (`hint-row.tsx:14`). Agent czytający katalog trafia na ślepe kopie.

### Widok → źródło

Skan literałów na `src/app/(app)/index.tsx` (4 kolory + 3 literały nie-kolorowe):

| Literał | Linia | Powinien pokryć |
| --- | --- | --- |
| `#ffffff` (`ActivityIndicator`) | 137 | `onPrimary` |
| `fontSize: 16` | 187 | skala typografii / `ThemedText` |
| `#d92d20` (błąd) | 193 | `destructive` (z wariantem dark) |
| `#3c87f7` (tło przycisku) | 196 | `primary` |
| `opacity: 0.8` / `0.6` | 203, 206 | stany `pressed` / `disabled` oparte na tokenach lub komponencie `Button` |
| `#ffffff` (tekst przycisku) | 209 | `onPrimary` |
| `Spacing.two` jako `borderRadius` | 182 | brakujący token `radius` (obecnie token odstępu pełni rolę promienia) |

Duplikaty poza widokiem (ten sam wzorzec, te same literały): `src/components/auth-form.tsx:112-125` (Pressable + style) oraz `:79-103` (pola), `:152` (`Spacing.two` jako radius), `:158` (`fontSize: 16`), `:165` (`#d92d20`), `:168` (`#3c87f7`), `:181` (`#ffffff`). `src/components/themed-text.tsx:66` ma `#3c87f7` w `type="linkPrimary"` — „primary” istnieje w dwóch miejscach z tą samą wartością, ale bez tokenu.

### Kontrast (obliczone dla obecnych wartości)

| Para | Ratio | Ocena |
| --- | --- | --- |
| `#ffffff` na `#3c87f7` (label przycisku 14 px/700) | **3.50:1** | poniżej AA 4.5:1 dla tekstu normalnego |
| `#3c87f7` jako tekst linku na `#ffffff` | **3.50:1** | poniżej AA |
| `#d92d20` na `#000000` (dark mode, 16 px) | **4.35:1** | poniżej AA 4.5:1 |
| `#d92d20` na `#ffffff` | 4.83:1 | OK |
| `#B0B4BA` (`textSecondary` dark) na `#000000` | 10.08:1 | OK |

Wniosek: nie wystarczy przenieść literałów do `Colors` — wartości `primary` / `onPrimary` / `destructive` muszą dostać osobne warianty light/dark, inaczej poprawka utrwali 3.5:1.

### Stany i dostępność (dowody)

- Brak `accessibilityLabel` / `aria-*` w widoku; `TextInput` (`index.tsx:113-120`) i `Pressable` (`:127-135`) nie mają dostępnej nazwy poza placeholderem/tekstem.
- Błąd jest tylko tekstem pod formularzem (`:123-125`) — nie jest powiązany z polem (`accessibilityDescribedBy` / `aria-describedby`), pole nie zmienia obramowania.
- Interakcja: wyłącznie `pressed` (`:130-134`). Brak `hover` i `focus-visible` (web), brak `disabled` innego niż `opacity: 0.6` (`:205-207`).
- Loading: pełnoekranowy `ActivityIndicator` (`:80-86`) — poprawne dla pierwszego ładowania; po zapisie spinner jest w przycisku (`:136-138`), więc layout nie skacze.
- Empty: prawdziwy stan pusty z tekstem (`:99-105`), ale gałąź „lista istnieje” to placeholder („Dodawanie prezentów w kolejnym kroku”) — nie ma jeszcze czego stylizować poza nagłówkiem i pustym stanem.

## Ograniczenia i konwencje repo

- Brak runnera testów i brak Playwrighta (`package.json`). Bramką wizualną będzie **kitchen sink** (jeden ekran renderujący 7 stanów) + zrzuty desktop/mobile; nie dodajemy zależności testowej.
- `npx expo lint` i `npx tsc --noEmit` są jedynymi automatycznymi kontrolami.
- Routing: `src/app/(app)/_layout.tsx` to goły `Stack`; ochrona sesji jest w `src/app/_layout.tsx:19-24` (`Stack.Protected`), więc widok zawsze ma `user` — gałąź `if (!userId) return` (`index.tsx:34`) nie jest ścieżką „wylogowany”.
- Język UI: polski. Nazwy tokenów: angielskie role.
- `AGENTS.md` nie ma żadnej reguły o tokenach ani komponentach; `context/foundation/lessons.md` nie ma reguł UI. To jest miejsce na nową regułę po implementacji.

## Charges

| ID | Kategoria | Dowód (plik:linia) | Wpływ na użytkownika | Faza planu |
| --- | --- | --- | --- | --- |
| C1 | Brakujące tokeny | `src/constants/theme.ts:10-25` (brak `primary`/`onPrimary`/`destructive`/`border`); literały `src/app/(app)/index.tsx:137,193,196,209`, `src/components/themed-text.tsx:66` | Dark mode i zmiana marki nie zmieniają przycisku ani błędu; label przycisku ma 3.5:1, błąd w dark 4.35:1 — poniżej AA | 2 (wartości tokenów) |
| C2 | Brakujący współdzielony komponent | `src/app/(app)/index.tsx:112-143` vs `src/components/auth-form.tsx:79-125` (identyczny `Pressable` + pole + błąd) | Każdy kolejny ekran kopiuje formularz; poprawka focus/disabled/error musi być robiona N razy | 1 (środowisko/biblioteka — decyzja) → 3 (widok) |
| C3 | Brakujące tokeny | `src/app/(app)/index.tsx:182` (`Spacing.two` jako `borderRadius`), `:187` (`fontSize: 16`); `src/constants/theme.ts:54-62` (brak `Radius` i skali typografii); to samo `src/components/auth-form.tsx:152,158` | Promienie i rozmiary tekstu są przypadkowe i rozjeżdżają się między ekranami; `Spacing` znaczy dwie różne rzeczy | 2 (wartości tokenów) |
| C4 | Brakujące stany + a11y | `src/app/(app)/index.tsx:113-120` (pole bez nazwy), `:123-125` (błąd niepowiązany z polem), `:130-134` (tylko `pressed`), `:205-207` (`disabled` = opacity) | Użytkownik klawiatury nie widzi fokusu; czytnik ekranu nie ogłasza nazwy pola/przycisku; błąd nie wskazuje pola | 4 (stany, 7-macierz) |
| C5 | Przypadkowa architektura | `src/app/(app)/index.tsx:99-145` — onboarding „utwórz pierwszą listę” i widok istniejącej listy w jednym pliku; `src/components/themed-view.tsx:7-15` przyjmuje `lightColor`/`darkColor` i je ignoruje | Kolejny slice (prezenty/udostępnianie) doklei UI do tego pliku; podanie `lightColor`/`darkColor` daje złudzenie konfiguracji i cichy brak efektu | 3 (widok) |

**Deferred (poza zakresem tej zmiany):** usunięcie nieużywanych plików startera (`hint-row.tsx`, `web-badge.tsx`, `ui/collapsible.tsx`, `external-link.tsx`) — powód: osobne sprzątanie katalogu komponentów, nie zmiana jednego widoku; odnotowane, bo zaśmieca katalog, z którego korzysta agent.

## Implikacje dla planu

1. Faza 1 musi rozstrzygnąć **jedno**: czy `Button` / `TextField` / `FormError` powstają jako nowe pliki w `src/components/` (bez nowej zależności), czy `AuthForm` jest rozbijany i oba widoki przechodzą na wspólne primitives. Rekomendacja: nowe pliki + migracja `index.tsx`, `auth-form` tylko jeśli nie zwiększa ryzyka.
2. Faza 2 dodaje role do `theme.ts`: `primary`, `onPrimary`, `destructive`, `border`, `radius` (i ewentualnie skalę typografii), z wartościami light/dark dobranymi tak, by `onPrimary`/`primary` i `destructive` przechodziły 4.5:1.
3. Faza 3 przepisuje `index.tsx` na tokeny + nowe komponenty; literały muszą zniknąć (skan = 0 na tym pliku).
4. Faza 4 pokrywa 7 stanów w kitchen sink; `error` i `focus-visible` są obowiązkowe, `hover` tylko na webie.
5. Reguła po implementacji: blok UI w `AGENTS.md` **poza** markerami 10x-cli (tokeny w `theme.ts`, komponenty w `src/components/`, zakaz literałów, kitchen sink).
