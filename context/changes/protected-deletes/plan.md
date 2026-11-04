# Protected Deletes — Implementation Plan

## Overview

Dostarczyć S-06 (roadmap: `context/foundation/roadmap.md`, Change ID `protected-deletes`, PRD: FR-004 i FR-006): Życzący może usunąć prezent tylko wtedy, gdy jest wolny, a całą listę tylko wtedy, gdy żaden prezent na niej nie ma rezerwacji. Guardy istnieją już w bazie jako polityki RLS — ta zmiana dodaje warstwę klienta, która je wywołuje, wykrywa odmowę i pokazuje ją użytkownikowi.

Źródła: `context/foundation/prd.md` (FR-004, FR-006, Business Logic, Non-Goals); `supabase/migrations/20261005113900_initial_schema.sql:57–60, 75–77`.

> **Ograniczenia zakresu:** bez zmian w `supabase/` i bez migracji, bez testów pgTAP, bez Realtime. Weryfikacja: `npx tsc --noEmit`, `npx expo lint`, kontrole manualne.

## Current State Analysis

- **Baza już egzekwuje oba warunki.** `delete_lists` (`initial_schema.sql:57–60`) pozwala właścicielowi usunąć listę tylko gdy `not exists` żadnej rezerwacji na jej prezentach (FR-004). `delete_gifts` (`:75–77`) pozwala właścicielowi usunąć prezent tylko gdy `status = 'free'` (FR-006). `on delete cascade` (`:15, :27, :35`) usuwa prezenty i rezerwacje razem z listą.
- **Klient nie ma żadnej funkcji usuwania.** `src/lib/gifts.ts` i `src/lib/lists.ts` mają tylko odczyt i tworzenie. `grep` po `src/` nie znajduje `delete`.
- **Ekran właściciela** (`src/app/(app)/index.tsx:105`) renderuje `<GiftList gifts={gifts} />` bez callbacków; po usunięciu listy `list === null`, więc ekran naturalnie pokazuje `CreateListForm` (`:108–110`).
- **Widok gościa** (`src/app/(app)/list/[token].tsx:168–175`) korzysta z tego samego `GiftList`. Nowe props są opcjonalne, więc gość nie dostanie akcji bez dodatkowej bramki.

### Key Discoveries:

- **PostgREST nie zwraca błędu, gdy RLS odfiltruje DELETE.** Odmowa daje sukces z zerem zmienionych wierszy. Wrapper musi użyć `.select('id')` po `.delete()` i potraktować pustą tablicę jako odmowę — inaczej UI pokaże sukces przy braku efektu.
- **`GiftList` jest współdzielony przez właściciela i gościa.** Akcja usuwania musi być opcjonalna i przekazywana wyłącznie z ekranu właściciela.
- **`Button` (`src/components/ui/button.tsx:8–15`) nie ma wariantu.** Akcja destrukcyjna w kolorze `primary` jest myląca; potrzebny jest wariant `destructive` oparty o token `theme.destructive`, bez literałów kolorów (AGENTS.md).
- **`Alert.alert` na React Native Web bywa no-op** — dlatego potwierdzenie jest inline w tym samym wierszu/nagłówku, nie modalem.

## Desired End State

Właściciel widzi przy wolnym prezencie przycisk „Usuń”, a przy zarezerwowanym i zrealizowanym — nie widzi go wcale. Po kliknięciu „Usuń” pojawia się „Potwierdź”/„Anuluj”; potwierdzenie usuwa prezent i odświeża listę z bazy. W nagłówku ekranu właściciela jest „Usuń listę”; przy liście z rezerwacją próba kończy się komunikatem odmowy, przy liście bez rezerwacji ekran wraca do formularza tworzenia listy. Gość i widok gościa nie mają żadnej z tych akcji.

## What We're NOT Doing

- Zmian w `supabase/`, nowych migracji, RPC ani polityk RLS — guardy już istnieją i są źródłem prawdy.
- Usuwania listy przez gościa lub członka listy — tylko właściciel (RLS i UI).
- Cofnięcia usunięcia (undo), kosza ani soft-delete.
- Natywnego modala potwierdzenia (`Alert`) — decyzja: inline two-step.
- Nowych testów pgTAP lub testów automatycznych klienta — decyzja użytkownika: kontrole manualne.
- Realtime i odświeżania u innych przeglądających.

## Implementation Approach

Warstwa danych w `src/lib/gifts.ts` i `src/lib/lists.ts` owija DELETE i tłumaczy „zero usuniętych wierszy” na błąd domenowy. `GiftList` dostaje opcjonalną akcję usunięcia z wewnętrznym stanem potwierdzenia; ekran właściciela przekazuje callback i refetchem synchronizuje listę. Akcja usunięcia listy siedzi w nagłówku ekranu właściciela, a po sukcesie czyści stan, co samo w sobie przywraca `CreateListForm`.

Decyzje podjęte w rozmowie:
- Potwierdzenie: inline two-step (bez modala, działa też na web).
- Miejsce akcji „Usuń listę”: nagłówek ekranu właściciela.
- Weryfikacja: `tsc`, `lint`, scenariusze manualne; bez pgTAP.

Decyzje podjęte samodzielnie:
- Osobne klasy błędów `GiftNotDeletableError` i `ListHasReservationsError`, wzorem `GiftAlreadyReservedError`.
- Wariant `destructive` w `Button` zamiast lokalnych stylów — jedno miejsce, pokryte przez `src/app/dev/ui-states.tsx`.
- Stan potwierdzenia trzymany w `GiftList` (per wiersz), a dla listy w ekranie właściciela.

## Critical Implementation Details

- **Odmowa RLS to pusty wynik, nie błąd.** Po `.delete().eq(...)` trzeba dołożyć `.select('id')` i sprawdzić długość tablicy; bez tego usunięcie zarezerwowanego prezentu wygląda jak sukces.
- **Potwierdzenie musi się resetować.** `confirmingId` czyści się po anulowaniu, po wysłaniu akcji i gdy zmieni się zbiór prezentów, żeby nie zostawało „uzbrojone” na innym wierszu.
- **Widok właściciela nie może dostać akcji gościa i odwrotnie.** Gość nie dostaje `onDelete`, właściciel nie dostaje `onMarkPurchased`.

---

## Phase 1: Data layer — delete gift and delete list

### Overview

Dodać wrappery `deleteGift` i `deleteList`, które rozpoznają odmowę RLS i tłumaczą ją na błąd domenowy. Bez UI.

### Changes Required:

#### 1. Gift delete wrapper

**File**: `src/lib/gifts.ts`

**Intent**: Jedno miejsce usuwające prezent i odróżniające odmowę (prezent nie jest wolny) od błędu transportu. Wzorzec: `reserveGift` + `GiftAlreadyReservedError`.

**Contract**: `export class GiftNotDeletableError extends Error` z komunikatem „Nie można usunąć zarezerwowanego lub zrealizowanego prezentu.” i `name` ustawionym jak w istniejących klasach. `export async function deleteGift(giftId: string): Promise<void>` wykonuje `supabase.from('gifts').delete().eq('id', giftId).select('id')`; `error` → `new Error(error.message)`; pusta/brakująca tablica → `GiftNotDeletableError`.

#### 2. List delete wrapper

**File**: `src/lib/lists.ts`

**Intent**: Analogiczne usunięcie listy z rozpoznaniem odmowy, gdy istnieje jakakolwiek rezerwacja.

**Contract**: `export class ListHasReservationsError extends Error` z komunikatem „Nie można usunąć listy, która ma zarezerwowane lub zrealizowane prezenty.” `export async function deleteList(listId: string): Promise<void>` wykonuje `supabase.from('gifts_lists').delete().eq('id', listId).select('id')`; `error` → `new Error(error.message)`; pusty wynik → `ListHasReservationsError`.

### Success Criteria:

#### Automated Verification:

- `npx tsc --noEmit` przechodzi
- `npx expo lint` przechodzi
- `src/lib/gifts.ts` eksportuje `deleteGift` i `GiftNotDeletableError`, a `src/lib/lists.ts` eksportuje `deleteList` i `ListHasReservationsError`

---

## Phase 2: Gift delete action with inline confirm

### Overview

Dodać do `Button` wariant `destructive`, do `GiftList` opcjonalną akcję usunięcia z potwierdzeniem inline, a na ekranie właściciela podłączyć handler z refetchem.

### Changes Required:

#### 1. Destructive button variant

**File**: `src/components/ui/button.tsx`

**Intent**: Umożliwić wizualne odróżnienie akcji niszczącej bez literałów kolorów i bez lokalnych stylów w widokach.

**Contract**: `ButtonProps` dostaje `variant?: 'primary' | 'destructive'` (domyślnie `'primary'`). Wariant `destructive` używa `theme.destructive` jako tła; tekst pozostaje `themeColor="onPrimary"`. Wariant jest pokryty przez `src/app/dev/ui-states.tsx` w nowej sekcji „destructive”.

#### 2. Gift row delete with inline confirm

**File**: `src/components/gift-list.tsx`

**Intent**: Pokazać „Usuń” wyłącznie przy wolnym prezencie, gdy właściciel przekazał callback, i wymagać drugiego kliknięcia przed wysłaniem akcji.

**Contract**: `GiftListProps` dostaje `onDelete?: (gift: Gift) => void` i `deletingId?: string | null`. Komponent trzyma `confirmingId: string | null`. Akcja renderuje się tylko gdy `gift.status === 'free' && onDelete`. Pierwszy klik ustawia `confirmingId`; wtedy wiersz pokazuje `Button` wariantu `destructive` z etykietą „Potwierdź” (`accessibilityLabel` `Potwierdź usunięcie: <nazwa>`) oraz `Button` „Anuluj” czyszczący stan. `loading` gdy `deletingId === gift.id`, `disabled` gdy `deletingId !== null`. `confirmingId` czyści się po anulowaniu, po wywołaniu `onDelete` i gdy `confirmingId` nie wskazuje już wolnego prezentu z listy.

#### 3. Owner screen wiring

**File**: `src/app/(app)/index.tsx`

**Intent**: Podłączyć usuwanie prezentu do ekranu właściciela i odświeżać listę z bazy po sukcesie.

**Contract**: Stan `deletingId: string | null` i `giftDeleteError: string | null`. `handleDeleteGift(gift)` ustawia `deletingId`, czyści błąd, wywołuje `deleteGift(gift.id)`, po sukcesie pobiera `listGifts(list.id)` i ustawia `gifts`. W `catch` ustawia `giftDeleteError` komunikatem z `GiftNotDeletableError` lub `error.message`. W `finally` czyści `deletingId`. Błąd renderowany przez `FormError` obok istniejącego `error`. `GiftList` dostaje `onDelete={handleDeleteGift}` i `deletingId`.

#### 4. Visual gate for the new variant

**File**: `src/app/dev/ui-states.tsx`

**Intent**: Utrzymać dev-route jako gate dla primitywów.

**Contract**: Nowa sekcja `Section label="destructive"` z `Button variant="destructive"` w stanach default i disabled.

### Success Criteria:

#### Automated Verification:

- `npx tsc --noEmit` przechodzi
- `npx expo lint` przechodzi
- `src/components/ui/button.tsx` przyjmuje `variant`, a `src/components/gift-list.tsx` przyjmuje `onDelete` i `deletingId`

#### Manual Verification:

- Wolny prezent ma przycisk „Usuń”; klik pokazuje „Potwierdź”/„Anuluj”; „Anuluj” przywraca stan bez usunięcia
- Potwierdzenie usuwa prezent, a lista odświeża się bez restartu aplikacji
- Zarezerwowany i zrealizowany prezent nie mają przycisku „Usuń”
- Widok gościa (`src/app/(app)/list/[token].tsx`) nie pokazuje żadnej akcji usuwania

---

## Phase 3: Delete list action in owner header

### Overview

Dodać dwustopniowe usunięcie całej listy w nagłówku ekranu właściciela, z obsługą odmowy i powrotem do formularza tworzenia listy.

### Changes Required:

#### 1. Header delete action

**File**: `src/app/(app)/index.tsx`

**Intent**: Pozwolić właścicielowi usunąć listę, ale pokazać odmowę z wyjaśnieniem, gdy cokolwiek jest zarezerwowane.

**Contract**: Stan `confirmingListDelete: boolean`, `deletingList: boolean` i `listDeleteError: string | null`. W nagłówku, obok „Wyloguj”, akcja tekstowa „Usuń listę” (`Pressable` + `ThemedText`, `themeColor` destrukcyjny); po kliknięciu zastępowana przez „Potwierdź” i „Anuluj”. Potwierdzenie wywołuje `deleteList(list.id)`; sukces → `setList(null)`, `setGifts([])`, reset stanów potwierdzenia (ekran pokaże `CreateListForm`). `ListHasReservationsError` → komunikat klasy w `FormError`; inne błędy → `error.message`. Wszystkie stany czyszczone przy anulowaniu i przy zmianie listy.

### Success Criteria:

#### Automated Verification:

- `npx tsc --noEmit` przechodzi
- `npx expo lint` przechodzi
- `src/app/(app)/index.tsx` eksportuje ekran, który wywołuje `deleteList` wyłącznie z akcji właściciela

#### Manual Verification:

- Lista bez rezerwacji: „Usuń listę” → „Potwierdź” usuwa listę i pokazuje formularz tworzenia listy
- Lista z co najmniej jedną rezerwacją: próba usunięcia pokazuje „Nie można usunąć listy, która ma zarezerwowane lub zrealizowane prezenty.”, a lista zostaje
- „Anuluj” zamyka potwierdzenie bez żadnej zmiany

---

## Phase 4: End-to-end verification

### Overview

Zweryfikować oba przepływy na koncie właściciela i gościa, potwierdzić brak regresji S-04/S-05 i brak zmian w `supabase/`.

### Changes Required:

#### 1. Verification pass

**File**: brak zmian w plikach (weryfikacja)

**Intent**: Potwierdzić, że guardy działają end-to-end i że żaden widok gościa nie dostał akcji usuwania.

**Contract**: uruchomić `npx tsc --noEmit`, `npx expo lint` oraz `git diff --stat -- supabase/` na finalnym drzewie. Scenariusze manualne na koncie właściciela i gościa.

### Success Criteria:

#### Automated Verification:

- `npx tsc --noEmit` przechodzi na finalnym drzewie
- `npx expo lint` przechodzi na finalnym drzewie
- `supabase/` bez zmian (`git diff --stat -- supabase/` pusty)

#### Manual Verification:

- Właściciel usuwa wolny prezent; znika z listy po odświeżeniu z bazy
- Właściciel nie może usunąć zarezerwowanego ani zrealizowanego prezentu — brak przycisku
- Właściciel usuwa listę bez rezerwacji i wraca do formularza tworzenia listy
- Właściciel nie może usunąć listy z rezerwacją — widzi komunikat odmowy
- Gość nie widzi żadnej akcji usuwania w widoku listy
- S-04 i S-05 nadal działają: rezerwacja, oznaczenie jako kupiony i komunikaty bez regresji

---

## DoD (Definition of Done)

- `deleteGift` i `deleteList` wywołują DELETE i tłumaczą odmowę RLS na błąd domenowy (Faza 1).
- „Usuń” widoczne tylko przy wolnym prezencie i tylko dla właściciela; potwierdzenie inline (Faza 2).
- „Usuń listę” w nagłówku właściciela, odmowa z komunikatem przy rezerwacji (Faza 3).
- Po usunięciu listy ekran wraca do `CreateListForm`; po usunięciu prezentu lista jest odświeżona z bazy.
- `npx tsc --noEmit` i `npx expo lint` przechodzą; `supabase/` bez zmian.

## Risks

| # | Risk | Mitigation |
|---|------|------------|
| 1 | RLS odmawia, a klient raportuje sukces | `.select('id')` po DELETE i pusty wynik traktowany jako odmowa (Faza 1) |
| 2 | Akcja usuwania wycieka do widoku gościa | `onDelete` przekazywany wyłącznie z ekranu właściciela; `GiftList` renderuje akcję tylko gdy callback istnieje (Faza 2) |
| 3 | Przypadkowe usunięcie danych | Dwustopniowe potwierdzenie inline; brak akcji przy statusach innych niż `free` (Fazy 2–3) |
| 4 | Stan potwierdzenia „uzbrojony” po odświeżeniu | `confirmingId` czyszczony po akcji, anulowaniu i zmianie zbioru prezentów (Faza 2) |
| 5 | Usunięcie listy nie odświeża ekranu | Po sukcesie `setList(null)` i `setGifts([])`, co prowadzi do `CreateListForm` (Faza 3) |

## Out of scope

- Zmiany w `supabase/`, RPC, RLS i migracje.
- Testy pgTAP i testy automatyczne klienta.
- Undo, kosz, soft-delete.
- Realtime i odświeżanie u innych przeglądających.

## Open risks & assumptions

- **Guardy są wyłącznie w RLS.** Jeśli polityki zmienią się w bazie, klient nadal pokaże przycisk, ale dostanie odmowę — komunikat pozostaje poprawny.
- **Brak automatycznej ochrony FR-004/FR-006.** Decyzja użytkownika: kontrole manualne; pgTAP może wejść jako osobna zmiana.
- **`delete_gifts` wymaga `status = 'free'`, więc prezent „zrealizowany” jest trwale nieusuwalny z UI.** Zgodne z FR-006; ewentualne czyszczenie danych to osobna decyzja.

## References

- Roadmap: `context/foundation/roadmap.md` (S-06)
- PRD: `context/foundation/prd.md` (FR-004, FR-006, Business Logic)
- RLS: `supabase/migrations/20261005113900_initial_schema.sql:57–60, 75–77`, cascade `:15, :27, :35`
- Wzorce klienta: `src/lib/gifts.ts:131–154`, `src/lib/lists.ts:53–64`
- UI: `src/components/gift-list.tsx:19–64`, `src/components/ui/button.tsx:8–54`, `src/app/(app)/index.tsx:79–110`
- Poprzednie slice'y: `context/changes/mark-gift-purchased/plan.md`, `context/archive/2026-11-02-reserve-gift-hidden-identity/plan.md`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Data layer — delete gift and delete list

#### Automated
- [x] 1.1 `npx tsc --noEmit` passes — 523b8d3
- [x] 1.2 `npx expo lint` passes — 523b8d3
- [x] 1.3 `src/lib/gifts.ts` exports `deleteGift` and `GiftNotDeletableError`; `src/lib/lists.ts` exports `deleteList` and `ListHasReservationsError` — 523b8d3

### Phase 2: Gift delete action with inline confirm

#### Automated
- [x] 2.1 `npx tsc --noEmit` passes — 888acd1
- [x] 2.2 `npx expo lint` passes — 888acd1
- [x] 2.3 `src/components/ui/button.tsx` accepts `variant`; `src/components/gift-list.tsx` accepts `onDelete` and `deletingId` — 888acd1

#### Manual
- [x] 2.4 Free gift shows “Usuń”; tap reveals “Potwierdź”/“Anuluj”; cancel restores state — 888acd1
- [x] 2.5 Confirming removes the gift and the list refreshes without an app restart — 888acd1
- [x] 2.6 Reserved and purchased gifts show no delete action — 888acd1
- [x] 2.7 Guest view shows no delete action at all — 888acd1

### Phase 3: Delete list action in owner header

#### Automated
- [x] 3.1 `npx tsc --noEmit` passes
- [x] 3.2 `npx expo lint` passes
- [x] 3.3 `src/app/(app)/index.tsx` calls `deleteList` only from the owner action

#### Manual
- [x] 3.4 List without reservations: “Usuń listę” → “Potwierdź” deletes it and shows the create-list form
- [x] 3.5 List with a reservation: attempt shows “Nie można usunąć listy, która ma zarezerwowane lub zrealizowane prezenty.” and the list remains
- [x] 3.6 “Anuluj” closes the confirmation without any change

### Phase 4: End-to-end verification

#### Automated
- [x] 4.1 `npx tsc --noEmit` passes on the final tree
- [x] 4.2 `npx expo lint` passes on the final tree
- [x] 4.3 `supabase/` has no changes (`git diff --stat -- supabase/` empty)

#### Manual
- [x] 4.4 Owner deletes a free gift; it disappears after the refetch
- [x] 4.5 Owner cannot delete reserved or purchased gifts — no button
- [x] 4.6 Owner deletes a list without reservations and returns to the create-list form
- [x] 4.7 Owner cannot delete a list with a reservation — refusal message shown
- [x] 4.8 Guest sees no delete actions
- [x] 4.9 S-04 and S-05 still work: reserve and mark-purchased flows unregressed
