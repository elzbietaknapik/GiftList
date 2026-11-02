# Fix Swallowed Session Bootstrap Error (P-03) — Plan Brief

> Full plan: `context/changes/fix-session-swallowed-error/plan.md`
> Frame brief: `context/changes/fix-session-swallowed-error/frame.md`

## What & Why

Start aplikacji potrafi zawiesić się na pustym ekranie albo cicho wylogować użytkownika, a w logach nie zostaje żaden ślad. Celem jest, aby każdy błąd bootstrapu sesji był zgłoszony i widoczny jako błąd, a nie jako pusty ekran lub zwykły login. Wg briefu ramowego: *a failed session bootstrap is invisible in both of its forms — it either never completes, or completes as "no session" — and in neither case does the code record the error or tell the user it was a failure.*

## Starting Point

`SessionProvider` (`src/lib/session.tsx:21-25`) wywołuje `getSession()` bez `.catch` i ignoruje pole `error`. Przy odrzuceniu `loading` zostaje `true`, a `RootNavigator` zwraca `null`. Przy wyniku `{ session: null, error }` (auth-js 2.117.2, `GoTrueClient.js:2570`) aplikacja cicho przechodzi na login, także przy błędzie sieci.

## Desired End State

Bootstrap kończy się w jednym z trzech stanów: zalogowany lub niezalogowany bez błędu (bez zmian), wylogowanie po unieważnionym tokenie z wpisem w logach, albo ekran „Nie udało się połączyć z kontem” z przyciskiem „Spróbuj ponownie”, który ponawia `getSession()`. Każdy błąd przechodzi przez jeden punkt `reportError`.

## Key Decisions Made

| Decision                        | Choice                                                          | Why (1 sentence)                                                                                   | Source  |
| ------------------------------- | --------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | ------- |
| Obsługa `{ session: null, error }` | Błąd auth (`isAuthApiError`) → login z logiem; inny błąd → ekran błędu z Retry | Unieważniony token to legalne wylogowanie, a awaria sieci nie może wyglądać jak wylogowanie         | Plan (pytanie) |
| Miejsce logowania błędu         | Szew `reportError` w `src/lib/report-error.ts` (opakowuje `console.error`) | Audyt (§6 pkt 1) łączy P-02 i P-03; P-02 podepnie tracker bez zmiany wywołań                       | Plan (pytanie) |
| Odrzucenie `getSession()`       | Traktowane jak błąd nie-auth → ekran błędu z Retry             | Nieznany wyjątek nie daje podstaw do wylogowania; ponowienie jest bezpieczne                       | Frame   |
| Zakres ręcznej obsługi          | Tylko bootstrap sesji; P-04, P-05 i P-02 poza zakresem          | Ramy wskazały P-03 jako osobną zmianę; reszta ma własne ryzyka                                    | Frame   |
| Harness testowy                 | vitest (istniejący `vitest.config.mts`), test czystej funkcji bez nowych zależności | Runner już jest w `package.json`; brak bibliotek React test renderer                       | Plan    |

## Scope

**In scope:**
- Nowe moduły `report-error.ts`, `session-bootstrap.ts` i komponent `session-error-view.tsx`
- Zmiana `session.tsx` (stan `bootstrapError`, `retryBootstrap`) i `_layout.tsx` (gałąź błędu)
- Cztery testy jednostkowe `session-bootstrap.test.ts`

**Out of scope:**
- Pełny P-02 (ErrorBoundary, globalne handlery, tracker)
- `signOut` i `startAutoRefresh` z ignorowanymi promise (P-04), `SplashScreen.hideAsync` (P-05)
- Błędy danych po zalogowaniu (G-01, G-02, P-01)
- Aktualizacja `AGENTS.md` i `test-plan.md §4` (dokumentacja nieaktualna)

## Architecture / Approach

Logika decyzji żyje w `session-bootstrap.ts` i przyjmuje `getSession` oraz `report` jako parametry, więc jest testowana bez Reacta i klienta Supabase. `session.tsx` trzyma stan (`bootstrapError`, licznik `attempt` do retry), a `_layout.tsx` renderuje ekran błędu tylko gdy `!session && bootstrapError`. Subskrypcja `onAuthStateChange` pozostaje osobnym efektem.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Failing tests | Cztery czerwone testy wyników bootstrapu | Brak — tylko testy |
| 2. Reporting seam and classification | `reportError` i `runSessionBootstrap`, testy zielone | Klasyfikacja `isAuthApiError` musi odpowiadać realnym błędom SDK |
| 3. Session wiring and error screen | Stan w providerze, ekran błędu z Retry, scenariusze ręczne | Wyścig z `onAuthStateChange` i stale `bootstrapError` (rozwiązany warunkiem `!session`) |

**Prerequisites:** Działające `.env.local` z `EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_ANON_KEY` do scenariuszy ręcznych; brak zmian w natywnych modułach.
**Estimated effort:** ~1 sesja, 3 fazy (2 nowe moduły, 2 zmienione pliki, 1 komponent).

## Open Risks & Assumptions

- Confidence zmiany to MEDIUM z briefu ramowego: mechanizm potwierdzony w kodzie SDK, ale nie odtworzony w runtime (`runtime_proof: not-run`). Częstotliwość w realnym użyciu nieznana.
- Klasyfikacja zakłada, że SDK mapuje błędy sieci i 5xx na `AuthRetryableFetchError`, a odpowiedzi auth na `AuthApiError`. Do potwierdzenia w `fetch.js` w Fazie 2; jeśli 5xx trafi do `AuthApiError`, wylogowanie przy awarii serwera stanie się możliwe — wtedy trzeba zawęzić warunek.
- Potwierdzić, że `isAuthApiError` jest eksportowany z `@supabase/supabase-js` (root); jeśli nie, import z `@supabase/auth-js` wymaga dodania zależności tranzytywnej, więc trzeba to zweryfikować przed Fazą 2.
- Dokumentacja drift: `AGENTS.md` mówi „No test runner is configured”, a `context/foundation/test-plan.md §4` zakłada Jest/jest-expo. Realny stan to vitest (`package.json`). Poza zakresem, do osobnej aktualizacji.

## Success Criteria (Summary)

- Każdy błąd bootstrapu sesji jest zalogowany przez `reportError` z pełnym obiektem błędu i kontekstem bez danych użytkownika.
- Start nigdy nie kończy się pustym ekranem; błąd sieci daje ekran z „Spróbuj ponownie”, a unieważniony token daje login z logiem.
- `npm test`, `npx tsc --noEmit` i `npx expo lint` przechodzą.
