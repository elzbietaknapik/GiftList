# Rejestracja/logowanie + pierwsza lista — Plan Brief

> Full plan: `context/changes/auth-and-first-list/plan.md`
> Roadmap: `context/foundation/roadmap.md` (S-01)

## What & Why

S-01 domyka pierwszy pion MVP: Życzący zakłada konto (e-mail + hasło), loguje się i trafia na własną listę prezentową. Bez tego nie istnieje żadna ścieżka właściciela — kolejne slice (dodawanie prezentów, udostępnianie, rezerwacja) są na tym zbudowane (PRD FR-001/FR-002/FR-003).

## Starting Point

Klient Supabase jest gotowy (PKCE, `detectSessionInUrl: false`, `AppState` refresh — `src/lib/supabase.ts:17`), a schema i RLS dla list już istnieją (`gifts_lists`, `insert_lists`, `select_lists`, unikalny indeks „jedna lista na właściciela"). Brakuje jednak jakiegokolwiek stanu sesji i ekranów: root layout renderuje starterowe taby (Home/Explore) bez bramki.

## Desired End State

Niezalogowany widzi logowanie z przełącznikiem do rejestracji. Rejestracja lub logowanie natychmiast przenosi do obszaru aplikacji: brak listy → formularz „utwórz pierwszą listę"; jest lista → jej nazwa i pusty stan. Lista jest trwała, wylogowanie wraca do auth. `npx tsc --noEmit` i `npx expo lint` bez błędów.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| -------- | ------ | ---------------- | ------ |
| Bramkowanie tras | `Stack.Protected` + `SessionProvider`/`useSession` | Natywne API expo-router 57 usuwa potrzebę własnego hooka przekierowań | Plan |
| E-mail confirmation | Wyłączone (dev) — natychmiastowe zalogowanie | Brak potwierdzania linkiem upraszcza przepływ MVP | Plan |
| Zestaw ekranów | Logowanie + rejestracja (przełącznik) + formularz pierwszej listy | Minimalny zestaw realizujący S-01 | Plan |
| UX pierwszej listy | Brak listy → bezpośrednio formularz tworzenia | Krótka ścieżka do pierwszego widocznego rezultatu | Plan |
| Zmiany w bazie | Żadne | Schema i RLS list są już zastosowane | Plan |
| Weryfikacja | `tsc` + `lint` + manualny smoke test | Repo nie ma runnera testów ani CI | Plan |

## Scope

**In scope:**
- `SessionProvider`/`useSession` (`src/lib/session.tsx`) z `getSession()` + `onAuthStateChange`.
- Root layout na `<Stack>` z `Stack.Protected` i grupami `(auth)`/`(app)`.
- Ekrany logowania i rejestracji (e-mail + hasło) z walidacją i obsługą błędów.
- Warstwa danych `src/lib/lists.ts` i ekran `(app)/index.tsx` (tworzenie/podgląd listy + wylogowanie).
- Usunięcie starterowych ekranów i komponentów tabów.

**Out of scope:**
- OAuth/magic link/passwordless, reset hasła, pełne potwierdzanie e-maila.
- Migracje bazy, link udostępniania, prezenty, rezerwacje (S-02…S-06).
- Edycja/usuwanie listy, wiele list, zmiany `app.json`, CI, runner testów, `service_role`.

## Architecture / Approach

Root layout: `ThemeProvider` → `SessionProvider` → `AnimatedSplashOverlay` → `<Stack>` czekający na rozwiązanie sesji, z bramkami `guard={!session}` → `(auth)` i `guard={!!session}` → `(app)`. Stan sesji pochodzi z jednego źródła (provider nasłuchujący `onAuthStateChange`); po auth/registracji bramka sama przełącza obszar. `(app)/index.tsx` pobiera listę przez RLS-owe `select` na `gifts_lists`; brak listy renderuje formularz tworzenia (insert), obecność — widok z nazwą i pustym stanem.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| ----- | ---------------- | -------- |
| 1. Sesja i bramkowanie tras | `SessionProvider`, root `<Stack>`, grupy `(auth)`/`(app)`, usunięcie startera | Migotanie złej trasy, jeśli bramka oceni się przed rozwiązaniem sesji |
| 2. Ekrany rejestracji i logowania | Działający formularz auth z przełącznikiem i obsługą błędów | Rejestracja bez sesji, gdy confirmation jest włączone na hosted |
| 3. Pierwsza lista | `lists.ts` + ekran tworzenia/podglądu + wylogowanie | Duplikat listy / wyścig z unikalnym indeksem |

**Prerequisites:** Działający lokalny backend (`supabase start`) lub hosted `bdbgjyzypmrkvbhfilqj`; dla E2E na hosted — provider Email włączony (roadmap Open Question #1). Zależności są już zainstalowane.
**Estimated effort:** ~1 sesja implementacyjna w 3 fazach.

## Open Risks & Assumptions

- Hosted Supabase musi mieć włączony provider Email i wyłączone potwierdzenia, inaczej E2E na hosted jest zablokowane (lokalnie `enable_confirmations = false`).
- Typy tras (`typedRoutes`) wymagają regeneracji po dodaniu nowych plików tras, zanim `tsc` będzie zielony.
- „Minimalny zestaw ekranów" oznacza usunięcie starterowego UI — potwierdzić, że nic innego go nie importuje.

## Success Criteria (Summary)

- Użytkownik może się zarejestrować i zalogować (e-mail + hasło) i od razu znaleźć się w obszarze aplikacji.
- Użytkownik bez listy tworzy pierwszą listę (nazwa) i widzi ją trwale między uruchomieniami; wylogowanie wraca do auth.
- `npx tsc --noEmit` i `npx expo lint` przechodzą; manualny flow potwierdzony dla obu ról (rejestracja i logowanie).
