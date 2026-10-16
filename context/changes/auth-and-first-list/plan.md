# Rejestracja/logowanie + pierwsza lista — Plan implementacji

## Overview

Dostarczyć S-01: użytkownik (Życzący) może zarejestrować się lub zalogować e-mailem i hasłem, a następnie trafić na swoją listę prezentową — utworzyć ją (nazwa) albo zobaczyć istniejącą. Bramka sesji chroni trasę aplikacji; brak sesji prowadzi do ekranów auth. Wszystko na istniejącym kliencie Supabase i istniejącym schemacie (bez zmian w bazie).

## Current State Analysis

- Klient Supabase jest w pełni okablowany: PKCE, `detectSessionInUrl: false`, `AppState` auto-refresh (`src/lib/supabase.ts:17`). Risk #5/#11 z `infrastructure.md` są zamknięte.
- Schema i RLS obsługują listy bez zmian: tabela `gifts_lists` z unikalnym indeksem `gifts_lists_one_per_owner` (`supabase/migrations/20261005113900_initial_schema.sql:11`) oraz polityki `insert_lists` (`owner_id = auth.uid()`), `select_lists` (`:49`–`:52`). Tworzenie listy przez zalogowanego właściciela działa end-to-end na istniejącej migracji.
- Brak stanu sesji: nie ma `SessionProvider` ani nasłuchu `onAuthStateChange`. `src/app/_layout.tsx:10` renderuje od razu `AppTabs` (starterowe Home/Explore) bez żadnej bramki.
- Routing jest płaski: `src/app/index.tsx`, `src/app/explore.tsx`, `_layout.tsx`. Starterowy UI (`index.tsx`, `explore.tsx`, komponenty `app-tabs*`) to placeholder bootstrapera.
- `expo-router` 57.0.23 eksportuje `Stack.Protected` (`guard: boolean`) — pozwala deklaratywnie bramkować grupy tras bez własnego hooka przekierowań.
- Brak test runnera i brak CI (roadmap: Parked). `.env.local` (gitignored) ma publiczne `EXPO_PUBLIC_*`. Bramka hosted (provider Email) to `Open Roadmap Questions #1` — dotyczy wyłącznie E2E na hosted; `supabase start` lokalnie nie jest zablokowany.

## Desired End State

Po uruchomieniu aplikacji sesja jest rozwiązywana przed renderem tras. Niezalogowany użytkownik widzi ekran logowania z przełącznikiem do rejestracji; poprawna rejestracja (z potwierdzeniami wyłączonymi) lub logowanie natychmiast przenosi go do obszaru aplikacji. W obszarze aplikacji: jeśli użytkownik nie ma listy, widzi formularz „utwórz pierwszą listę" (pole nazwy + zapis); jeśli listę ma, widzi jej nazwę i pusty stan. Lista jest trwała między uruchomieniami, egzekwowana przez unikalny indeks „jedna lista na właściciela". Wylogowanie wraca do ekranów auth. `npx tsc --noEmit` i `npx expo lint` przechodzą.

### Key Discoveries:

- `Stack.Protected` jest dostępny w zainstalowanej wersji (`node_modules/expo-router/build/views/Protected.d.ts`, `guard: boolean`) — nie trzeba własnego `useProtectedRoute`.
- Tworzenie listy nie wymaga migracji: `insert_lists` + `select_lists` już istnieją (`supabase/migrations/20261005113900_initial_schema.sql:49`–`:56`).
- `expo-router` z `typedRoutes: true` (`app.json:39`) — po dodaniu nowych tras trzeba zregenerować typy (`.expo/types/`), inaczej `tsc` może zgłosić błąd na typowanych `href`.
- `config.toml:227` ustawia `[auth.email] enable_confirmations = false` lokalnie; hosted musi być spójne, inaczej `signUp` zwraca użytkownika bez sesji (roadmap Open Question #1).
- Konwencja projektu: komponenty w `src/components/`, kod nie-trasowy poza `src/app/` (`AGENTS.md`), aliasy `@/*` → `src/*`.

## What We're NOT Doing

- Bez OAuth, magic link, passwordless, logowania społecznościowego (deploy-plan: tylko e-mail + hasło dla MVP).
- Bez resetu hasła i bez pełnego flow potwierdzania e-maila (dev: confirmation off).
- Bez migracji bazy — schemat i RLS są gotowe (żadnych zmian w `supabase/`).
- Bez linku udostępniania, widoku gościa, prezentów i rezerwacji (to S-02…S-06).
- Bez edycji/zmiany nazwy/usuwania listy (FR-004/FR-006 → S-06).
- Bez wielu list na użytkownika (FR-003: dokładnie jedna; unikalny indeks).
- Bez dodawania runnera testów ani CI (Parked).
- Bez zmian w `app.json` (scheme `bootstrapscaffold` zostaje — zmiana w S-03).
- Bez `service_role` ani kodu serwerowego; tylko publiczne `EXPO_PUBLIC_*`.

## Implementation Approach

Rozbić trasę na dwie grupy: `(auth)` (logowanie/rejestracja) i `(app)` (obszar zalogowany). Root `_layout.tsx` trzyma `ThemeProvider` i `AnimatedSplashOverlay` jak dziś, dokłada `SessionProvider`, a następnie renderuje `<Stack>` z dwiema `Stack.Protected` — bramka to obecność `session`. Dopóki sesja się ładuje, layout zwraca `null`, więc bramka nie mignie w złą stronę. Stan sesji pochodzi z jednego miejsca (`SessionProvider`: `getSession()` na starcie + subskrypcja `onAuthStateChange`). Warstwa danych (`src/lib/lists.ts`) opakowuje RLS-owe zapytania `gifts_lists` — jedna lista na właściciela. Ekran `(app)/index.tsx` po wejściu pobiera listę i renderuje formularz tworzenia (jeśli brak) albo widok listy (jeśli jest). Starterowe ekrany i komponenty tabów są usuwane, bo zastępuje je obszar aplikacji.

## Critical Implementation Details

- **Kolejność sesji:** `Stack.Protected` ocenia `guard` synchronicznie, a `getSession()` jest asynchroniczne. Renderować `<Stack>` dopiero po rozwiązaniu sesji (`loading === false`), inaczej pierwszą klatką będzie ekran auth dla zalogowanego użytkownika.
- **Regeneracja typów tras:** po utworzeniu plików w `(auth)`/`(app)` uruchomić krótko `npx expo start` (generuje `.expo/types/`), zanim uruchomi się `tsc` — w przeciwnym razie typowane `href`/`Href` mogą nie znać nowych tras.
- **Tryb confirmacji:** bramka E2E na hosted (Email provider + confirmation off). Lokalnie `enable_confirmations = false`. Na wypadek włączonych potwierdzeń `signUp` bez sesji musi pokazać komunikat zamiast „udawać" zalogowanie.

## Phase 1: Sesja użytkownika i bramkowanie tras

### Overview

Wprowadzić `SessionProvider`/`useSession`, przebudować root layout na `<Stack>` z `Stack.Protected` i założyć grupy `(auth)`/`(app)` z minimalnymi placeholderami, tak aby aplikacja uruchamiała się i przełączała obszary na podstawie sesji. Usunąć starterowe ekrany i komponenty tabów.

### Changes Required:

#### 1. Kontekst sesji

**File**: `src/lib/session.tsx`

**Intent**: Jedno źródło prawdy o sesji: wczytanie bieżącej sesji na starcie i reagowanie na zmiany auth, aby bramka tras zawsze odzwierciedlała stan.

**Contract**: `SessionProvider({ children })` utrzymuje `session: Session | null` i `loading: boolean`; na montażu woła `supabase.auth.getSession()`, subskrybuje `supabase.auth.onAuthStateChange` i odsubskrybowuje w cleanupie. Eksportuje `useSession()` zwracający `{ session, user, loading }` (rzuca, gdy użyty poza providerem). Typy `Session`/`User` z `@supabase/supabase-js`.

#### 2. Root layout z bramką

**File**: `src/app/_layout.tsx`

**Intent**: Owinąć drzewo w `SessionProvider` i zastąpić bezpośredni render `AppTabs` przez `<Stack>` z dwiema bramkami: brak sesji → `(auth)`, sesja → `(app)`.

**Contract**: Root renderuje `ThemeProvider` + `SessionProvider` + `AnimatedSplashOverlay`; wewnątrz komponent korzystający z `useSession()` czeka na `!loading`, potem zwraca `<Stack screenOptions={{ headerShown: false }}>` z `Stack.Protected guard={!session}` → `(auth)` i `Stack.Protected guard={!!session}` → `(app)`. Guardów jest tyle, ile grup tras; razem pokrywają wszystkie przypadki. Wzorzec (nowe API, warto zachować kształt):

```tsx
const { session, loading } = useSession();
if (loading) return null;
return (
  <Stack screenOptions={{ headerShown: false }}>
    <Stack.Protected guard={!session}>
      <Stack.Screen name="(auth)" />
    </Stack.Protected>
    <Stack.Protected guard={!!session}>
      <Stack.Screen name="(app)" />
    </Stack.Protected>
  </Stack>
);
```

#### 3. Grupy tras (placeholdery)

**File**: `src/app/(auth)/_layout.tsx`, `src/app/(app)/_layout.tsx`

**Intent**: Zdefiniować dwa obszary routingu; grupa auth to prosty `<Slot/>`, grupa aplikacji to `<Stack/>` z ekranem `index`.

**Contract**: `(auth)/_layout.tsx` zwraca `<Slot/>`. `(app)/_layout.tsx` zwraca `<Stack screenOptions={{ headerShown: false }} />`. Pliki tras `(auth)/login.tsx` i `(app)/index.tsx` tworzone w Phase 2/3; na potrzeby Phase 1 mogą zawierać minimalne placeholdery (po jednym `ThemedView` + `ThemedText`), które Phase 2/3 zastąpią.

#### 4. Usunięcie startera

**File**: `src/app/index.tsx`, `src/app/explore.tsx`, `src/components/app-tabs.tsx`, `src/components/app-tabs.web.tsx`

**Intent**: Starterowe ekrany i taby bootstrapera są zastąpione przez obszar aplikacji; usunąć je, aby nie zostawały martwe trasy ani nieużywane importy.

**Contract**: Usunąć wymienione pliki tras i komponenty tabów (nie są już importowane po zmianie root layoutu). Zachować komponenty współdzielone używane dalej (`themed-text`, `themed-view`, `animated-icon`, `external-link`, `constants/theme`).

### Success Criteria:

#### Automated Verification:

- Type checking passes: `npx tsc --noEmit`
- Linting passes: `npx expo lint`
- Pliki istnieją: `src/lib/session.tsx`, `src/app/(auth)/_layout.tsx`, `src/app/(app)/_layout.tsx` (po regeneracji typów: `npx expo start` krótko)

#### Manual Verification:

- Aplikacja startuje bez błędu; splash znika; brak sesji pokazuje trasę auth.
- Po ustawieniu sesji (logowanie w Phase 2) obszar przełącza się na `(app)` bez ręcznego przeładowania.
- Brak martwych tras: wejście na `/` nie renderuje już starterowego „Welcome to Expo".

**Implementation Note**: Po przejściu weryfikacji automatycznej zatrzymać się po potwierdzenie manualne przed Phase 2.

---

## Phase 2: Ekrany rejestracji i logowania

### Overview

Dostarczyć działający przepływ auth: formularz z polem e-mail i hasła, tryb logowania i rejestracji z przełącznikiem, obsługa błędów i stanu ładowania, natychmiastowe zalogowanie po rejestracji (confirmation off).

### Changes Required:

#### 1. Współdzielony formularz auth

**File**: `src/components/auth-form.tsx`

**Intent**: Jeden formularz obsługujący oba tryby, aby uniknąć duplikacji walidacji, stanu i obsługi błędów.

**Contract**: Komponent przyjmuje `mode: 'login' | 'register'`; zawiera kontrolowane pola e-mail/hasło, przycisk submit (disabled + spinner w trakcie), komunikat błędu i link-przełącznik do drugiego trybu (przez `Link`/`router`). Walidacja minimalna po stronie klienta: niepuste e-mail/hasło, hasło ≥ 6 znaków (zgodnie z `config.toml:183`). Styl przez `ThemedText`/`ThemedView`/`Spacing`.

#### 2. Ekran logowania

**File**: `src/app/(auth)/login.tsx`

**Intent**: Umożliwić logowanie istniejącemu użytkownikowi.

**Contract**: Renderuje `AuthForm mode="login"`; submit woła `supabase.auth.signInWithPassword({ email, password })`. Sukces → brak ręcznej nawigacji (provider zauważy sesję i bramka przełączy na `(app)`). Błąd → czytelny komunikat inline.

#### 3. Ekran rejestracji

**File**: `src/app/(auth)/register.tsx`

**Intent**: Umożliwić utworzenie konta i natychmiastowe zalogowanie.

**Contract**: Renderuje `AuthForm mode="register"`; submit woła `supabase.auth.signUp({ email, password })`. Przy wyłączonych potwierdzeniach zwrócona sesja przełącza bramkę na `(app)`. Jeśli sesji brak (potwierdzenia włączone), pokazać komunikat o potwierdzeniu e-maila zamiast fałszywego zalogowania.

### Success Criteria:

#### Automated Verification:

- Type checking passes: `npx tsc --noEmit`
- Linting passes: `npx expo lint`
- Pliki istnieją: `src/components/auth-form.tsx`, `src/app/(auth)/login.tsx`, `src/app/(auth)/register.tsx`

#### Manual Verification:

- Rejestracja nowym e-mailem + hasłem → użytkownik od razu zalogowany i przeniesiony do `(app)`.
- Logowanie istniejącymi danymi → przeniesienie do `(app)`.
- Błędne hasło / nieistniejący e-mail → komunikat inline, brak crasha.
- Puste pola lub hasło < 6 znaków → zablokowane z komunikatem.
- Przełącznik między logowaniem a rejestracją działa.

**Implementation Note**: Zatrzymać się po weryfikacji manualnej przed Phase 3.

---

## Phase 3: Pierwsza lista prezentowa

### Overview

Dostarczyć ekran obszaru aplikacji: pobranie listy właściciela, formularz utworzenia pierwszej listy gdy brak, widok istniejącej listy (nazwa + pusty stan) oraz wylogowanie.

### Changes Required:

#### 1. Warstwa danych listy

**File**: `src/lib/lists.ts`

**Intent**: Odizolować dostęp do `gifts_lists` i zwracać typowane dane; RLS egzekwuje własność.

**Contract**: Typ `GiftList = { id: string; name: string; share_token: string; created_at: string }`. `getMyList(userId: string): Promise<GiftList | null>` — `select('id,name,share_token,created_at').eq('owner_id', userId).maybeSingle()`. `createList(userId: string, name: string): Promise<GiftList>` — insert `{ name, owner_id: userId }`, `.select().single()`; nazwa trymowana, niepusta. Błąd unikalnego indeksu (`23505`) traktowany jako „lista już istnieje" (wywołujący odświeża przez `getMyList`).

#### 2. Ekran listy / tworzenia

**File**: `src/app/(app)/index.tsx`

**Intent**: Po wejściu pokazać listę użytkownika; jeśli jej nie ma, pokazać formularz utworzenia pierwszej listy, a po zapisie widok listy — zgodnie z ustalonym UX.

**Contract**: Używa `useSession()` do `user.id`. Stan: `loading`, `list: GiftList | null`, `error`, pole `name` formularza. Na montażu: `getMyList(user.id)`. Brak listy → formularz (pole nazwy + „Zapisz"), submit → `createList`, sukces ustawia `list`. Lista istnieje → nagłówek z nazwą + pusty stan („Twoja lista jest jeszcze pusta — dodawanie prezentów w kolejnym kroku"). Przycisk „Wyloguj" → `supabase.auth.signOut()` (bramka wraca do `(auth)`). Błędy zapisu pokazywane inline.

### Success Criteria:

#### Automated Verification:

- Type checking passes: `npx tsc --noEmit`
- Linting passes: `npx expo lint`
- Pliki istnieją: `src/lib/lists.ts`, `src/app/(app)/index.tsx`

#### Manual Verification:

- Nowy użytkownik bez listy → widzi formularz tworzenia; zapis tworzy listę i pokazuje widok z nazwą + pustym stanem.
- Ponowne uruchomienie aplikacji → sesja utrzymana, lista nadal widoczna.
- Próba utworzenia drugiej listy nie tworzy duplikatu (unikalny indeks; UI odświeża istniejącą).
- Wylogowanie → powrót do ekranów auth; ponowne logowanie → ta sama lista.
- Pusta nazwa nie zapisuje się (walidacja).

**Implementation Note**: Po tej fazie uruchomić pełny manualny smoke test end-to-end w Expo Go (lub web) i potwierdzić kryteria PRD S-01.

---

## Testing Strategy

### Unit Tests:

- Brak runnera testów w repo (`AGENTS.md`) — nie dodajemy frameworka w tym zakresie.

### Integration Tests:

- Brak zmian bazy; istniejące pgTAP (F-01) nie dotyczą tego przepływu. Ewentualne rozszerzenia RLS-list są poza zakresem.

### Manual Testing Steps:

1. Uruchomić `npx expo start` i otworzyć aplikację; potwierdzić, że niezalogowany widzi ekran logowania.
2. Zarejestrować nowe konto → potwierdzić natychmiastowe przejście do obszaru aplikacji i formularz pierwszej listy.
3. Zapisać listę o nazwie → potwierdzić widok listy z nazwą i pustym stanem.
4. Przeładować aplikację → potwierdzić utrzymanie sesji i listy.
5. Wylogować się → potwierdzić powrót do auth; zalogować ponownie → ta sama lista.
6. Sprawdzić błąd: logowanie złym hasłem; rejestracja istniejącym e-mailem.

## Performance Considerations

Brak istotnych wymagań wydajnościowych w S-01 (jeden odczyt + jeden insert na sesję). RLS na `gifts_lists` jest ograniczony unikalnym indeksem właściciela, więc odczyt jest punktowy.

## Migration Notes

Brak migracji — schema i RLS (`gifts_lists`, `insert_lists`, `select_lists`, `gifts_lists_one_per_owner`) są już zastosowane. Nie zmieniamy plików w `supabase/`.

## References

- Roadmap: `context/foundation/roadmap.md` (S-01 `auth-and-first-list`)
- PRD: `context/foundation/prd.md` (FR-001, FR-002, FR-003)
- Deploy plan: `context/deployment/deploy-plan.md` (§5 klient, §7 bramki)
- Infra ryzyka: `context/foundation/infrastructure.md` (Risk #5, #11)
- Klient: `src/lib/supabase.ts:17`
- Schema/RLS list: `supabase/migrations/20261005113900_initial_schema.sql:11`, `:49`
- Konfiguracja auth: `supabase/config.toml:227` (`enable_confirmations = false`)

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Sesja użytkownika i bramkowanie tras

#### Automated

- [x] 1.1 Type checking passes: `npx tsc --noEmit`
- [x] 1.2 Linting passes: `npx expo lint`
- [x] 1.3 Pliki tras i kontekstu istnieją: `src/lib/session.tsx`, `src/app/(auth)/_layout.tsx`, `src/app/(app)/_layout.tsx`

#### Manual

- [ ] 1.4 Aplikacja startuje bez błędu; splash znika; brak sesji pokazuje trasę auth
- [ ] 1.5 Po ustawieniu sesji obszar przełącza się na `(app)` bez ręcznego przeładowania
- [ ] 1.6 Brak martwych tras startera (wejście na `/` nie renderuje „Welcome to Expo")

### Phase 2: Ekrany rejestracji i logowania

#### Automated

- [ ] 2.1 Type checking passes: `npx tsc --noEmit`
- [ ] 2.2 Linting passes: `npx expo lint`
- [ ] 2.3 Pliki auth istnieją: `src/components/auth-form.tsx`, `src/app/(auth)/login.tsx`, `src/app/(auth)/register.tsx`

#### Manual

- [ ] 2.4 Rejestracja nowym e-mailem + hasłem → natychmiastowe zalogowanie i przejście do `(app)`
- [ ] 2.5 Logowanie istniejącymi danymi → przejście do `(app)`
- [ ] 2.6 Błędne hasło / nieistniejący e-mail → komunikat inline, brak crasha
- [ ] 2.7 Puste pola lub hasło < 6 znaków → zablokowane z komunikatem
- [ ] 2.8 Przełącznik logowanie ↔ rejestracja działa

### Phase 3: Pierwsza lista prezentowa

#### Automated

- [ ] 3.1 Type checking passes: `npx tsc --noEmit`
- [ ] 3.2 Linting passes: `npx expo lint`
- [ ] 3.3 Pliki listy istnieją: `src/lib/lists.ts`, `src/app/(app)/index.tsx`

#### Manual

- [ ] 3.4 Nowy użytkownik bez listy → formularz tworzenia; zapis tworzy listę i pokazuje widok z nazwą + pustym stanem
- [ ] 3.5 Ponowne uruchomienie aplikacji → sesja i lista utrzymane
- [ ] 3.6 Próba utworzenia drugiej listy nie tworzy duplikatu (unikalny indeks; UI odświeża istniejącą)
- [ ] 3.7 Wylogowanie → powrót do auth; ponowne logowanie → ta sama lista
- [ ] 3.8 Pusta nazwa nie zapisuje się (walidacja)
