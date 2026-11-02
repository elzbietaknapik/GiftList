# Fix Swallowed Session Bootstrap Error (P-03) Implementation Plan

## Overview

`SessionProvider` uruchamia `supabase.auth.getSession()` bez obsługi błędów. Odrzucenie promise zostawia `loading = true` na zawsze, a `RootNavigator` wtedy zwraca `null` (pusty ekran). Wynik `{ session: null, error }` jest ignorowany, więc błąd sieci przy starcie kieruje użytkownika na login bez śladu w logach. Plan wprowadza jedną ścieżkę bootstrapu, która zawsze kończy się jednym z trzech stanów: sesja, wylogowanie po błędzie auth (z logiem), albo błąd z przyciskiem ponowienia. Każdy błąd trafia do jednego punktu raportowania `reportError`.

## Current State Analysis

- `src/lib/session.tsx:21-25`: `getSession().then(...)` ustawia `setSession` i `setLoading(false)` tylko w `.then`. Brak `.catch`, `error` z wyniku nie jest czytany.
- `src/app/_layout.tsx:13-15`: `if (loading) return null;`. Przy odrzuceniu aplikacja nie renderuje nic.
- `src/app/_layout.tsx:19-24`: `Stack.Protected` przełącza `(auth)` / `(app)` wyłącznie na podstawie `session`. Brak trzeciego stanu „błąd”.
- `src/lib/supabase.ts:17-26`: klient z `storage: AsyncStorage`, `autoRefreshToken: true`, `persistSession: true`.
- `node_modules/@supabase/auth-js` 2.117.2:
  - `GoTrueClient.js:2544-2570`: nieudany refresh przy braku ważnej sesji w storage zwraca `{ data: { session: null }, error }`. Dotyczy to też błędu sieci, gdy access token wygasł.
  - `GoTrueClient.js:2491-2504`: `_useSession` ma `try/finally` bez `catch`, więc wyjątki storage propagują się jako odrzucenie.
  - `fetch.js`: błędy sieci i statusy retryable mapują się na `AuthRetryableFetchError`; odpowiedzi auth (np. 400 `refresh_token_not_found`) mapują się na `AuthApiError` (`isAuthApiError`).
- Brak testów w `src/`. `vitest.config.mts:5` już obejmuje `src/**/*.{test,spec}.{ts,tsx}`; `package.json` ma `"test": "vitest run"`, a vitest 5.0.5 jest zainstalowany. Nie ma `@testing-library/*` ani `react-test-renderer`.
- Konwencje UI: `src/app/` i `src/components/` nie mogą zawierać literałów kolorów; używać `ThemedText`, `Button` (`src/components/ui/button.tsx`) i tokenów z `src/constants/theme.ts`.
- `context/audits/observability/2026-10-30_reservations-gifts.md` P-02 (brak sinka raportowania w `src/`) i P-03 (ten błąd) są w kolejności napraw jako pozycja 1 (§6). Ten plan buduje minimalny szew `reportError`, który P-02 później podepnie pod tracker.

### Key Discoveries:

- Dwie formy błędu bootstrapu: odrzucenie (`session.tsx:21`) i rozwiązanie z `error` (auth-js `GoTrueClient.js:2570`). Druga jest częstsza w tym SDK i nie wiesza aplikacji, tylko ukrywa błąd.
- Rozróżnienie błędów: `isAuthApiError(error)` = unieważniona/wygasła sesja (legalne wylogowanie); wszystko inne (`AuthRetryableFetchError`, nieznany wyjątek) = błąd do pokazania i ponowienia.
- `vitest` działa bez zmian konfiguracji, jeśli testowany kod nie importuje `@/` (brak aliasu w `vitest.config.mts`) i nie importuje `src/lib/supabase.ts` (rzuca przy braku env). Dlatego logika bootstrapu wydzielona jest do czystego modułu z wstrzykiwanym `getSession` i `report`.

## Desired End State

Po wdrożeniu każde wywołanie bootstrapu kończy się w jednym z trzech stanów, bez pustego ekranu i bez cichego błędu:

1. Sesja ważna lub brak sesji bez błędu → dotychczasowe zachowanie (`(app)` / `(auth)`).
2. Błąd auth (unieważniony refresh token) → `(auth)` login, a wpis `reportError` z `reason: 'auth-cleared'` jest w konsoli.
3. Odrzucenie lub błąd nie-auth (np. sieć) → ekran `SessionErrorView` z przyciskiem „Spróbuj ponownie”, a wpis `reportError` z `reason: 'rejected'` lub `'error-result'`. Ponowienie ponawia `getSession()`.

Weryfikacja: testy jednostkowe czterech wyników (Phase 1–2) oraz ręczne scenariusze w Phase 3.

## What We're NOT Doing

- Pełny P-02: brak `ErrorBoundary`, globalnych handlerów, integracji z trackerem i konfiguracji środowiska/release.
- P-04 (`signOut` z ignorowanym `{ error }`, `startAutoRefresh` / `stopAutoRefresh` z ignorowanymi promise w `supabase.ts:28-37`).
- P-05 (`SplashScreen.hideAsync().finally` bez `.catch` w `animated-icon.tsx:50-55`).
- Błędy danych po zalogowaniu (G-01, P-01, G-02 — `getMyList`, `listGifts`, formularze).
- Zmiana zachowania `onAuthStateChange` poza tym, że nie może nadpisać sesji błędem.
- Aktualizacja `AGENTS.md` (zdanie „No test runner is configured”) i `context/foundation/test-plan.md §4` (Jest/jest-expo). To osobna praca dokumentacyjna; wskazana w Open Risks.
- Dodawanie zależności testowych (`@testing-library/react-native`, `jest-expo`).
- Wpis w `src/app/dev/ui-states.tsx` (bramka wizualna dla primitives; `SessionErrorView` nie jest primitive).

## Implementation Approach

Logika decyzji (co znaczy wynik `getSession`) żyje w czystym module, który przyjmuje `getSession` i `report` jako parametry. Dzięki temu cztery przypadki są testowane vitestem bez React i bez klienta Supabase. `session.tsx` tylko wywołuje tę logikę i trzyma stan (`bootstrapError`, `retryBootstrap`). Warunek renderowania błędu w `_layout.tsx` to `!session && bootstrapError`, więc późniejsze zdarzenie `onAuthStateChange` z sesją zawsze wygrywa.

Test-first: Phase 1 dodaje czerwone testy, Phase 2 wprowadza logikę i szew raportowania, Phase 3 podłącza stan do UI i retry.

## Phase 1: Failing tests for bootstrap outcomes

### Overview

Zapisać cztery przypadki wyniku bootstrapu jako testy, które przed implementacją kończą się czerwono.

### Changes Required:

#### 1. Bootstrap outcome tests

**File**: `src/lib/session-bootstrap.test.ts` (nowy)

**Intent**: Zablokować cztery wyniki, na których opiera się cała zmiana: odrzucenie, wylogowanie po błędzie auth, błąd nie-auth, poprawna sesja.

**Contract**: Importuje `runSessionBootstrap` z `./session-bootstrap`. Każdy przypadek przekazuje stub `getSession` i spy `report`. Oczekiwania:
- odrzucenie `getSession` → wynik `error` równy rzuconemu obiektowi, `session: null`, `report` wywołany z kontekstem `reason: 'rejected'`;
- `{ session: null, error: new AuthApiError(...) }` → `error: null`, `session: null`, `report` z `reason: 'auth-cleared'`;
- `{ session: null, error: new AuthRetryableFetchError(...) }` → `error` ustawiony, `session: null`, `report` z `reason: 'error-result'`;
- `{ session: S, error: null }` → `session: S`, `error: null`, `report` nie wywołany.

### Success Criteria:

#### Automated Verification:

- Nowy plik testowy istnieje i zawiera cztery przypadki: `npm test -- session-bootstrap` kończy się błędem z powodu brakującego modułu `./session-bootstrap` (czerwony przed Fazą 2).
- Pozostałe testy w repozytorium nie zmieniają wyniku (brak innych testów w `src/`).

## Phase 2: Reporting seam and bootstrap classification

### Overview

Dodać `reportError` i `runSessionBootstrap`, aby cztery testy z Fazy 1 przeszły.

### Changes Required:

#### 1. Reporting seam

**File**: `src/lib/report-error.ts` (nowy)

**Intent**: Jedyny punkt raportowania błędów sesji; obecnie opakowuje `console.error`, a P-02 podepnie w tym miejscu tracker.

**Contract**: `reportError(error: unknown, context: Record<string, string>): void`. Zapisuje kontekst i pełny obiekt błędu jako argumenty `console.error` (zachowany stack). Nigdy nie rzuca. Kontekst zawiera wyłącznie pola diagnostyczne (`phase`, `reason`); bez danych użytkownika i bez e-maila.

#### 2. Bootstrap classification

**File**: `src/lib/session-bootstrap.ts` (nowy)

**Intent**: Zamienić surowy wynik `getSession` na jeden z trzech wyników, a każdy błąd zgłosić przez `report` przed zwróceniem.

**Contract**: `runSessionBootstrap(getSession: () => Promise<{ data: { session: Session | null }; error: unknown }>, report?: typeof reportError): Promise<{ session: Session | null; error: unknown }>`. Funkcja nigdy nie odrzuca promise.
- Odrzucenie: `error` = rzucony obiekt, `report(err, { phase: 'getSession', reason: 'rejected' })`.
- `error` z `isAuthApiError(error)`: `session: null`, `error: null`, `report(error, { phase: 'getSession', reason: 'auth-cleared' })`.
- `error` inny (w tym `AuthRetryableFetchError`): `error` ustawiony, `session: null`, `report(error, { phase: 'getSession', reason: 'error-result' })`.
- Brak błędu: `session` z wyniku, bez raportu.
Import `isAuthApiError` z `@supabase/supabase-js` (potwierdzić eksport w root; auth-js go eksportuje). Import `./report-error` względny, nie `@/`.

### Success Criteria:

#### Automated Verification:

- `npm test` — wszystkie cztery przypadki z `session-bootstrap.test.ts` są zielone.
- Typecheck passes: `npx tsc --noEmit`
- Linting passes: `npx expo lint`

## Phase 3: Session state wiring and retryable error screen

### Overview

Podłączyć wynik bootstrapu do `SessionProvider`, dodać stan błędu i ponowienie, a w `RootNavigator` wyrenderować ekran błędu zamiast `null`.

### Changes Required:

#### 1. Session provider state

**File**: `src/lib/session.tsx`

**Intent**: Usunąć odrzucalne `.then` i zawsze zdjąć `loading`; zachować `onAuthStateChange`.

**Contract**: `SessionContextValue` dostaje `bootstrapError: unknown` i `retryBootstrap: () => void`. Efekt bootstrapu zależy od licznika `attempt` (stan) i wywołuje `runSessionBootstrap(() => supabase.auth.getSession())`; wynik z `error` ustawia `bootstrapError`, bez `error` ustawia `session` i czyści `bootstrapError`; `setLoading(false)` w obu gałęziach, z guardem `active`. `retryBootstrap` ustawia `loading` na `true`, czyści `bootstrapError` i inkrementuje `attempt`. Subskrypcja `onAuthStateChange` zostaje w osobnym efekcie z `[]`, bez zmian poza tym, że nie jest powiązana z `attempt`.

#### 2. Retry error view

**File**: `src/components/session-error-view.tsx` (nowy)

**Intent**: Pokazać, że start się nie udał, i dać jedną akcję — ponowić; bez kolorów literalnych.

**Contract**: `SessionErrorView({ onRetry }: { onRetry: () => void })`. Tekst (PL): tytuł „Nie udało się połączyć z kontem.”, podpis „Sprawdź połączenie z internetem i spróbuj ponownie.”, przycisk `Button` z etykietą „Spróbuj ponownie”. Układ wyśrodkowany, odstępy z `Spacing`, kolor drugorzędnego tekstu `themeColor="textSecondary"`.

#### 3. Root navigator branch

**File**: `src/app/_layout.tsx`

**Intent**: Dodać trzeci stan do `RootNavigator`: błąd bez sesji pokazuje ekran błędu, a nie `Stack` z loginem.

**Contract**: Po `if (loading) return null;` dodać `if (!session && bootstrapError) return <SessionErrorView onRetry={retryBootstrap} />;`. Warunek `!session` zapewnia, że sesja z `onAuthStateChange` wygrywa nad starym błędem.

### Success Criteria:

#### Automated Verification:

- Typecheck passes: `npx tsc --noEmit`
- Linting passes: `npx expo lint`
- Tests pass (regresja Fazy 2): `npm test`

#### Manual Verification:

- Normalny start zalogowanego użytkownika i niezalogowanego: bez zmian w zachowaniu (`(app)` / `(auth)`), brak wpisów `reportError`.
- Tryb samolotowy przy wygasłym access tokenie w storage: pojawia się ekran błędu z „Spróbuj ponownie”; po przywróceniu sieci przycisk ładuje sesję i przechodzi do `(app)` lub `(auth)`.
- Unieważniony refresh token w AsyncStorage: przechodzi na login i w konsoli jest wpis `reportError` z `reason: 'auth-cleared'` i pełnym obiektem błędu.

**Implementation Note**: Po zakończeniu fazy i zielonych kontrolach automatycznych poczekać na ręczne potwierdzenie scenariuszy powyżej przed zamknięciem zmiany.

## Testing Strategy

### Unit Tests:

- Cztery przypadki `runSessionBootstrap` z Fazy 1 (odrzucenie, `auth-cleared`, `error-result`, sukces).
- Kluczowy przypadek brzegowy: `error` z `AuthRetryableFetchError` nie może trafić do ścieżki wylogowania.

### Integration Tests:

- Brak w tej zmianie. Warstwa `SessionProvider` nie ma harnessu renderującego (brak bibliotek React test renderer); pokrycie UI idzie przez scenariusze ręczne.

### Manual Testing Steps:

1. Uruchomić `npx expo start`, zalogować się, zrestartować aplikację — brak ekranu błędu, brak wpisów w konsoli.
2. Włączyć tryb samolotowy i wymusić wygasły access token (ustawić `expires_at` w przeszłość w AsyncStorage) — zobaczyć ekran błędu.
3. Wyłączyć tryb samolotowy, nacisnąć „Spróbuj ponownie” — sesja odnowiona, przejście do `(app)`.
4. Ustawić nieprawidłowy `refresh_token` w AsyncStorage przy wygasłym access tokenie — login i wpis `auth-cleared` w konsoli.

## Performance Considerations

Bez zmian; jeden dodatkowy stan React i jeden komponent renderowany wyłącznie przy błędzie.

## Migration Notes

Brak migracji danych. Zmiana tylko w kodzie klienta; nie wymaga dev build (AsyncStorage i auth-js już są w użyciu w Expo Go).

## References

- Brief ramowy: `context/changes/fix-session-swallowed-error/frame.md`
- Change: `context/changes/fix-session-swallowed-error/change.md`
- Audit: `context/audits/observability/2026-10-30_reservations-gifts.md` (P-02, P-03, P-04, P-05, P-07, §6 pkt 1)
- SDK: `node_modules/@supabase/auth-js/dist/module/GoTrueClient.js:2491-2577`, `lib/fetch.js`, `lib/errors.js`
- Similar UI pattern: `src/components/list-empty-state.tsx`, `src/components/ui/form-error.tsx`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Failing tests for bootstrap outcomes

#### Automated

- [ ] 1.1 Nowy plik testowy istnieje i zawiera cztery przypadki: `npm test -- session-bootstrap` kończy się błędem z powodu brakującego modułu `./session-bootstrap` (czerwony przed Fazą 2).
- [ ] 1.2 Pozostałe testy w repozytorium nie zmieniają wyniku (brak innych testów w `src/`).

### Phase 2: Reporting seam and bootstrap classification

#### Automated

- [ ] 2.1 `npm test` — wszystkie cztery przypadki z `session-bootstrap.test.ts` są zielone.
- [ ] 2.2 Typecheck passes: `npx tsc --noEmit`
- [ ] 2.3 Linting passes: `npx expo lint`

### Phase 3: Session state wiring and retryable error screen

#### Automated

- [ ] 3.1 Typecheck passes: `npx tsc --noEmit`
- [ ] 3.2 Linting passes: `npx expo lint`
- [ ] 3.3 Tests pass (regresja Fazy 2): `npm test`

#### Manual

- [ ] 3.4 Normalny start zalogowanego użytkownika i niezalogowanego: bez zmian w zachowaniu (`(app)` / `(auth)`), brak wpisów `reportError`.
- [ ] 3.5 Tryb samolotowy przy wygasłym access tokenie w storage: pojawia się ekran błędu z „Spróbuj ponownie”; po przywróceniu sieci przycisk ładuje sesję i przechodzi do `(app)` lub `(auth)`.
- [ ] 3.6 Unieważniony refresh token w AsyncStorage: przechodzi na login i w konsoli jest wpis `reportError` z `reason: 'auth-cleared'` i pełnym obiektem błędu.
