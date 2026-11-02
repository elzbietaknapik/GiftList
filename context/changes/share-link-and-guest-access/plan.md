# Share Link and Guest Access — Implementation Plan

## Overview

Dostarczyć S-03 (roadmap: `context/foundation/roadmap.md`, Change ID `share-link-and-guest-access`): Życzący kopiuje/udostępnia link `giftlist://list/<share_token>` ze swojej listy; Obdarowujący otwiera link, loguje się i widzi listę prezentów z ich statusami (Wolny / Zarezerwowany / Zrealizowany). Dane idą przez istniejącą RPC `open_shared_list(p_token)` i istniejący odczyt `listGifts`. Bez zmian w schemacie bazy.

Ten plan zastępuje poprzednią wersję, która blokowała Fazę 4 zależnością od S-02. S-02 (`add-gift`) jest już `done` (`src/lib/gifts.ts`, `src/components/gift-list.tsx`), więc cały zakres jest wykonalny.

Źródła: `context/changes/share-link-and-guest-access/expo-linking-research.md`, `…/navigation-auth-research.md`, `context/foundation/roadmap.md` (S-03, lines 113–123), `context/foundation/prd.md` (FR-007, FR-008, FR-010).

> **Ograniczenia zakresu:** skupienie na działającym kodzie UI i zapytaniach do bazy. Bez testów E2E w Playwright, bez scaffoldingu testowego, bez nowych runnerów. Weryfikacja: `npx tsc --noEmit`, `npx expo lint`, kontrole manualne.

## Current State Analysis

- **Owner screen:** `src/app/(app)/index.tsx` ładuje listę (`getMyList`, `:31`) i prezenty (`listGifts`, `:51`); renderuje `AddGiftForm` i `GiftList` w `ScrollView` (`:91–105`). Brak elementu udostępniania.
- **Dane prezentów:** `src/lib/gifts.ts:91–102` — `listGifts(listId)`, kolumny `GIFT_COLUMNS` (`:25`). Typ `GiftStatus = 'free' | 'reserved' | 'purchased'` (`:3`).
- **Dane listy:** `src/lib/lists.ts` — `GiftList` zawiera `share_token: string` (`:6`); `getMyList` (`:17–28`), `createList` (`:30–49`). Brak funkcji `openSharedList`.
- **Root layout:** `src/app/_layout.tsx:29–38` — `ThemeProvider` → `SessionProvider` → `AnimatedSplashOverlay` + `RootNavigator`; `RootNavigator` zwraca `null` przy `loading` (`:13–15`) i używa `Stack.Protected guard={!session}` → `(auth)` oraz `guard={!!session}` → `(app)` (`:18–25`).
- **Konfiguracja natywna:** `app.json:8` — `"scheme": "bootstrapscaffold"` (placeholder); `plugins` (`:26–36`) bez `expo-dev-client`; `experiments.typedRoutes: true` (`:38`). Brak `eas.json`. `expo-linking` jest zainstalowany (`package.json:15`), `expo-dev-client` nie.
- **Baza:**
  - `gifts_lists.share_token uuid not null default gen_random_uuid() unique` (`supabase/migrations/20261005113900_initial_schema.sql:8`) — token już istnieje dla każdej listy.
  - RLS `select_gifts` (`:64–68`) — właściciel i członek listy czytają `gifts`, w tym kolumnę `status`.
  - RPC `open_shared_list(p_token uuid)` (`:96–102`) — `security definer`, wstawia `list_members` (`on conflict do nothing`) i zwraca wiersz `gifts_lists`; grant tylko `authenticated` (`:135–138`).
  - Tabela `reservations` jest zamknięta dla klienta (`:85`); status czytany z `gifts.status` nie ujawnia rezerwującego, więc widok gościa nie potrzebuje `reservation_status`.
- **Brak test runnera** w scope tego zadania (zgodnie z ograniczeniem użytkownika).

### Key Discoveries

- Token jest UUID — walidować przed wywołaniem RPC (`navigation-auth-research.md:51–59`).
- Protected routes przekierowują niezalogowanego gościa do `(auth)` — token musi być zbuforowany przed redirectem (`navigation-auth-research.md:18–24`, D7).
- `Linking.parse('giftlist://list/<token>')` daje `hostname = 'list'`, `path = '<token>'` (`expo-linking-research.md:12–14`, D3).
- Expo Router routuje deep link automatycznie do istniejącej trasy; hook służy tylko do logiki tokenu, nie do nawigacji (`expo-linking-research.md:50–52`).
- `open_shared_list` jest idempotentne (`on conflict do nothing`), więc ponowne otwarcie linku jest bezpieczne.
- Zmiana `scheme` w `app.json` wymaga nowego development build; hot reload nie wystarczy (`expo-linking-research.md:73–75`).

## What We're NOT Doing

- Rezerwacji prezentu i akcji „Zarezerwuj” (S-04) — widok gościa jest tylko do odczytu.
- Realtime i odświeżania statusów na żywo — status jest pobierany przy otwarciu ekranu (S-04 wprowadzi Realtime).
- Oznaczania jako zrealizowany (S-05) i usuwania z ochroną (S-06).
- Regeneracji / unieważniania linku — `share_token` jest stały (decyzja użytkownika).
- Migracji DB, zmian w istniejących migracjach i polityk RLS.
- Zmian w logowaniu (OAuth, magic link, reset hasła) — email + hasło bez zmian.
- `service_role`, kodu serwerowego, Edge Functions.
- Testów E2E w Playwright, testów jednostkowych, scaffoldingu testowego i CI (decyzja użytkownika; `package.json` zawiera `vitest`/`@playwright/test`, ale nie dodajemy ani nie uruchamiamy testów w tym zakresie).
- Trwałego zapisu oczekującego tokenu między zabiciem aplikacji a logowaniem (decyzja: tylko w pamięci).
- Publikacji linków Universal/App Links ani wdrożenia web (format linku to custom scheme).
- Konfiguracji EAS (`eas.json`) i buildów w chmurze.
- Zmiany `name`/`slug` w `app.json` (kosmetyka, poza zakresem linku).

## Implementation Approach

Pięć faz, od konfiguracji natywnej, przez warstwę danych, do UI właściciela i gościa. Logika tokenu (walidacja, parsowanie, bufor) żyje w `src/lib/`; ekrany tylko wywołują funkcje z `src/lib/` i renderują stan. Pojedyncza trasa `src/app/(app)/list/[token].tsx` obsługuje gościa; przechwytywanie linku jest w providerze w root layout, a przekierowanie po zalogowaniu — w `(app)/_layout.tsx`.

Decyzje podjęte bez pytania (zgodne z wzorcami repo):
- Widok właściciela pokazuje URL jako tekst i akcję `Share` z `react-native` — bez nowej zależności (np. `expo-clipboard`).
- Widok gościa reużywa `GiftList` (`src/components/gift-list.tsx`) bez akcji rezerwacji.
- Wszystkie kolory/odstępy przez `useTheme`, `ThemedText`, `ThemedView`, `Spacing`, `Radius` (`AGENTS.md`).

## Critical Implementation Details

- **Warunek bufora:** provider przechwytuje token tylko, gdy `loading === false` i `session === null`. Zalogowany użytkownik jest kierowany przez Expo Router bezpośrednio, więc token nie może być też zbuforowany — inaczej nastąpi podwójna nawigacja.
- **Kolejność w RPC:** najpierw `openSharedList(token)` (dodaje członkostwo), dopiero potem `listGifts(list.id)`. `select_gifts` zwraca wiersze tylko dla członków — odwrotna kolejność da pustą listę bez błędu.
- **Pusty wynik RPC:** dla nieistniejącego tokenu PostgREST zwraca `data = null` bez błędu. `openSharedList` musi rzucić własny błąd „Nie znaleziono listy.”, inaczej gość zobaczy pusty ekran zamiast komunikatu.
- **Typed routes:** po dodaniu `src/app/(app)/list/[token].tsx` uruchom `npx expo start` raz, aby wygenerować `.expo/types/`, przed `npx tsc --noEmit` (wzorzec S-01).
- **Scheme jest czasem budowania:** po zmianie `app.json` konieczny jest nowy `npx expo run:android|ios` (nie Expo Go).
- **Manualne kontrole deep linków (4.4–4.6):** przekierowanie kończy się na trasie z Fazy 5, więc są wykonywane łącznie z kontrolami Fazy 5.

---

## Phase 1: Native config — scheme and development build

### Overview

Zarejestrować scheme `giftlist` i dodać `expo-dev-client`, aby link `giftlist://` dostarczał się do zbudowanej aplikacji.

### Changes Required:

#### 1. App configuration

**File**: `app.json`

**Intent**: Zastąpić placeholder scheme i włączyć development client, bez zmiany pozostałych wpisów konfiguracji.

**Contract**: `expo.scheme` = `"giftlist"`; `expo.plugins` zawiera `"expo-dev-client"` obok `"expo-router"` i wpisu `expo-splash-screen` (zachowany bez zmian). Source: `expo-linking-research.md:59–71`; `app.json:8, 26–36`.

#### 2. Dependency and development build

**File**: `package.json`, `package-lock.json` (przez npm)

**Intent**: Dodać `expo-dev-client` w SDK-zgodnej wersji i wygenerować lokalny development build.

**Contract**: `npx expo install expo-dev-client` (nie `npm install`); build lokalny `npx expo run:android` lub `npx expo run:ios` (wymagane lokalne toolchain: Android Studio lub Xcode). Nie edytować ręcznie katalogów `ios/` ani `android/` (generowane, gitignorowane).

### Success Criteria:

#### Automated Verification:

- `npx tsc --noEmit` przechodzi
- `npx expo lint` przechodzi
- `app.json` zawiera `"scheme": "giftlist"` i `"expo-dev-client"` w `plugins`

#### Manual Verification:

- Development build instaluje się na urządzeniu lub emulatorze
- Otwarcie `giftlist://` (dowolna ścieżka) uruchamia aplikację (nie Expo Go)

**Implementation Note**: Po zakończeniu automatycznej weryfikacji zatrzymaj się na potwierdzenie manualne przed Fazą 2.

---

## Phase 2: Data layer — share URL and shared-list access

### Overview

Dodać czyste funkcje tworzenia i parsowania linku oraz wywołanie RPC `open_shared_list`. Bez UI.

### Changes Required:

#### 1. Share-link helpers

**File**: `src/lib/share-link.ts` (nowy)

**Intent**: Jedno miejsce budujące URL udostępniania i walidujące token, używane przez właściciela, providera deep linków i widok gościa.

**Contract**:
- `buildShareUrl(shareToken: string): string` → `giftlist://list/<shareToken>` (literalnie; patrz Open Question O3 zamkniętą jako decyzja w tym planie).
- `isShareToken(value: string): boolean` — dopasowanie UUID (case-insensitive) do wzorca 8-4-4-4-12.
- `parseShareToken(url: string): string | null` — `Linking.parse(url)`; zwraca token tylko, gdy `hostname === 'list'`, `path` jest niepusty i `isShareToken(path)`; w przeciwnym razie `null`.
Source: `expo-linking-research.md:12–14`; `navigation-auth-research.md:51–59`.

#### 2. Open shared list (RPC)

**File**: `src/lib/lists.ts`

**Intent**: Dodać wywołanie RPC, które dołącza zalogowanego gościa do listy i zwraca ją; wzorzec jak w `getMyList`.

**Contract**: `openSharedList(token: string): Promise<GiftList>` wywołuje `supabase.rpc('open_shared_list', { p_token: token })`; przy `error` rzuca `new Error(error.message)` (wzorzec `:24–26`); przy `data === null` rzuca `new Error('Nie znaleziono listy.')`; zwraca obiekt zmapowany do pól `GiftList` (`id`, `name`, `share_token`, `created_at`), bo RPC zwraca też `owner_id`. Source: `initial_schema.sql:96–102, 135–138`.

### Success Criteria:

#### Automated Verification:

- `npx tsc --noEmit` przechodzi
- `npx expo lint` przechodzi
- `src/lib/share-link.ts` eksportuje `buildShareUrl`, `isShareToken`, `parseShareToken`
- `src/lib/lists.ts` eksportuje `openSharedList`

#### Manual Verification:

- Brak (warstwa czysta; weryfikowana przez UI w fazach 3 i 5)

---

## Phase 3: Owner share link on the list screen

### Overview

Właściciel widzi link swojej listy na ekranie i może go udostępnić przez natywny arkusz udostępniania.

### Changes Required:

#### 1. Share link card

**File**: `src/components/share-link-card.tsx` (nowy)

**Intent**: Mały komponent prezentacyjny: etykieta, URL jako zaznaczalny tekst i przycisk „Udostępnij”.

**Contract**: props `{ shareToken: string }`; URL = `buildShareUrl(shareToken)`; przycisk używa `Button` z `src/components/ui/button.tsx` i wywołuje `Share.share({ message: url })` z `react-native`; błąd udostępniania pokazywany przez `FormError` (nie połykany). Styl przez `ThemedView type="backgroundElement"`, `ThemedText`, `Radius`, `Spacing`; bez literałów kolorów.

#### 2. Mount on owner screen

**File**: `src/app/(app)/index.tsx`

**Intent**: Pokazać kartę linku nad formularzem prezentu, tylko gdy lista istnieje.

**Contract**: w bloku `{list ? (…) : …}` (`:91–105`) dodać `<ShareLinkCard shareToken={list.share_token} />` jako pierwszy element `ScrollView`, przed `AddGiftForm`. Bez zmian w logice ładowania (`:28–64`).

### Success Criteria:

#### Automated Verification:

- `npx tsc --noEmit` przechodzi
- `npx expo lint` przechodzi
- Plik `src/components/share-link-card.tsx` istnieje i jest importowany w `src/app/(app)/index.tsx`

#### Manual Verification:

- Zalogowany właściciel widzi link `giftlist://list/<uuid>`, gdzie `<uuid>` = `gifts_lists.share_token`
- Przycisk „Udostępnij” otwiera natywny arkusz udostępniania z tym linkiem

---

## Phase 4: Deep-link capture and pending token across login

### Overview

Przechwycić przychodzący `giftlist://list/<token>` w root layout, zbuforować token w pamięci, gdy użytkownik nie jest zalogowany, i przekazać go do trasy gościa po zalogowaniu.

### Changes Required:

#### 1. Share-link provider

**File**: `src/lib/share-link.tsx` (nowy)

**Intent**: Jeden właściciel stanu „oczekującego tokenu”, który przetrwa przekierowanie do `(auth)`.

**Contract**:
- `ShareLinkProvider({ children })` używa `useSession()` (`src/lib/session.tsx`) oraz `Linking.useLinkingURL()` (obsługuje link początkowy i link przychodzący gdy aplikacja działa; nie używać przestarzałego `useURL`).
- Efekt: gdy `loading === false`, `session === null`, a URL nie jest `null` — `parseShareToken(url)`; jeśli zwraca token, zapisz w stanie `pendingToken`.
- Eksportuje hook `useShareLink()` zwracający `{ pendingToken: string | null, clearPendingToken: () => void }`; hook rzuca błąd poza providerem (wzorzec `useSession`).
- Nie wykonuje żadnej nawigacji ani wywołania RPC.
Source: `expo-linking-research.md:12, 16–33`; `navigation-auth-research.md:18–24, 28–35`.

#### 2. Root layout wiring

**File**: `src/app/_layout.tsx`

**Intent**: Zamontować provider wewnątrz `SessionProvider`, aby widział URL niezależnie od aktywnej grupy tras.

**Contract**: `SessionProvider` → `ShareLinkProvider` → (`AnimatedSplashOverlay` + `RootNavigator`); guardy `Stack.Protected` (`:18–25`) bez zmian.

#### 3. Redirect after login

**File**: `src/app/(app)/_layout.tsx`

**Intent**: Gdy po zalogowaniu istnieje oczekujący token, przekierować do widoku gościa i wyczyścić bufor.

**Contract**: efekt w `(app)/_layout.tsx` (mounted tylko gdy `session` istnieje): jeśli `pendingToken` nie jest `null` — `clearPendingToken()` i `router.push({ pathname: '/list/[token]', params: { token: pendingToken } })`. Wyczyszczenie przed push zapobiega ponownemu przekierowaniu.

### Success Criteria:

#### Automated Verification:

- `npx tsc --noEmit` przechodzi
- `npx expo lint` przechodzi
- Plik `src/lib/share-link.tsx` istnieje; `src/app/_layout.tsx` zawiera `ShareLinkProvider` wewnątrz `SessionProvider`

#### Manual Verification:

- Zalogowany użytkownik otwiera link przy działającej aplikacji — aplikacja otwiera się bez awarii, widok gościa pokazuje listę (kontrola wykonywana łącznie z Fazą 5)
- Zalogowany użytkownik otwiera link przy zimnym starcie — brak awarii, przejście do widoku gościa (łącznie z Fazą 5)
- Niezalogowany użytkownik otwiera link — trafia na ekran logowania; po zalogowaniu aplikacja przechodzi do `/list/<token>` (łącznie z Fazą 5)

**Implementation Note**: Kontrole manualne 4.4–4.6 wymagają trasy z Fazy 5 jako celu przekierowania. Wykonaj je po zakończeniu Fazy 5; po automatycznej weryfikacji Fazy 4 zatrzymaj się na potwierdzenie.

---

## Phase 5: Guest view — shared list with statuses

### Overview

Trasa `/list/[token]` dla zalogowanego gościa: dołącza do listy przez RPC, pobiera prezenty i pokazuje je z ich statusami, tylko do odczytu.

### Changes Required:

#### 1. Guest route

**File**: `src/app/(app)/list/[token].tsx` (nowy)

**Intent**: Ekran gościa, który waliduje token, wywołuje `openSharedList`, potem `listGifts`, i renderuje stan (ładowanie / błąd / lista / pusta lista) bez akcji rezerwacji.

**Contract**:
- Parametr: `useLocalSearchParams<{ token: string }>()`.
- Jeśli `!isShareToken(token)` → stan błędu „Nieprawidłowy link.” bez wywołania RPC.
- Sekwencja: `openSharedList(token)` → `listGifts(list.id)`; flaga `active` w efekcie (wzorzec `index.tsx:28–64`), żeby nie ustawiać stanu po odmontowaniu.
- Renderuje nazwę listy (`ThemedText type="subtitle"`), `GiftList` gdy są prezenty, w przeciwnym razie tekst „Ta lista nie ma jeszcze prezentów.”, błędy przez `FormError`.
- Brak wywołań Supabase bezpośrednio w widoku — tylko funkcje z `src/lib/`.
- Statusy pochodzą z `gifts.status` (RLS `select_gifts`); nie czytać `reservations` ani `reservation_status`.

#### 2. Typed routes

**File**: `.expo/types/` (generowane, gitignorowane)

**Intent**: Wygenerować typy dla nowej trasy przed kompilacją.

**Contract**: uruchomić `npx expo start` raz (typed routes); następnie `npx tsc --noEmit`. Nie commitować `.expo/`.

### Success Criteria:

#### Automated Verification:

- `npx tsc --noEmit` przechodzi (po regeneracji typed routes)
- `npx expo lint` przechodzi
- Plik `src/app/(app)/list/[token].tsx` istnieje i nie importuje `supabase` bezpośrednio

#### Manual Verification:

- Gość (zalogowany innym kontem) otwiera link właściciela — widzi nazwę listy i wszystkie prezenty ze statusami „Wolny”, „Zarezerwowany”, „Zrealizowany”
- Nieprawidłowy token (np. `giftlist://list/abc`) — wyświetla „Nieprawidłowy link.”, bez awarii
- Nieistniejący poprawny UUID — wyświetla „Nie znaleziono listy.”
- Widok nie pokazuje tożsamości rezerwującego w żadnym miejscu
- Kontrole 4.4–4.6 z Fazy 4 wykonane end-to-end (link → login → lista)

---

## DoD (Definition of Done)

- `app.json` ma `"scheme": "giftlist"` i `expo-dev-client`; development build działa lokalnie (Faza 1).
- `buildShareUrl` tworzy `giftlist://list/<share_token>`; właściciel widzi i udostępnia link (Fazy 2–3).
- Przychodzący link jest przechwytywany, buforowany dla niezalogowanego i kierowany do widoku gościa po zalogowaniu (Faza 4).
- Gość widzi listę ze statusami, tylko do odczytu, bez tożsamości rezerwującego (Faza 5).
- `npx tsc --noEmit` i `npx expo lint` przechodzą.
- Brak nowych testów, brak Playwright, brak zmian w `supabase/`.

## Risks

| # | Risk | Mitigation |
|---|------|-----------|
| 1 | Zmiana scheme bez przebudowy build → link nie działa | Faza 1 wymaga nowego `expo run`; kontrola, że aplikacja nie jest Expo Go. |
| 2 | Token zgubiony, gdy aplikacja zostanie zabita na ekranie logowania | Akceptowane (decyzja: pamięć); gość ponownie otwiera link. Ryzyko udokumentowane w Open Risks. |
| 3 | Podwójna nawigacja (routing Expo Router + bufor) | Bufor tylko przy `session === null`; `clearPendingToken` przed `push`. |
| 4 | Pusta lista u gościa, bo RPC nie została wykonana przed `listGifts` | Kolejność w Phase 5; `select_gifts` wymaga członkostwa. |
| 5 | Typed-route błędy po dodaniu `list/[token].tsx` | Regeneracja `.expo/types/` przed `tsc`. |
| 6 | Owner otwiera własny link → RPC dodaje go jako członka | Nieszkodliwe (`on conflict do nothing`); widok pokazuje tę samą listę. |

## Out of scope

- Rezerwacja, realtime, oznaczanie zrealizowanego, usuwanie z ochroną (S-04…S-06).
- Migracje DB, zmiany RLS, edycja zastosowanych migracji.
- Auth (OAuth, magic link, reset hasła), `service_role`, serwer.
- Testy E2E Playwright, testy jednostkowe, CI, `eas.json`.

## Open risks & assumptions

- Link `giftlist://` nie otwiera się klikalnie we wszystkich komunikatorach (wybór custom scheme, zaakceptowany).
- Development build wymaga lokalnego Android Studio lub Xcode (wybór lokalnego buildu, zaakceptowany).
- `package.json` zawiera `vitest` i `@playwright/test` oraz skrypt `test`; zgodnie z ograniczeniem użytkownika nie są używane w tym zakresie.
- Statusy są migawką z chwili otwarcia ekranu; odświeżanie na żywo przychodzi w S-04.

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Native config — scheme and development build

#### Automated
- [x] 1.1 `npx tsc --noEmit` passes — d18c843
- [x] 1.2 `npx expo lint` passes — d18c843
- [x] 1.3 `app.json` has `"scheme": "giftlist"` and `expo-dev-client` in `plugins` — d18c843

#### Manual
- [x] 1.4 Development build installs; `giftlist://` opens the app (not Expo Go) — d18c843

### Phase 2: Data layer — share URL and shared-list access

#### Automated
- [x] 2.1 `npx tsc --noEmit` passes — 5b35fe9
- [x] 2.2 `npx expo lint` passes — 5b35fe9
- [x] 2.3 `src/lib/share-link.ts` exports `buildShareUrl`, `isShareToken`, `parseShareToken` — 5b35fe9
- [x] 2.4 `src/lib/lists.ts` exports `openSharedList` — 5b35fe9

### Phase 3: Owner share link on the list screen

#### Automated
- [x] 3.1 `npx tsc --noEmit` passes — aa6e39b
- [x] 3.2 `npx expo lint` passes — aa6e39b
- [x] 3.3 `src/components/share-link-card.tsx` exists and is mounted in `src/app/(app)/index.tsx` — aa6e39b

#### Manual
- [x] 3.4 Owner sees `giftlist://list/<uuid>` matching `share_token` — aa6e39b
- [x] 3.5 “Udostępnij” opens the native share sheet with the link — aa6e39b

### Phase 4: Deep-link capture and pending token across login

#### Automated
- [x] 4.1 `npx tsc --noEmit` passes
- [x] 4.2 `npx expo lint` passes
- [x] 4.3 `src/lib/share-link.tsx` exists; root layout mounts `ShareLinkProvider` inside `SessionProvider`

#### Manual
- [ ] 4.4 Logged-in user opens link with app running — no crash, routed to guest view (complete with Phase 5)
- [ ] 4.5 Logged-in user opens link on cold start — no crash, routed to guest view (complete with Phase 5)
- [ ] 4.6 Logged-out user opens link → login; after login routed to `/list/<token>` (complete with Phase 5)

### Phase 5: Guest view — shared list with statuses

#### Automated
- [ ] 5.1 `npx tsc --noEmit` passes (after typed routes regenerated)
- [ ] 5.2 `npx expo lint` passes
- [ ] 5.3 `src/app/(app)/list/[token].tsx` exists and does not import `supabase` directly

#### Manual
- [ ] 5.4 Guest sees list name and all gifts with “Wolny” / “Zarezerwowany” / “Zrealizowany” statuses
- [ ] 5.5 Invalid token shows “Nieprawidłowy link.” without crash
- [ ] 5.6 Non-existent valid UUID shows “Nie znaleziono listy.”
- [ ] 5.7 No reserver identity shown anywhere in the guest view

## References

- Research: `context/changes/share-link-and-guest-access/expo-linking-research.md`, `…/navigation-auth-research.md`
- Roadmap: `context/foundation/roadmap.md` (S-03 lines 113–123; S-02 done lines 101–111)
- PRD: `context/foundation/prd.md` (FR-007, FR-008, FR-010)
- Schema/RPC: `supabase/migrations/20261005113900_initial_schema.sql:8, 64–68, 96–102, 135–138`; `supabase/migrations/20261005153300_reservation_status_scope.sql`
- Client: `src/lib/supabase.ts`, `src/lib/session.tsx`, `src/lib/lists.ts:6`, `src/lib/gifts.ts:91–102`
- Layout: `src/app/_layout.tsx:18–25, 29–38`; owner screen `src/app/(app)/index.tsx:91–105`
