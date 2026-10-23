# Dodawanie prezentu — Plan implementacji

## Overview

Dostarczyć S-02: Życzący (zalogowany właściciel swojej listy) dodaje prezent — nazwa, link, cena (wymagane) oraz opcjonalny URL zdjęcia — i widzi go na swojej liście ze statusem „Wolny". Formularz znajduje się na istniejącym ekranie `(app)/index.tsx`, pod nagłówkiem listy. Zmiana nie dotyka schematu bazy: tabela `gifts`, ograniczenia (`name` niepusty, `link` NOT NULL, `price` ≥ 0, `status` domyślnie `free`) oraz polityki `insert_gifts` / `select_gifts` są już zastosowane w `supabase/migrations/20261005113900_initial_schema.sql`.

Źródła: `context/changes/add-gift/change.md`, roadmap S-02 (`context/foundation/roadmap.md`), PRD FR-005 (`context/foundation/prd.md`).

## Current State Analysis

- **Schemat i RLS gotowe.** `gifts(id, list_id, name, link, price numeric(10,2), image_url, status, created_at)` z indeksem `gifts_list_id_idx` (`supabase/migrations/20261005113900_initial_schema.sql:23`–`:35`). Polityka `insert_gifts` wymaga, aby `list_id` należał do `auth.uid()` (`:85`–`:87`); `select_gifts` pokazuje gifts właścicielowi lub członkowi listy (`:76`–`:83`). `gifts` jest już w publikacji Realtime (`:136`).
- **Brak warstwy danych dla prezentów.** `src/lib/lists.ts` jest jedynym modułem danych; wzorzec: eksportowany typ, `supabase.from(...)`, `throw new Error(error.message)`, trymowanie wejścia (`src/lib/lists.ts:1`–`:47`). Klient `src/lib/supabase.ts` nie jest typowany generycznie — typ `Gift` piszemy ręcznie, tak jak `GiftList`.
- **Ekran listy.** `src/app/(app)/index.tsx` ładuje listę przez `getMyList` (`:24`–`:40`). Gdy lista istnieje, renderuje `ListEmptyState` (`:66`) — ten placeholder zastępuje widok prezentów. Tekst `src/components/list-empty-state.tsx:11`–`:13` mówi „Dodawanie prezentów w kolejnym kroku" i `flex: 1` (`:19`) — po zmianie układu do przewijanego ekranu wymaga korekty.
- **Wzorzec formularza.** `src/components/create-list-form.tsx` jest referencją: `TextField` z `invalid` / `errorId`, `FormError` z `nativeID` (`:50`), `Button` z `loading`, guard `saving` przed podwójnym wysłaniem (`:20`, `:35`).
- **Prymitywy `src/components/ui/`** (zrealizowane w `ui-first-list-screen`, status `implemented`): `Button` (`label`, `onPress`, `loading`, `disabled`), `TextField` (spread `TextInputProps`, więc `keyboardType`/`autoCapitalize` działają; `invalid`, `errorId`), `FormError` (`nativeID`).
- **Tokeny.** `Spacing` ma klucze `half, one, two, three, four, five, six` (`src/constants/theme.ts`); `Radius` = `small`/`medium`. W widokach brak literałów kolorów (`AGENTS.md`); kolory tylko przez `ThemedText themeColor` / `useTheme`.
- **Brak test runnera** (`AGENTS.md`) — weryfikacja: `npx tsc --noEmit`, `npx expo lint`, kontrole manualne.

## Desired End State

Zalogowany Życzący z listą widzi na ekranie: nagłówek z nazwą listy, formularz „Dodaj prezent" (nazwa, link, cena, zdjęcie opcjonalnie) i pod nim listę swoich prezentów w kolejności dodania. Każdy wiersz pokazuje nazwę, cenę w formacie `12,50 zł`, status (`Wolny`) i link jako tekst. Niepoprawne dane (pusta nazwa, link bez `http(s)://`, cena nie-liczbowa lub ujemna, zdjęcie niebędące URL-em http(s)) blokują zapis z błędem inline. Po poprawnym zapisie formularz się czyści, a prezent pojawia się na liście bez przeładowania ekranu i pozostaje po ponownym uruchomieniu aplikacji. Gdy lista jest pusta, widoczny jest stan pusty z zaktualizowanym tekstem. `npx tsc --noEmit` i `npx expo lint` przechodzą.

### Key Discoveries:

- Schemat wymaga `link` (NOT NULL), nie wymusza formatu — walidacja URL jest po stronie klienta (`supabase/migrations/20261005113900_initial_schema.sql:27`).
- `price numeric(10,2)` — maksimum to `99999999.99`; wejście z przecinkiem (`12,50`) trzeba zamienić na liczbę przed wysłaniem.
- `insert_gifts` sprawdza właściciela listy przez `list_id`, więc `listId` musi pochodzić z listy zalogowanego użytkownika (już tak jest w `index.tsx`).
- Brak migracji i brak nowej trasy: formularz inline nie wymaga regeneracji typów tras (`app.json` → `typedRoutes`).

## What We're NOT Doing

- Bez edycji prezentu po dodaniu (PRD Non-Goals; MVP: dodaj/usuń wolny).
- Bez usuwania prezentu — FR-006 i blokada usuwania rezerwowanych to S-06.
- Bez linku udostępniania, widoku gościa i jakiejkolwiek rezerwacji lub zmiany statusu (S-03…S-05). Owner view pokazuje tylko `gifts.status`; nie czyta `reservations` ani `reservation_status`.
- Bez scrapingu metadanych z linku (Open Graph) — PRD Non-Goals.
- Bez uploadu zdjęć i podglądu obrazu; zdjęcie to tylko opcjonalny URL (roadmap: „zdjęcie tylko jako URL").
- Bez wyboru waluty i kolumny `currency` — cena w zł wyłącznie w warstwie wyświetlania (decyzja użytkownika).
- Bez blokady duplikatów linku — ten sam link może wystąpić dwa razy (decyzja użytkownika).
- Bez nowej trasy (`app/(app)/gifts/...`) — formularz inline na ekranie listy (decyzja użytkownika).
- Bez zmian w `supabase/`, `app.json`, `src/lib/session.tsx`, `src/lib/supabase.ts`.
- Bez dodawania runnera testów ani CI (Parked w roadmapie).

## Implementation Approach

Trzy fazy od warstwy danych do UI. Faza 1 dodaje `src/lib/gifts.ts` z typem `Gift`, odczytem i zapisem oraz czystą funkcją walidacji wejścia — walidacja jest w jednym miejscu, żeby formularz nie duplikował reguł. Faza 2 buduje `AddGiftForm` na prymitywach `ui/` wzorem `CreateListForm`, z pełną walidacją inline i stanem ładowania. Faza 3 renderuje listę (`GiftList`), ładuje prezenty w `index.tsx` po ustaleniu listy, składa formularz i listę w przewijany widok oraz aktualizuje `ListEmptyState`. Ekran pozostaje jednym plikiem routingu; wszystkie komponenty żyją w `src/components/`, kod danych w `src/lib/`.

## Critical Implementation Details

- **Format ceny:** użytkownik wpisuje `12,50` lub `12.50`; przed walidacją zamień przecinek na kropkę, sprawdź wzorzec `^\d+(\.\d{1,2})?$` i zakres `0 ≤ cena ≤ 99999999.99`. Do bazy wysyłaj `number`, nie string. Wyświetlanie: `toFixed(2)` z zamianą kropki na przecinek + ` zł`.
- **Wymagane vs opcjonalne:** nazwa, link i cena są wymagane (schemat i FR-005); tylko `image_url` jest opcjonalny. Pusty URL zdjęcia zapisywany jest jako `null`, nie jako pusty string.
- **Walidacja linku:** najpierw `trim()`, potem parsowanie konstruktorem `URL` w `try/catch`; protokół musi być `http:` lub `https:`. Ten sam warunek dla zdjęcia, gdy pole jest wypełnione.
- **Kolejność w `index.tsx`:** pobierz prezenty dopiero, gdy `list` jest znane (`list?.id`), i pokaż `ActivityIndicator` lub pustą wartość do czasu załadowania, żeby nie mignął stan „pusta lista".
- **Podwójne wysłanie:** guard `saving` jak w `CreateListForm`; przycisk w stanie `loading` blokuje ponowne kliknięcie.
- **Układ:** `ListEmptyState` z `flex: 1` nie działa w `ScrollView`; usuń `flex: 1` z jego stylu, zachowując wyśrodkowanie tekstu.

## Phase 1: Warstwa danych i walidacja

### Overview

Dostarczyć `src/lib/gifts.ts`: typ, odczyt listy prezentów, zapis prezentu oraz czystą walidację wejścia. Bez UI.

### Changes Required:

#### 1. Moduł prezentów

**File**: `src/lib/gifts.ts`

**Intent**: Odizolować dostęp do tabeli `gifts` i reguły wejścia dla dodawania prezentu w jednym module; RLS egzekwuje własność po stronie bazy.

**Contract**:
- `export type GiftStatus = 'free' | 'reserved' | 'purchased'`.
- `export type Gift = { id: string; list_id: string; name: string; link: string; price: number; image_url: string | null; status: GiftStatus; created_at: string }`.
- `export type NewGift = { name: string; link: string; price: number; image_url: string | null }`.
- `export type GiftFieldErrors = Partial<Record<'name' | 'link' | 'price' | 'image', string>>`.
- `export function parseGiftInput(raw: { name: string; link: string; price: string; image: string }): { value: NewGift; errors: null } | { value: null; errors: GiftFieldErrors }` — czysta funkcja: trymuje, zamienia przecinek w cenie, waliduje reguły z sekcji „Critical Implementation Details" i zwraca komunikaty po polsku w stylu istniejącym (`Podaj nazwę listy.`): `Podaj nazwę prezentu.`, `Podaj link do prezentu.`, `Link musi zaczynać się od http:// lub https://.`, `Podaj cenę.`, `Cena musi być liczbą ≥ 0 z maksymalnie 2 miejscami po przecinku.`, `Link do zdjęcia musi zaczynać się od http:// lub https://.`.
- `export async function listGifts(listId: string): Promise<Gift[]>` — `from('gifts').select('id,list_id,name,link,price,image_url,status,created_at').eq('list_id', listId).order('created_at', { ascending: true })`; błąd → `throw new Error(error.message)`; `price` mapowany na `Number(...)`.
- `export async function addGift(listId: string, gift: NewGift): Promise<Gift>` — `insert({ list_id: listId, ...gift })` z `.select(...).single()`; błąd → `throw new Error(error.message)`.

### Success Criteria:

#### Automated Verification:

- Type checking passes: `npx tsc --noEmit`
- Linting passes: `npx expo lint`
- Plik istnieje: `src/lib/gifts.ts`

#### Manual Verification:

Brak — weryfikacja funkcjonalna przypada na Fazę 2 i 3 (formularz i lista).

**Implementation Note**: Po zielonych kontrolach automatycznych zatrzymać się i potwierdzić przed Fazą 2.

---

## Phase 2: Formularz dodawania prezentu

### Overview

Dostarczyć `AddGiftForm` na prymitywach `ui/`: pola nazwy, linku, ceny i zdjęcia, walidacja inline i zapis do bazy przez `addGift`.

### Changes Required:

#### 1. Komponent formularza

**File**: `src/components/add-gift-form.tsx`

**Intent**: Zebrać dane prezentu i zapisać je na liście właściciela, pokazując błędy przy właściwych polach; wzorzec identyczny z `CreateListForm`.

**Contract**: `AddGiftForm({ listId: string; onAdded: (gift: Gift) => void })`. Stan: `name`, `link`, `price`, `image`, `errors: GiftFieldErrors`, `formError: string | null`, `saving: boolean`. Submit: guard `saving`; `parseGiftInput`; przy błędach ustaw `errors` i zakończ; inaczej `setSaving(true)` → `addGift(listId, value)` → `onAdded(created)` → wyczyść pola i błędy. Błąd z `addGift` → `formError` (`e.message` lub `Nie udało się zapisać prezentu.`). Pola: `TextField` z `invalid={!!errors.x}` i `errorId` dla każdego pola z błędem; `keyboardType="url"` + `autoCapitalize="none"` dla linku i zdjęcia; `keyboardType="decimal-pad"` dla ceny; `placeholder` po polsku. Błędy pod polami przez `FormError nativeID=...`. Przycisk `Button label="Dodaj prezent" loading={saving}`. Nagłówek sekcji `ThemedText type="subtitle"`. Kolory wyłącznie przez `ThemedText`/`useTheme`; odstępy przez `Spacing`.

### Success Criteria:

#### Automated Verification:

- Type checking passes: `npx tsc --noEmit`
- Linting passes: `npx expo lint`
- Plik istnieje: `src/components/add-gift-form.tsx`
- Brak literałów kolorów w widoku: `rg "#[0-9a-fA-F]{3,8}" src/components/add-gift-form.tsx` zwraca 0 trafień

#### Manual Verification:

- Puste pola / nieprawidłowy link / cena `-5` lub `abc` / zdjęcie `ftp://…` → komunikat inline przy właściwym polu, brak wysyłania, brak crasha.
- Poprawne dane z ceną `12,50` i pustym zdjęciem → przycisk w stanie ładowania, po zapisie pola są puste, a w tabeli `gifts` (Supabase Table Editor lub lokalnie) pojawia się wiersz z `price = 12.50`, `image_url = null`, `status = free`.

**Implementation Note**: Zatrzymać się po weryfikacji manualnej przed Fazą 3.

---

## Phase 3: Lista prezentów na ekranie listy

### Overview

Dostarczyć widok prezentów pod formularzem: ładowanie listy, renderowanie wierszy, stan pusty i złożenie ekranu.

### Changes Required:

#### 1. Lista prezentów

**File**: `src/components/gift-list.tsx`

**Intent**: Pokazać prezenty właściciela czytelnie: nazwa, cena w zł, status po polsku i link jako tekst — bez żadnych danych o rezerwującym.

**Contract**: `GiftList({ gifts: Gift[] })` renderuje kolumnę wierszy (`View` z `gap` przez `Spacing`). Mapowanie statusu: `free` → `Wolny`, `reserved` → `Zarezerwowany`, `purchased` → `Zrealizowany`. Cena: `price.toFixed(2).replace('.', ',') + ' zł'`. Nazwa `ThemedText type="default"`, cena i status `ThemedText themeColor="textSecondary"`, link `ThemedText type="small" themeColor="textSecondary" numberOfLines={1}`. Wiersz używa `ThemedView type="backgroundElement"` z `Radius.small`. Komponent nie czyta żadnych danych o rezerwacjach.

#### 2. Stan pusty

**File**: `src/components/list-empty-state.tsx`

**Intent**: Dopasować tekst do nowego stanu (formularz jest na ekranie) i usunąć `flex: 1`, które nie działa w przewijanym widoku.

**Contract**: Pierwsza linia: `Nie dodano jeszcze prezentów.`; druga (`themeColor="textSecondary"`): `Dodaj pierwszy prezent w formularzu powyżej.`. Usunąć `flex: 1` z `styles.emptyState`; zachować `alignItems: 'center'` i `gap`.

#### 3. Ekran listy

**File**: `src/app/(app)/index.tsx`

**Intent**: Połączyć nagłówek, formularz i listę w jeden przewijany ekran; prezenty ładują się po ustaleniu listy.

**Contract**: Nowy stan `gifts: Gift[]` i `giftsLoading`. Efekt zależny od `list?.id`: gdy id istnieje, `listGifts(list.id)` z obsługą `active` jak w obecnym efekcie listy; błąd → `setError`. Render gdy `list` istnieje: nagłówek (bez zmian), `FormError` przy błędzie, `ScrollView` z `keyboardShouldPersistTaps="handled"` zawierający `AddGiftForm listId={list.id} onAdded={(g) => setGifts((prev) => [...prev, g])}`, następnie `gifts.length === 0 ? <ListEmptyState /> : <GiftList gifts={gifts} />`. Gdy `list` brak i `user` istnieje — `CreateListForm` bez zmian. Spinner `ActivityIndicator` dla `loading` pozostaje. Dodać `Spacing` do odstępu między sekcjami przez `gap` w kontenerze treści.

### Success Criteria:

#### Automated Verification:

- Type checking passes: `npx tsc --noEmit`
- Linting passes: `npx expo lint`
- Pliki istnieją: `src/components/gift-list.tsx`
- Brak literałów kolorów w zmienionych widokach: `rg "#[0-9a-fA-F]{3,8}" src/components/gift-list.tsx src/components/list-empty-state.tsx "src/app/(app)/index.tsx"` zwraca 0 trafień

#### Manual Verification:

- Nowy użytkownik z listą bez prezentów → nagłówek, formularz i tekst „Nie dodano jeszcze prezentów."
- Dodanie dwóch prezentów → oba widoczne w kolejności dodania, z ceną `… zł` i statusem `Wolny`; formularz czysty po każdym zapisie.
- Przeładowanie aplikacji → prezenty nadal widoczne (dane z bazy).
- Zalogowanie innym kontem → brak prezentów cudzej listy (RLS `select_gifts`).
- Tryb ciemny i jasny → tekst i błędy czytelne; przewijanie działa przy wielu prezentach.

**Implementation Note**: Po weryfikacji manualnej zakończyć zmianę; status `implemented` ustawia `/10x-implement`, nie plan.

---

## Testing Strategy

### Unit Tests:

- Brak runnera testów w repo (`AGENTS.md`) — nie dodajemy frameworka w tym zakresie. `parseGiftInput` jest czystą funkcją, więc nadaje się do testu, gdy runner zostanie dodany.

### Integration Tests:

- Brak zmian w bazie; istniejące pgTAP (F-01) nie dotyczą tego przepływu.

### Manual Testing Steps:

1. Zalogować się kontem z listą (S-01) i wejść na ekran listy.
2. Dodać prezent z pełnymi danymi (nazwa, `https://…`, cena `12,50`, zdjęcie `https://…/x.jpg`) → potwierdzić wiersz z `12,50 zł`.
3. Dodać prezent bez zdjęcia z ceną `0` → potwierdzić zapis i `0,00 zł`.
4. Sprawdzić wszystkie błędy walidacji z Fazy 2.
5. Przeładować aplikację → potwierdzić utrzymanie prezentów.
6. Zalogować się drugim kontem → potwierdzić brak dostępu do cudzych prezentów.

## Performance Considerations

Jeden odczyt `gifts` po `list_id` (indeks `gifts_list_id_idx`) i jeden insert na zapis. Brak paginacji — lista MVP jest mała (PRD: `data_volume: small`).

## Migration Notes

Brak migracji. Schemat, indeksy i polityki RLS dla `gifts` są już zastosowane (`supabase/migrations/20261005113900_initial_schema.sql`). Nie zmieniamy plików w `supabase/`.

## References

- Change: `context/changes/add-gift/change.md`
- Roadmap: `context/foundation/roadmap.md` (S-02 `add-gift`, zależność S-01)
- PRD: `context/foundation/prd.md` (FR-005; Non-Goals; NFR „tożsamość nigdy nie wycieka")
- Schema/RLS: `supabase/migrations/20261005113900_initial_schema.sql:23`–`:35` (gifts), `:76`–`:87` (select/insert gifts)
- Wzorzec formularza: `src/components/create-list-form.tsx`
- Wzorzec danych: `src/lib/lists.ts`
- Prymitywy: `src/components/ui/button.tsx`, `src/components/ui/text-field.tsx`, `src/components/ui/form-error.tsx`
- Ekran: `src/app/(app)/index.tsx`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Warstwa danych i walidacja

#### Automated

- [x] 1.1 Type checking passes: `npx tsc --noEmit`
- [x] 1.2 Linting passes: `npx expo lint`
- [x] 1.3 Plik istnieje: `src/lib/gifts.ts`

### Phase 2: Formularz dodawania prezentu

#### Automated

- [x] 2.1 Type checking passes: `npx tsc --noEmit`
- [x] 2.2 Linting passes: `npx expo lint`
- [x] 2.3 Plik istnieje: `src/components/add-gift-form.tsx`
- [x] 2.4 Brak literałów kolorów w `add-gift-form.tsx`

#### Manual

- [x] 2.5 Błędy walidacji (puste pola, zły link, cena `-5`/`abc`, zdjęcie `ftp://`) pokazują się inline przy właściwym polu
- [x] 2.6 Poprawny zapis z ceną `12,50` tworzy wiersz w `gifts` (`price = 12.50`, `status = free`) i czyści formularz

### Phase 3: Lista prezentów na ekranie listy

#### Automated

- [x] 3.1 Type checking passes: `npx tsc --noEmit`
- [x] 3.2 Linting passes: `npx expo lint`
- [x] 3.3 Pliki istnieją: `src/components/gift-list.tsx`
- [x] 3.4 Brak literałów kolorów w `gift-list.tsx`, `list-empty-state.tsx`, `(app)/index.tsx`

#### Manual

- [x] 3.5 Lista bez prezentów pokazuje stan pusty z nowym tekstem
- [x] 3.6 Dodane prezenty widoczne w kolejności dodania z ceną `… zł` i statusem `Wolny`
- [x] 3.7 Po przeładowaniu aplikacji prezenty są nadal widoczne
- [x] 3.8 Drugie konto nie widzi prezentów cudzej listy
- [x] 3.9 Tryb jasny i ciemny: tekst i błędy czytelne; przewijanie działa przy wielu prezentach
