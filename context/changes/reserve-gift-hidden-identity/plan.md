# Reserve Gift with Hidden Identity — Implementation Plan

## Overview

Dostarczyć S-04 (roadmap: `context/foundation/roadmap.md`, Change ID `reserve-gift-hidden-identity`): zalogowany gość na widoku udostępnionej listy (`src/app/(app)/list/[token].tsx`) może zarezerwować prezent o statusie „Wolny”. Rezerwacja idzie przez istniejącą RPC `reserve_gift(p_gift_id)`, opakowaną w `src/lib/gifts.ts`. Po sukcesie lista jest odświeżana z bazy, a wyścig dwóch rezerwujących kończy się czytelnym komunikatem. Bez zmian schematu i bez nowych migracji.

Źródła: `context/foundation/roadmap.md` (S-04, lines 125–135), PRD: US-01, FR-009, FR-010; `supabase/migrations/20261005113900_initial_schema.sql:104–117`.

> **Ograniczenia zakresu:** bez Realtime, bez zmian w `supabase/`, bez nowych testów automatycznych. Weryfikacja: `npx tsc --noEmit`, `npx expo lint`, kontrole manualne oraz istniejący harness pgTAP bez regresji.

## Current State Analysis

- **RPC `reserve_gift`** (`supabase/migrations/20261005113900_initial_schema.sql:104–117`): `security definer`; sprawdza dostęp (właściciel lub członek przez `list_members`, `:107–112`); `update public.gifts set status = 'reserved' where id = p_gift_id and status = 'free'` (`:113`); przy braku zmienionego wiersza `raise exception 'gift is not free'` (`:114`); insert do `reservations` (`:115–116`). Grant tylko dla `authenticated` (`:137–138`).
- **Klient:** `src/lib/gifts.ts` ma `listGifts` (`:91–102`) i `addGift` (`:104–115`). Nie ma żadnego wywołania `reserve_gift`.
- **Lista gościa:** `openSharedList` (`src/lib/lists.ts:51–62`) mapuje wynik RPC do `GiftList` i odrzuca `owner_id`, którego widok potrzebuje do ukrycia akcji dla właściciela.
- **Komponent:** `GiftList` (`src/components/gift-list.tsx:22–41`) jest czysto prezentacyjny; `STATUS_LABELS` (`:8–12`) już zawiera „Wolny” i „Zarezerwowany”. Ten sam komponent renderuje widok właściciela (`src/app/(app)/index.tsx:105`), więc nie może dostać akcji domyślnie.
- **Widok gościa:** `src/app/(app)/list/[token].tsx` ładuje `openSharedList` → `listGifts` (`:34–53`) i renderuje `GiftList` bez akcji (`:80`). Błędy ładowania idą przez `FormError` (`:73`).
- **Prymityw:** `Button` (`src/components/ui/button.tsx:17–24`) obsługuje `loading`, `disabled`, `accessibilityLabel`.
- **Sesja:** `useSession()` (`src/lib/session.tsx:53`) daje `user.id` do porównania z `owner_id`.
- **Realtime:** publikacja `supabase_realtime` obejmuje `gifts` (`initial_schema.sql:141`), ale klient nie subskrybuje. Poza zakresem.

### Key Discoveries:

- Bramką wyścigu jest warunek `status = 'free'` w `update` po stronie bazy (`initial_schema.sql:113`). Klient nie może robić odczytu i zapisu w dwóch krokach.
- `raise exception` trafia do klienta jako `PostgrestError.message` z tekstem wyjątku (`gift is not free` / `no access to this list`). Kod SQLSTATE to ogólne `P0001`, więc rozróżnienie błędów odbywa się po treści komunikatu.
- Wzorzec błędu domenowego: `ListAlreadyExistsError` (`src/lib/lists.ts:10–15`), `throw` z klasy zamiast surowego komunikatu.
- Właściciel może wywołać RPC (`gl.owner_id = auth.uid()`, `initial_schema.sql:108–111`). Blokada jest tylko w UI (decyzja użytkownika).
- Brak Realtime w kliencie: status po rezerwacji odświeżamy przez ponowne `listGifts` (zgodnie z fallbackiem z roadmapy).

## What We're NOT Doing

- Zmian w RPC `reserve_gift` i nowej migracji (w tym blokady rezerwacji przez właściciela w bazie). Decyzja: ochrona tylko w UI; ryzyko w Open Risks.
- Subskrypcji Realtime i aktualizacji statusu „na żywo” dla innych gości. Status jest odświeżany przy własnej rezerwacji i przy ponownym otwarciu ekranu.
- Lokalnej mutacji stanu (ręczne ustawienie `status: 'reserved'`). Po sukcesie robimy refetch.
- Dialogu potwierdzenia i cofania rezerwacji (brak wymagania w roadmapie).
- Oznaczania jako zrealizowany (S-05) i usuwania z ochroną (S-06).
- Odczytu `reservations` i `reservation_status` w kliencie. Tożsamość rezerwującego pozostaje niewidoczna.
- Dopracowanej stylizacji (po domknięciu logiki, zgodnie z wymaganiem). Używamy istniejącego `Button` i tokenów.
- Nowych testów automatycznych klienta (brak runnera w projekcie).

## Implementation Approach

Warstwa danych w `src/lib/` owija RPC i mapuje błędy na klasy domenowe. `GiftList` dostaje opcjonalną akcję `onReserve`, a widok gościa łączy: ukrycie akcji dla właściciela, wywołanie RPC, stan zajętości i refetch. Widok nie importuje `supabase`. Atomowość rezerwacji zapewnia baza; klient jedynie pokazuje wynik.

Decyzje podjęte w rozmowie:
- Właściciel: akcja ukryta w UI, gdy `list.owner_id === user.id`.
- Change ID: `reserve-gift-hidden-identity` (folder przeniesiony z `guest-gift-reservation`, zgodnie z roadmapą).
- Po sukcesie i po błędzie „gift is not free” wykonywany jest refetch `listGifts(list.id)`.
- Podczas wywołania RPC wszystkie przyciski „Zarezerwuj” są zablokowane (`reservingId`).
- Komunikaty: wyścig → „Ten prezent został już zarezerwowany.”; brak dostępu → „Nie masz dostępu do tej listy.”; pozostałe → treść błędu.

Decyzje podjęte samodzielnie:
- Wywołanie RPC w `src/lib/gifts.ts` obok `listGifts`/`addGift`, bo to dane o prezentach.
- Osobny stan błędu rezerwacji, odrębny od błędu ładowania listy.

## Critical Implementation Details

- **Brak lokalnego ustawienia statusu przed potwierdzeniem:** status zmienia się w UI dopiero po refetchu z bazy. Inaczej interfejs pokaże rezerwację, której baza nie przyjęła.
- **Odświeżenie także w gałęzi wyścigu:** po `GiftAlreadyReservedError` lista musi zostać odświeżona, żeby użytkownik zobaczył aktualny status. Błąd rezerwacji nie może podmienić całej listy; użyj osobnego stanu, nie `error` z ładowania.
- **Mapowanie po treści:** `raise exception` zwraca `P0001`, więc wyścig od braku dostępu rozróżniamy po `error.message`.
- **Podwójne kliknięcie:** `disabled` na wszystkich przyciskach „Zarezerwuj” gdy `reservingId !== null`.
- **Typed routes:** nie dodajemy nowej trasy, więc nie trzeba regenerować `.expo/types/`.

---

## Phase 1: Data layer — reserve RPC wrapper and owner id

### Overview

Dodać wrapper RPC `reserve_gift` z mapowaniem błędów oraz zwracać `owner_id` z `openSharedList`. Bez UI.

### Changes Required:

#### 1. Reserve gift wrapper

**File**: `src/lib/gifts.ts`

**Intent**: Jedno miejsce wywołujące `reserve_gift` i tłumaczące komunikaty wyjątków bazy na błędy domenowe, tak jak `createList` robi to dla `23505`.

**Contract**: `export class GiftAlreadyReservedError extends Error` (wzorzec `ListAlreadyExistsError`, `src/lib/lists.ts:10–15`); `export async function reserveGift(giftId: string): Promise<void>` wywołuje `supabase.rpc('reserve_gift', { p_gift_id: giftId })`. Przy `error.message` zawierającym `gift is not free` rzuca `GiftAlreadyReservedError`; zawierającym `no access to this list` rzuca `new Error('Nie masz dostępu do tej listy.')`; inaczej `new Error(error.message)` (wzorzec `listGifts`, `:98–100`). Brak zwracanej wartości.

#### 2. Owner id from shared list

**File**: `src/lib/lists.ts`

**Intent**: Zachować `owner_id` zwrócony przez RPC `open_shared_list`, żeby widok mógł rozpoznać właściciela. `getMyList` i `createList` pozostają bez zmian.

**Contract**: `export type SharedGiftList = GiftList & { owner_id: string }`; `openSharedList(token: string): Promise<SharedGiftList>` zwraca dodatkowo `owner_id` (destrukturyzacja obok `id, name, share_token, created_at`, `:60–61`). Typ `GiftList` zostaje bez zmian.

### Success Criteria:

#### Automated Verification:

- `npx tsc --noEmit` przechodzi
- `npx expo lint` przechodzi
- `src/lib/gifts.ts` eksportuje `reserveGift` i `GiftAlreadyReservedError`
- `src/lib/lists.ts` eksportuje `SharedGiftList`, a `openSharedList` zwraca pole `owner_id`

---

## Phase 2: Gift list action slot

### Overview

Dodać do `GiftList` opcjonalną akcję „Zarezerwuj” widoczną tylko dla prezentów o statusie „Wolny”.

### Changes Required:

#### 1. Optional reserve action in the list

**File**: `src/components/gift-list.tsx`

**Intent**: Rozszerzyć komponent o opcjonalny callback i identyfikator prezentu w trakcie rezerwacji. Bez przekazanego callbacka lista zachowuje się jak dotychczas, więc widok właściciela nie zmienia się.

**Contract**: `GiftListProps` dostaje `onReserve?: (gift: Gift) => void` i `reservingId?: string | null`. Dla `gift.status === 'free'` i zdefiniowanego `onReserve` renderuje `Button` z `@/components/ui/button` (`label` „Zarezerwuj”, `accessibilityLabel` z nazwą prezentu, `loading` gdy `reservingId === gift.id`, `disabled` gdy `reservingId !== null`). Wiersz pozostaje w `ThemedView type="backgroundElement"`; kolory tylko przez komponenty i tokeny.

### Success Criteria:

#### Automated Verification:

- `npx tsc --noEmit` przechodzi
- `npx expo lint` przechodzi
- `src/components/gift-list.tsx` importuje `Button` z `@/components/ui/button` i przyjmuje `onReserve`, `reservingId`

#### Manual Verification:

- Ekran właściciela (`src/app/(app)/index.tsx`) nie pokazuje przycisku „Zarezerwuj” przy żadnym prezencie

---

## Phase 3: Guest view — reserve flow

### Overview

Podłączyć akcję w widoku gościa: ukryć ją dla właściciela, wywołać RPC, obsłużyć wyścig i odświeżyć listę.

### Changes Required:

#### 1. Guest route wiring

**File**: `src/app/(app)/list/[token].tsx`

**Intent**: Dodać obsługę rezerwacji do istniejącego ekranu gościa bez bezpośrednich wywołań Supabase. Akcja jest dostępna tylko dla nie-właściciela, a po każdej rezerwacji lista jest pobierana ponownie z bazy.

**Contract**:
- Typ stanu listy zmienia się na `SharedGiftList` (`src/lib/lists.ts`); import `reserveGift`, `GiftAlreadyReservedError` z `@/lib/gifts`; `useSession()` z `@/lib/session` daje `user`.
- `canReserve = list !== null && list.owner_id !== user?.id`.
- Stan `reservingId: string | null` i `reserveError: string | null` (osobno od `error` z ładowania); resetowany przy zmianie `token` w bloku `activeToken` (`:26–32`).
- Handler: ustawia `reservingId`, wywołuje `reserveGift(gift.id)`, następnie `listGifts(list.id)` → `setGifts`. W `catch`: dla `GiftAlreadyReservedError` ustawia komunikat „Ten prezent został już zarezerwowany.” i także odświeża listę; inne błędy → `error.message` w `reserveError`. W `finally` czyści `reservingId`.
- Przekazuje do `GiftList`: `onReserve={canReserve ? handleReserve : undefined}` i `reservingId`.
- Błąd rezerwacji pokazany przez `FormError` pod nagłówkiem listy (obok istniejącego błędu ładowania).

### Success Criteria:

#### Automated Verification:

- `npx tsc --noEmit` przechodzi
- `npx expo lint` przechodzi
- `src/app/(app)/list/[token].tsx` nie importuje `@/lib/supabase` ani `supabase` bezpośrednio

#### Manual Verification:

- Gość (konto inne niż właściciel) widzi „Zarezerwuj” przy wolnym prezencie; po kliknięciu status zmienia się na „Zarezerwowany” bez restartu aplikacji
- Komunikat „Ten prezent został już zarezerwowany.” pojawia się, gdy prezent zarezerwowano w międzyczasie z innego konta, a lista pokazuje aktualny status

---

## Phase 4: End-to-end verification

### Overview

Zweryfikować przepływ dwoma kontami, wyścig oraz brak wycieku tożsamości, a także brak regresji harnessu pgTAP.

### Changes Required:

#### 1. Verification pass

**File**: brak zmian w plikach (weryfikacja)

**Intent**: Potwierdzić, że całość działa razem: właściciel nie rezerwuje, gość rezerwuje, wyścig jest obsłużony, a tożsamość nie pojawia się w UI.

**Contract**: uruchomić `npx tsc --noEmit`, `npx expo lint`; przy działającym `supabase start` uruchomić `supabase test db` (pgTAP z F-01, bez zmian w testach). Scenariusze manualne na dwóch kontach i dwóch sesjach.

### Success Criteria:

#### Automated Verification:

- `npx tsc --noEmit` przechodzi na finalnym drzewie
- `npx expo lint` przechodzi na finalnym drzewie
- `supabase test db` przechodzi bez zmian w `supabase/tests/` (wymaga lokalnego `supabase start`)

#### Manual Verification:

- Właściciel otwiera własny link i nie widzi przycisku „Zarezerwuj”
- Dwa konta gości na tym samym wolnym prezencie: pierwsze kliknięcie rezerwuje, drugie kończy się komunikatem „Ten prezent został już zarezerwowany.” i listą z aktualnym statusem
- Podwójne szybkie kliknięcie „Zarezerwuj” wysyła jedno wywołanie RPC (przyciski zablokowane)
- Żaden widok (właściciel, gość, komunikaty) nie pokazuje tożsamości rezerwującego
- Konto bez członkostwa nie może zarezerwować prezentu (komunikat „Nie masz dostępu do tej listy.”)

---

## DoD (Definition of Done)

- `reserveGift` wywołuje RPC `reserve_gift` i mapuje wyjątki na `GiftAlreadyReservedError` lub czytelny komunikat (Faza 1).
- `openSharedList` zwraca `owner_id` (Faza 1).
- Akcja „Zarezerwuj” jest widoczna tylko przy statusie „Wolny”, tylko dla gościa, nie dla właściciela (Fazy 2–3).
- Po sukcesie status na liście to „Zarezerwowany” z bazy; wyścig obsłużony komunikatem i refetchem (Faza 3).
- Tożsamość rezerwującego nigdzie nie jest czytana ani pokazywana (Faza 4).
- `npx tsc --noEmit` i `npx expo lint` przechodzą; `supabase/` bez zmian.

## Risks

| # | Risk | Mitigation |
|---|------|-----------|
| 1 | Wyścig dwóch rezerwujących | Atomowy `update … where status = 'free'` w RPC; klient pokazuje wynik i odświeża listę (Faza 3–4). |
| 2 | Interfejs pokazuje rezerwację, której baza nie przyjęła | Brak lokalnej mutacji; status po refetchu z bazy (Faza 3). |
| 3 | Właściciel rezerwuje własny prezent | Akcja ukryta w UI (`owner_id !== user.id`); bez blokady w bazie (decyzja, Open Risks). |
| 4 | Podwójne wywołanie RPC przy szybkim kliknięciu | `reservingId` blokuje wszystkie przyciski podczas wywołania (Faza 2–3). |
| 5 | Błąd wyścigu przykrywa listę | Osobny stan `reserveError`; `error` z ładowania nietknięty (Faza 3). |
| 6 | Zmiana treści wyjątku w bazie łamie mapowanie | Mapowanie po fragmentach `gift is not free` / `no access to this list` z komentarzem-odniesieniem do migracji; kontrola manualna w Fazie 4. |

## Out of scope

- Migracje DB, zmiany w `reserve_gift`, zmiany RLS.
- Realtime i odświeżanie statusów na żywo.
- Oznaczanie jako zrealizowany (S-05), usuwanie z ochroną (S-06).
- Testy automatyczne klienta, E2E, CI.

## Open risks & assumptions

- **Ochrona przed rezerwacją przez właściciela działa tylko w UI.** RPC nadal przyjmie takie wywołanie (np. bezpośrednio przez API). Domknięcie wymaga osobnej migracji forward-only; zaakceptowane na tym etapie.
- **Status widoczny dla innych gości po ponownym otwarciu ekranu.** Brak subskrypcji Realtime; zgodne z fallbackiem z roadmapy. Pełna natychmiastowość dla wszystkich przeglądających wymaga osobnego kroku.
- **Mapowanie wyjątków po treści.** Zmiana treści `raise exception` w bazie wymaga aktualizacji `src/lib/gifts.ts`.
- **Zakładamy, że `open_shared_list` zwraca `owner_id`** (zwraca cały wiersz `gifts_lists`, `initial_schema.sql:101`).

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Data layer — reserve RPC wrapper and owner id

#### Automated
- [x] 1.1 `npx tsc --noEmit` passes — 86fb86b
- [x] 1.2 `npx expo lint` passes — 86fb86b
- [x] 1.3 `src/lib/gifts.ts` exports `reserveGift` and `GiftAlreadyReservedError` — 86fb86b
- [x] 1.4 `src/lib/lists.ts` exports `SharedGiftList` and `openSharedList` returns `owner_id` — 86fb86b

### Phase 2: Gift list action slot

#### Automated
- [x] 2.1 `npx tsc --noEmit` passes
- [x] 2.2 `npx expo lint` passes
- [x] 2.3 `src/components/gift-list.tsx` imports `Button` and accepts `onReserve`, `reservingId`

#### Manual
- [x] 2.4 Owner screen (`src/app/(app)/index.tsx`) shows no “Zarezerwuj” button

### Phase 3: Guest view — reserve flow

#### Automated
- [ ] 3.1 `npx tsc --noEmit` passes
- [ ] 3.2 `npx expo lint` passes
- [ ] 3.3 `src/app/(app)/list/[token].tsx` does not import `supabase` directly

#### Manual
- [ ] 3.4 Guest (non-owner) sees “Zarezerwuj” on a free gift; after tap status becomes “Zarezerwowany” without app restart
- [ ] 3.5 Race: “Ten prezent został już zarezerwowany.” appears and the list shows the current status

### Phase 4: End-to-end verification

#### Automated
- [ ] 4.1 `npx tsc --noEmit` passes on the final tree
- [ ] 4.2 `npx expo lint` passes on the final tree
- [ ] 4.3 `supabase test db` passes without changes to `supabase/tests/` (requires `supabase start`)

#### Manual
- [ ] 4.4 Owner opening own link sees no “Zarezerwuj” button
- [ ] 4.5 Two guest accounts on one free gift: second attempt shows the conflict message and refreshed status
- [ ] 4.6 Rapid double tap on “Zarezerwuj” sends one RPC call
- [ ] 4.7 No view (owner, guest, messages) shows the reserver identity
- [ ] 4.8 Account without membership gets “Nie masz dostępu do tej listy.”

## References

- Roadmap: `context/foundation/roadmap.md` (S-04 lines 125–135)
- PRD: `context/foundation/prd.md` (US-01, FR-009, FR-010)
- Schema/RPC: `supabase/migrations/20261005113900_initial_schema.sql:104–117, 137–138, 141`
- Previous slice: `context/archive/2026-11-02-share-link-and-guest-access/plan.md`
- Client: `src/lib/gifts.ts:91–115`, `src/lib/lists.ts:10–15, 51–62`, `src/components/gift-list.tsx:22–41`, `src/components/ui/button.tsx:17–24`, `src/lib/session.tsx:53`
