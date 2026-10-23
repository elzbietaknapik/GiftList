# Ujednolicenie UI ekranu „Twoja lista” — Plan implementacji

## Overview

Zmiana obejmuje jeden widok — `src/app/(app)/index.tsx` (S-01, ekran po zalogowaniu) — oraz wspólne tokeny i prymitywy, z których widok ma korzystać. Efekt: kolory, promienie i stany pochodzą z `src/constants/theme.ts` i `src/components/ui/`, a nie z literałów w plikach. W tym samym ruchu migrujemy `src/components/auth-form.tsx` na te same prymitywy (decyzja użytkownika), żeby w repo nie powstał drugi `Button`. Na końcu zostaje kitchen sink (route dev-only) pokazujący 7 stanów oraz reguła w `AGENTS.md`.

Zakres: tokeny, 3 prymitywy UI, wydzielenie formularza tworzenia listy i pustego stanu, migracja widoku listy i `auth-form`, kitchen sink, reguła. Poza zakresem: nowy system projektowy, nowa biblioteka UI, zmiany w `supabase/`, usuwanie martwych plików startera.

## Current State Analysis

- Tokeny istnieją i są czytane: `Colors.light` / `Colors.dark` (`src/constants/theme.ts:10-25`), `useTheme()` (`src/hooks/use-theme.ts:9-13`), `ThemedText` / `ThemedView` (`src/components/themed-text.tsx:11`, `src/components/themed-view.tsx:12`).
- Brakuje ról: `primary`, `onPrimary`, `destructive`, `ring`, promienia. Literały w widoku: `src/app/(app)/index.tsx:137` (`#ffffff`), `:182` (`Spacing.two` jako `borderRadius`), `:187` (`fontSize: 16`), `:193` (`#d92d20`), `:196` (`#3c87f7`), `:203`/`:206` (`opacity` 0.8/0.6), `:209` (`#ffffff`).
- Ten sam zestaw literałów w `src/components/auth-form.tsx:119,152,158,165,168,175,178,181` oraz w `src/components/themed-text.tsx:66` (`linkPrimary`).
- Kontrast obliczony dla obecnych wartości: label `#ffffff` na `#3c87f7` = **3.50:1** (AA wymaga 4.5:1); `#d92d20` na `#000000` = **4.35:1**; `#d92d20` na `#ffffff` = 4.83:1; `#B0B4BA` na `#000000` = 10.08:1.
- Kandydaty po decyzji użytkownika: light primary `#2563eb` z białym labelem = **5.17:1**; dark primary `#3c87f7` z czarnym labelem = **6.00:1**; dark destructive `#f97066` na `#000000` = **7.54:1**.
- `ThemedView` przyjmuje `lightColor` / `darkColor` i je ignoruje (`src/components/themed-view.tsx:7-8`, brak użycia). `ThemedText` `linkPrimary` ma zaszyty kolor w stylu (`src/components/themed-text.tsx:63-67`), więc ustawienie `themeColor` nadpisałoby go tylko przez `style`.
- Widok mieszcza dwa ekrany: formularz pierwszej listy (`index.tsx:107-144`) i placeholder listy istniejącej (`:99-105`).
- Brak runnera testów i zrzutów; jedyne automatyczne kontrole: `npx tsc --noEmit`, `npx expo lint`.
- `context/foundation/roadmap.md` nie zawiera `ui-first-list-screen` — synchronizacja statusu roadmapy nie dotyczy tej zmiany.

### Key Discoveries:

- Shared primitives: `ThemeColor` to `keyof Colors.light & keyof Colors.dark` (`src/constants/theme.ts:27`) — nowe role dodane do obu motywów automatycznie stają się dostępne przez `themeColor` w `ThemedText` / `ThemedView`.
- `ThemedText` `type="linkPrimary"` powinien brać kolor z tokenu `primary`, a nie ze stałej w `StyleSheet`.
- Ekran `index.tsx` jest w `(app)`, a bramkowanie sesji działa przez `Stack.Protected` (`src/app/_layout.tsx:19-24`) — widok zawsze ma `user`.
- `context/foundation/lessons.md` nie zawiera reguł UI; reguła powstaje w tej zmianie (`AGENTS.md`, sekcja projektowa poza markerami 10x-cli).

## Desired End State

- `Colors` zawiera role `primary`, `onPrimary`, `destructive`, `ring` w wariantach light/dark; `Radius` eksportuje `small: 8`, `medium: 12`.
- `src/components/ui/` zawiera `Button`, `TextField`, `FormError`, wszystkie oparte wyłącznie na rolach i `Radius`.
- `src/app/(app)/index.tsx` składa się z ładowania, `CreateListForm` (`src/components/create-list-form.tsx`) albo `ListEmptyState` (`src/components/list-empty-state.tsx`) oraz nagłówka z linkiem „Wyloguj”. Zero literałów kolorów, promieni i `opacity`.
- `src/components/auth-form.tsx` używa tych samych prymitywów; układ i teksty bez zmian.
- `src/app/dev/ui-states.tsx` renderuje wszystkie 7 stanów; zwraca `null` poza `__DEV__`.
- `AGENTS.md` ma regułę o tokenach, komponentach i kitchen sink poza blokiem `<!-- BEGIN/END @przeprogramowani/10x-cli -->`.
- `npx tsc --noEmit` i `npx expo lint` przechodzą; skan literałów zwraca 0 trafień w widokach i w `ui/`.

## What We're NOT Doing

- Nie tworzymy drugiej palety ani nie uruchamiamy `shadcn init`; nie dodajemy zależności UI.
- Nie dodajemy tokenu `border` — obramowanie pola w stanie fokusu i błędu rysuje `ring` / `destructive` (decyzja tej planu; odchylenie od C1 w research, które wymieniało `border`).
- Nie usuwamy martwych plików startera (`hint-row.tsx`, `web-badge.tsx`, `ui/collapsible.tsx`, `external-link.tsx`) — odroczone w research jako osobne sprzątanie.
- Nie zmieniamy `themed-text.tsx` poza `linkPrimary` i nie zmieniamy `global.css`.
- Nie dodajemy runnera zrzutów ekranu (Playwright) — bramka wizualna to kitchen sink + ręczne zrzuty.
- Nie zmieniamy logiki danych (`src/lib/lists.ts`, `src/lib/session.tsx`) ani schematu.
- Nie dodajemy stanów `hover`/`focus` na natywnym iOS/Android poza tym, co daje system; `hover` jest sprawdzany tylko na webie.

## Implementation Approach

Najpierw tokeny (Faza 1), bo wszystkie kolejne fazy z nich czytają. Następnie prymitywy (Faza 2) jako jedyne miejsce z literałami stanów (`pressed`, `disabled`, `focus`). Widok listy i `auth-form` migrują na prymitywy (Fazy 3–4), a dopiero potem kitchen sink może renderować te same komponenty w tych samych stanach (Faza 5). Każda faza kończy się tym, że widok nie zawiera literałów, których nie miał przed fazą.

Wartości tokenów (decyzja z pytań + wyliczenia kontrastu):

| Rola | light | dark | Kontrast |
| --- | --- | --- | --- |
| `primary` | `#2563eb` | `#3c87f7` | label na primary: white 5.17:1 (light) / black 6.00:1 (dark) |
| `onPrimary` | `#ffffff` | `#000000` | j.w. |
| `destructive` | `#d92d20` | `#f97066` | light 4.83:1 na `#ffffff`; dark 7.54:1 na `#000000` |
| `ring` | `#2563eb` | `#3c87f7` | fokus; wymagane ≥3:1 wobec tła pola — **do sprawdzenia w bramce (Faza 5)** |

## Critical Implementation Details

- **Focus na webie:** `Pressable` i `TextInput` raportują fokus przez `onFocus` / `onBlur` na każdej platformie; rysowanie ringu ma działać tylko dla `focused` na webie, a na natywnym `TextField` pokazuje ring przy fokusie wejścia. Nie dodawaj `outline` przeglądarki.
- **Powiązanie błędu z polem:** `TextField` przyjmuje `invalid` (kolor obramowania) i `errorId`; `FormError` renderuje się z tym samym `nativeID`. Na webie przekaż `aria-describedby={errorId}`; jeśli RN 0.86 tego nie respektuje dla `TextInput`, użyj `accessibilityHint={errorText}` jako fallbacku — potwierdź w implementacji i zapisz wybór w commicie.
- **Sprzęgło `index` ↔ `CreateListForm`:** `CreateListForm` przyjmuje `userId` i callback `onCreated(list)`. Logika `ListAlreadyExistsError` (ponowne `getMyList`) przenosi się do formularza bez zmiany zachowania.
- **Układ `auth-form`:** dotychczasowe `marginBottom` pól (`auth-form.tsx:153`) przechodzi jako prop `style` do `TextField`, aby przy migracji nie zmienić odstępów.
- **Dev-gate kitchen sink:** `src/app/dev/ui-states.tsx` zwraca `null`, gdy `__DEV__` jest `false`; route nadal istnieje w typach — to akceptowany koszt (decyzja użytkownika).

## Phase 1: Tokeny ról i promienia

### Overview

Dodać role `primary`, `onPrimary`, `destructive`, `ring` i eksport `Radius`, podpiąć `linkPrimary` pod token i usunąć nieużywane props w `ThemedView`.

### Changes Required:

#### 1. Role kolorów i promienia

**File**: `src/constants/theme.ts`

**Intent**: Jedno źródło wartości dla akcentu, tekstu na akcencie, błędu i fokusu w obu motywach; zastąpić użycie `Spacing.two` jako promienia osobnym tokenem.

**Contract**: `Colors.light` otrzymuje `primary: '#2563eb'`, `onPrimary: '#ffffff'`, `destructive: '#d92d20'`, `ring: '#2563eb'`; `Colors.dark` otrzymuje `primary: '#3c87f7'`, `onPrimary: '#000000'`, `destructive: '#f97066'`, `ring: '#3c87f7'`. Dodany eksport `Radius = { small: 8, medium: 12 } as const`. Wartości istniejących `text`, `background`, `backgroundElement`, `backgroundSelected`, `textSecondary` oraz `Spacing`/`Fonts`/`MaxContentWidth` bez zmian.

#### 2. Link primary z tokenu

**File**: `src/components/themed-text.tsx`

**Intent**: `linkPrimary` ma kolor z roli `primary`, a nie z literału w `StyleSheet`, więc zmiana marki działa także dla linków.

**Contract**: Usunąć `color: '#3c87f7'` z `styles.linkPrimary`. Domyślny kolor koloru tekstu wyliczać jako `themeColor ?? (type === 'linkPrimary' ? 'primary' : 'text')`. Sygnatura `ThemedTextProps` bez zmian.

#### 3. Usunięcie ignorowanych props

**File**: `src/components/themed-view.tsx`

**Intent**: Usunąć `lightColor` / `darkColor`, które nic nie robią i sugerują konfigurację, której nie ma.

**Contract**: Typ `ThemedViewProps` traci pola `lightColor` i `darkColor`; destrukturyzacja w funkcji je pomija. Zachowanie `type?: ThemeColor` bez zmian.

### Success Criteria:

#### Automated Verification:

- Type checking passes: `npx tsc --noEmit`
- Linting passes: `npx expo lint`
- Role istnieją w obu motywach: `src/constants/theme.ts` zawiera `primary`, `onPrimary`, `destructive`, `ring` w `light` i `dark`, oraz eksport `Radius`
- Brak literału `#3c87f7` w `src/components/themed-text.tsx`

#### Manual Verification:

- Zrzut ekranu „przed” obecnego widoku listy i logowania zapisany w `context/changes/ui-first-list-screen/screenshots/before/` (baseline do porównania w Fazie 5)
- Linki „Zarejestruj się” / „Zaloguj się” nadal widoczne w obu motywach

**Implementation Note**: Po weryfikacji automatycznej zatrzymać się na potwierdzenie manualne przed Fazą 2.

---

## Phase 2: Wspólne prymitywy UI

### Overview

Dodać `Button`, `TextField`, `FormError` w `src/components/ui/`. To jedyne miejsce, w którym żyją stany `pressed`, `disabled`, `focus` i `invalid`.

### Changes Required:

#### 1. Przycisk

**File**: `src/components/ui/button.tsx`

**Intent**: Jeden przycisk akcji dla całego repo; stany wizualne i dostępność w jednym miejscu.

**Contract**: `Button({ label, onPress, loading?, disabled?, accessibilityLabel? })`. Tło `theme.primary`, tekst `ThemedText` z `themeColor="onPrimary"`, promień `Radius.small`, padding `Spacing.three` w pionie. Stan `pressed` → opacity 0.8; `disabled` lub `loading` → opacity 0.5 i `accessibilityState={{ disabled: true, busy: loading }}`; `loading` zastępuje label spinnerem w kolorze `onPrimary`. Na webie w stanie `focused` ring 2px `theme.ring` (przez `Pressable` style callback). `accessibilityRole="button"`.

#### 2. Pole tekstowe

**File**: `src/components/ui/text-field.tsx`

**Intent**: Jedno pole dla e-maila, hasła i nazwy listy z tym samym tłem, fokusem i stanem błędu.

**Contract**: `TextField(TextInputProps & { invalid?: boolean; errorId?: string; style? })`. Kontener `ThemedView type="backgroundElement"`, promień `Radius.small`, obramowanie 2px: transparentne domyślnie, `theme.ring` przy fokusie, `theme.destructive` przy `invalid`. Wewnętrzny `TextInput` z `placeholderTextColor={theme.textSecondary}`, `color={theme.text}`, `paddingVertical: Spacing.three`, `paddingHorizontal: Spacing.three`, `fontSize: 16` (jedyny literał rozmiaru, zostaje w prymitywie). Przekazuje `aria-invalid`, `aria-describedby={errorId}` (fallback: `accessibilityHint`, patrz Critical Implementation Details). `style` z propów trafia na kontener.

#### 3. Komunikat błędu

**File**: `src/components/ui/form-error.tsx`

**Intent**: Jeden sposób pokazania błędu, powiązany z polem i ogłaszany przez czytnik ekranu.

**Contract**: `FormError({ children, nativeID? })` → `ThemedText type="small" themeColor="destructive"`, `accessibilityLiveRegion="polite"`, `nativeID` przekazany do węzła (id dla `errorId`). Wyrównanie tekstu `center` zgodne z obecnym błędem w `index.tsx:187`.

### Success Criteria:

#### Automated Verification:

- Type checking passes: `npx tsc --noEmit`
- Linting passes: `npx expo lint`
- Pliki istnieją: `src/components/ui/button.tsx`, `src/components/ui/text-field.tsx`, `src/components/ui/form-error.tsx`
- Skan literałów w `src/components/ui/` (regex z `10x-ui`, bez `fontSize`) zwraca 0 trafień

#### Manual Verification:

- Na webie `Tab` przechodzi po `TextField` i `Button` z widocznym ringiem `ring`
- `disabled` i `loading` wyglądają na wyłączone i pozostają czytelne

**Implementation Note**: Zatrzymać się po weryfikacji manualnej przed Fazą 3.

---

## Phase 3: Widok listy na prymitywach

### Overview

Wydzielić formularz tworzenia i pusty stan z `index.tsx`, przepiąć je na prymitywy i usunąć z widoku wszystkie literały.

### Changes Required:

#### 1. Formularz tworzenia listy

**File**: `src/components/create-list-form.tsx`

**Intent**: Formularz pierwszej listy jako osobny komponent, żeby `index.tsx` był tylko routingiem stanów.

**Contract**: `CreateListForm({ userId, onCreated })`. Stan: `name`, `error`, `saving`. Submit: `trim`, pusta nazwa → błąd „Podaj nazwę listy.”; `createList(userId, name)`; `ListAlreadyExistsError` → `getMyList(userId)` i `onCreated(existing)`; sukces → `onCreated(created)`. Tekst „Utwórz swoją pierwszą listę prezentową.” (`ThemedText themeColor="textSecondary"`). Pole `TextField` z `placeholder="Nazwa listy"`, `invalid={!!error}`, `errorId="create-list-error"`; `FormError nativeID="create-list-error"`; `Button label="Zapisz" loading={saving}`. Układ: kolumna z `gap: Spacing.three`.

#### 2. Pusty stan listy

**File**: `src/components/list-empty-state.tsx`

**Intent**: Stan „lista istnieje, jest pusta” jako osobny komponent, który może też renderować kitchen sink.

**Contract**: `ListEmptyState()` → kolumna wyśrodkowana, `gap: Spacing.two`, tekst „Twoja lista jest jeszcze pusta.” (`type="default"`) i podpowiedź „Dodawanie prezentów w kolejnym kroku.” (`themeColor="textSecondary"`, wyśrodkowana).

#### 3. Widok ekranu

**File**: `src/app/(app)/index.tsx`

**Intent**: Zostawić w widoku tylko ładowanie, nagłówek z wylogowaniem i wybór między formularzem a stanem pustej listy.

**Contract**: Usunąć z pliku `handleCreate`, pola `name`/`error`/`saving` i wszystkie `StyleSheet` związane z formularzem. Nagłówek bez zmian (`ThemedText type="subtitle"`, `Pressable` z `ThemedText type="linkPrimary"` „Wyloguj”). Ładowanie: `ActivityIndicator` z `color` z `useTheme().primary`. Gałęzie: `list` → `ListEmptyState`; brak → `CreateListForm userId={user.id} onCreated={setList}`. Błąd `getMyList` przy ładowaniu nadal ustawia `error` i jest pokazany `FormError` pod nagłówkiem. Brak literałów `#...`, `opacity`, `fontSize`, `borderRadius`.

### Success Criteria:

#### Automated Verification:

- Type checking passes: `npx tsc --noEmit`
- Linting passes: `npx expo lint`
- Pliki istnieją: `src/components/create-list-form.tsx`, `src/components/list-empty-state.tsx`
- Skan regex (z `10x-ui`) na `src/app/(app)/index.tsx`, `src/components/create-list-form.tsx`, `src/components/list-empty-state.tsx` zwraca 0 trafień

#### Manual Verification:

- Nowy użytkownik bez listy: formularz; pusta nazwa → błąd przy polu i brak zapisu
- Zapis listy → widok z nazwą i pustym stanem
- Ponowne uruchomienie: lista nadal widoczna; „Wyloguj” wraca do auth
- Sprawdzić wygląd w jasnym i ciemnym motywie

**Implementation Note**: Zatrzymać się po weryfikacji manualnej przed Fazą 4.

---

## Phase 4: Migracja auth-form na prymitywy

### Overview

Zastąpić w `AuthForm` lokalny `Pressable`, pola i błąd prymitywami; układ, teksty i logika walidacji bez zmian.

### Changes Required:

#### 1. Formularz auth

**File**: `src/components/auth-form.tsx`

**Intent**: Usunąć drugą implementację przycisku, pól i błędu, zachowując zachowanie login/register.

**Contract**: Dwa `TextField` (e-mail: `keyboardType="email-address"`, `autoComplete="email"`, `autoCapitalize="none"`, `autoCorrect={false}`; hasło: `secureTextEntry`, `autoCapitalize="none"`), każde z `style={{ marginBottom: Spacing.three }}`, `invalid` gdy aktywny błąd walidacji. `FormError` z `nativeID="auth-error"` zamiast lokalnego `ThemedText` (zachować `marginBottom: Spacing.three`). `Button label={submitLabel} loading={submitting} onPress={handleSubmit}` zamiast `Pressable`. Usunąć lokalne `styles.field`, `styles.input`, `styles.error`, `styles.errorText`, `styles.button`, `styles.buttonPressed`, `styles.buttonDisabled`, `styles.buttonText`; `useTheme` usunąć, jeśli nieużywany. Logika `validate`, `handleSubmit`, `switchRow` bez zmian.

### Success Criteria:

#### Automated Verification:

- Type checking passes: `npx tsc --noEmit`
- Linting passes: `npx expo lint`
- Skan regex na `src/components/auth-form.tsx` zwraca 0 trafień

#### Manual Verification:

- Logowanie i rejestracja: pola, przycisk i przełącznik wyglądają jak przed zmianą (porównanie z `before/`)
- Puste pola / hasło < 6 znaków → błąd i obramowanie `destructive` przy polu
- Stan `loading` podczas wysyłki bez przeskoku layoutu

**Implementation Note**: Zatrzymać się po weryfikacji manualnej przed Fazą 5.

---

## Phase 5: Stany, bramka wizualna i reguła

### Overview

Dodać kitchen sink z 7 stanami, wykonać bramkę wizualną na desktopie i jednej szerokości mobilnej, dopisać regułę do `AGENTS.md` i wykonać końcowy skan.

### Changes Required:

#### 1. Kitchen sink (dev-only)

**File**: `src/app/dev/ui-states.tsx`

**Intent**: Jedna strona renderująca widok we wszystkich 7 stanach obok siebie, do zrzutów i przeglądu.

**Contract**: Na początku komponentu `if (!__DEV__) return null;`. Sekcje: **default** (`Button`, `TextField` pusty, `ListEmptyState`); **disabled** (`Button disabled`, `TextField editable={false}`); **error** (`TextField invalid` + `FormError`); **focus-visible** (`TextField autoFocus` — widoczne na webie); **hover** (N/A na natywnym — pokazywane przez najechanie kursorem na webie, z powodem w tabeli); **loading** (`Button loading`, `ActivityIndicator` w sekcji ładowania listy); **empty** (`ListEmptyState`). Brak importów z `src/lib/supabase` — kitchen sink nie dotyka danych.

#### 2. Reguła w AGENTS.md

**File**: `AGENTS.md`

**Intent**: Następny agent ma czytać tokeny i prymitywy, a nie wpisywać literały; reguła żyje poza blokiem zarządzanym przez 10x-cli.

**Contract**: Dodać na końcu sekcji `## Project: Expo / React Native app` (po `### Workflow`) podsekcję `### UI tokens & components` z punktami: tokeny ról w `src/constants/theme.ts` (`Colors`, `Radius`, `Spacing`); prymitywy w `src/components/ui/` (`Button`, `TextField`, `FormError`) — sprawdź katalog przed utworzeniem komponentu; zakaz literałów kolorów, wartości arbitralnych i `opacity` w widokach (`src/app/`, `src/components/`, poza `ui/` i `constants/theme.ts`); kitchen sink `src/app/dev/ui-states.tsx` do bramki wizualnej.

#### 3. Bramka wizualna i kontrola końcowa

Bez pliku źródłowego — wykonanie zgodnie z kryteriami poniżej.

### Success Criteria:

#### Automated Verification:

- Type checking passes: `npx tsc --noEmit`
- Linting passes: `npx expo lint`
- Skan regex (z `10x-ui`, z wyjątkiem `src/constants/theme.ts` i `src/components/ui/text-field.tsx` dla `fontSize`) na `src/app/(app)/`, `src/app/(auth)/`, `src/components/auth-form.tsx`, `src/components/create-list-form.tsx`, `src/components/list-empty-state.tsx`, `src/components/ui/` zwraca 0 trafień
- `AGENTS.md` zawiera `### UI tokens & components` poza markerami `<!-- BEGIN/END @przeprogramowani/10x-cli -->`
- Pliki istnieją: `src/app/dev/ui-states.tsx`

#### Manual Verification:

- Zrzuty kitchen sink: desktop (web) i jedna szerokość mobilna (390 px); porównanie z `before/` dla login/index
- Kontrast: `ring` na tle `backgroundElement` ≥3:1 (zmierzyć narzędziem lub wyliczyć); label `onPrimary` na `primary` ≥4.5:1 w obu motywach
- Wszystkie 7 stanów pokazane albo oznaczone jako N/A z powodem (hover na natywnym)
- Tryb ciemny: oba motywy w kitchen sink; przełącznik motywu systemowego nie łamie czytelności
- Pełny przepływ: rejestracja/logowanie → utworzenie listy → wylogowanie działa (brak regresji)

**Implementation Note**: Po fazie zatrzymać się na przegląd (`/10x-impl-review`) przed archiwizacją.

---

## Testing Strategy

### Unit Tests:

- Brak runnera testów w repo (`AGENTS.md`) — nie dodajemy frameworka.

### Integration Tests:

- Brak zmian w bazie i w `src/lib/`; przepływ danych weryfikowany ręcznie w Fazie 3 i 5.

### Manual Testing Steps:

1. `npx expo start --web`, zrobić zrzut „przed” login i index zanim ruszy Faza 1.
2. Po Fazie 3: zarejestrować konto, zapisać pustą nazwę → błąd przy polu; zapisać poprawną nazwę → widok listy.
3. Po Fazie 4: login z błędnym hasłem → `FormError` i obramowanie `destructive`.
4. Po Fazie 5: otworzyć `/dev/ui-states` na web przy szerokości desktop i 390 px; przejść Tabem przez elementy i potwierdzić ring.
5. Przełączyć motyw systemowy i ponownie przejść kroki 2–4.

## Performance Considerations

Brak zmian w zapytaniach. Prymitywy są prostymi komponentami bez dodatkowych efektów; React Compiler (`app.json` `reactCompiler: true`) obsługuje memoizację.

## Migration Notes

Brak migracji danych. Zmiana wartości `primary` w jasnym motywie jest widoczna w całej aplikacji (linki i przyciski) — zamierzone.

## References

- Research: `context/changes/ui-first-list-screen/research.md` (zarzuty C1–C5, kontrast)
- Change: `context/changes/ui-first-list-screen/change.md`
- Kontrakt UI: `.claude/skills/10x-ui/SKILL.md` (7-stanowa macierz, reguła, bramka)
- Tokeny: `src/constants/theme.ts:10-25`, `src/constants/theme.ts:54-62`
- Literały do usunięcia: `src/app/(app)/index.tsx:137,182,187,193,196,203,206,209`, `src/components/auth-form.tsx:119,152,158,165,168,175,178,181`, `src/components/themed-text.tsx:66`
- Routing i bramka: `src/app/_layout.tsx:19-24`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Tokeny ról i promienia

#### Automated

- [x] 1.1 Type checking passes: `npx tsc --noEmit`
- [x] 1.2 Linting passes: `npx expo lint`
- [x] 1.3 Role `primary`, `onPrimary`, `destructive`, `ring` w obu motywach oraz eksport `Radius` w `src/constants/theme.ts`
- [x] 1.4 Brak literału `#3c87f7` w `src/components/themed-text.tsx`

#### Manual

- [ ] 1.5 Zrzuty „przed” login i index zapisane w `context/changes/ui-first-list-screen/screenshots/before/`
- [ ] 1.6 Linki „Zarejestruj się” / „Zaloguj się” widoczne w obu motywach

### Phase 2: Wspólne prymitywy UI

#### Automated

- [ ] 2.1 Type checking passes: `npx tsc --noEmit`
- [ ] 2.2 Linting passes: `npx expo lint`
- [ ] 2.3 Pliki `src/components/ui/button.tsx`, `text-field.tsx`, `form-error.tsx` istnieją
- [ ] 2.4 Skan regex na `src/components/ui/` (bez `fontSize`) — 0 trafień

#### Manual

- [ ] 2.5 Na webie Tab przechodzi po `TextField` i `Button` z widocznym ringiem
- [ ] 2.6 Stany `disabled` i `loading` czytelne

### Phase 3: Widok listy na prymitywach

#### Automated

- [ ] 3.1 Type checking passes: `npx tsc --noEmit`
- [ ] 3.2 Linting passes: `npx expo lint`
- [ ] 3.3 Pliki `src/components/create-list-form.tsx`, `src/components/list-empty-state.tsx` istnieją
- [ ] 3.4 Skan regex na `index.tsx`, `create-list-form.tsx`, `list-empty-state.tsx` — 0 trafień

#### Manual

- [ ] 3.5 Pusta nazwa → błąd przy polu i brak zapisu
- [ ] 3.6 Zapis listy → widok z nazwą i pustym stanem; ponowne uruchomienie zachowuje listę
- [ ] 3.7 Wylogowanie wraca do auth; wygląd poprawny w jasnym i ciemnym motywie

### Phase 4: Migracja auth-form na prymitywy

#### Automated

- [ ] 4.1 Type checking passes: `npx tsc --noEmit`
- [ ] 4.2 Linting passes: `npx expo lint`
- [ ] 4.3 Skan regex na `src/components/auth-form.tsx` — 0 trafień

#### Manual

- [ ] 4.4 Login i rejestracja wyglądają jak przed zmianą (porównanie z `before/`)
- [ ] 4.5 Błędy walidacji: `destructive` przy polu; stan `loading` bez przeskoku layoutu

### Phase 5: Stany, bramka wizualna i reguła

#### Automated

- [ ] 5.1 Type checking passes: `npx tsc --noEmit`
- [ ] 5.2 Linting passes: `npx expo lint`
- [ ] 5.3 Skan regex na wszystkich plikach objętych zmianą (z wyjątkami z kryteriów) — 0 trafień
- [ ] 5.4 `AGENTS.md` zawiera `### UI tokens & components` poza markerami 10x-cli
- [ ] 5.5 Plik `src/app/dev/ui-states.tsx` istnieje i zwraca `null` poza `__DEV__`

#### Manual

- [ ] 5.6 Zrzuty kitchen sink desktop i 390 px; porównanie z `before/`
- [ ] 5.7 Kontrast `ring` ≥3:1 wobec `backgroundElement`; `onPrimary` na `primary` ≥4.5:1 w obu motywach
- [ ] 5.8 Wszystkie 7 stanów pokazane lub oznaczone N/A z powodem
- [ ] 5.9 Pełny przepływ rejestracja → lista → wylogowanie bez regresji
