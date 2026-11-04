# Gift editing: edycja wolnego prezentu Implementation Plan

## Overview

Życzący może edytować nazwę, link, cenę i opcjonalny URL zdjęcia prezentu,
dopóki prezent jest wolny. Prezent z rezerwacją (`reserved`, `purchased`) lub
z wierszem w `reservations` jest nieedytowalny. Decyzja produktowa i
architektoniczna: `docs/adr-002-gift-editing.md`; wymaganie: FR-012 w
`context/foundation/prd.md`.

Reguła jest egzekwowana trójwarstwowo: UI nie pokazuje akcji edycji dla
zablokowanych prezentów, `updateGift` odrzuca taki zapis przed wysłaniem, a
polityka RLS `update_gifts` odrzuca go także przy bezpośrednim wywołaniu
PostgREST/SQL. Dzięki temu wyścig „odczyt statusu → update" nie omija guardu.

Zmiana dotyka `src/lib/gifts.ts`, UI właściciela, nowej migracji naprawczej
`supabase/migrations/20261104120000_gift_editing_guard.sql`, testów Vitest oraz
pgTAP. Nie zmienia cyklu życia statusu: `NewGift` nie zawiera pola `status`.

## Current State Analysis

- `update_gifts` (`supabase/migrations/20261005113900_initial_schema.sql:72`)
  sprawdzał wyłącznie własność listy, więc właściciel mógł zmodyfikować prezent
  już zarezerwowany lub zrealizowany — luka Risk #4.
- `reserve_gift` ustawia `status = 'reserved'` i tworzy wiersz w
  `reservations`; `mark_gift_purchased` ustawia `status = 'purchased'`. Oba
  stany muszą blokować edycję.
- Warstwa klienta miała już `parseGiftInput` i `NewGift`, ale brakowało
  `updateGift` i błędu domenowego dla odmowy.
- `deleteGift`/`deleteList` korzystają z istniejących guardów RLS; edycja
  wymagała analogicznego, ale ostrzejszego warunku (także brak rezerwacji).
- Brak testu pgTAP dla `update_gifts`; Risk #4 był pokryty tylko klientem.

### Key Discoveries:

- `status IS DISTINCT FROM 'reserved'` jest konieczne, ale niewystarczające:
  niespójny wiersz `free` z rezerwacją nadal musi być zablokowany, dlatego
  polityka zawiera `NOT EXISTS (select 1 from reservations ...)`.
- Guard w `WITH CHECK` jest potrzebny, żeby update nie mógł „przemycić"
  statusu `reserved` na wolny prezent.
- `GiftNotEditableError` jest wspólnym kontraktem dla formularza i testów
  jednostkowych; UI pokazuje jego komunikat bez własnej logiki biznesowej.
- Brak anulowania rezerwacji w MVP oznacza, że blokada po rezerwacji jest
  trwała do czasu dodania osobnej funkcji.

## Desired End State

- Właściciel widzi akcję „Edytuj" tylko przy wolnych prezentach, zarówno na
  dashboardzie, jak i w widoku udostępnionego linku.
- Zapis wolnego prezentu aktualizuje listę bez przeładowania aplikacji.
- Próba edycji `reserved`/`purchased` kończy się `GiftNotEditableError` w
  kliencie i odrzuceniem przez RLS w bazie.
- `npm test`, `npx tsc --noEmit`, `npx expo lint` i `npx supabase test db`
  przechodzą; pgTAP pokrywa reserved, purchased, free-with-reservation oraz
  `WITH CHECK`.
- Roadmapa S-07 i milestone są `done`, test plan Risk #4 jest zamknięty.

## What We're NOT Doing

- Anulowania rezerwacji i ponownej edycji po anulowaniu.
- Edycji statusu, soft-delete, kosza i historii zmian.
- Edycji prezentów przez gościa lub członka listy.
- Uploadu zdjęć — nadal tylko opcjonalny URL.
- E2E i zmian w CI (CI pozostaje odroczone w roadmapie).
- Zmian w już wypchniętej migracji inicjalnej — repair jest forward-only.

## Implementation Approach

Najpierw guard w warstwie danych i testy jednostkowe (szybka pętla), potem
forward-only repair polityki RLS, następnie UI właściciela na obu ekranach.
Na końcu dokumentacja (ADR/PRD/roadmap/test-plan) i pgTAP, który dowodzi
działania polityki niezależnie od klienta. UI korzysta wyłącznie z tokenów z
`src/constants/theme.ts` i istniejących primitives.

## Phase 1: Warstwa danych — updateGift i guard

### Overview

Dodać `updateGift`, błąd `GiftNotEditableError` i testy jednostkowe Vitest.

### Changes Required:

#### 1. Guard w `src/lib/gifts.ts`

**Intent:** Sprawdzić status i brak rezerwacji przed `update`; sam `update`
dodatkowo zawiera `eq('status', 'free')` jako drugi warunek. Brak danych lub
błąd RLS mapować na `GiftNotEditableError`.

**Contract:** `updateGift(giftId, NewGift)` zwraca zaktualizowany `Gift`;
rzuca `GiftNotEditableError` dla `reserved`, `purchased`, istniejącej
rezerwacji albo zerowego wyniku update.

#### 2. Testy jednostkowe

**Intent:** Pokryć odmowę dla `reserved`, `purchased`, `free` z rezerwacją
oraz happy path dla wolnego prezentu.

**File:** `src/lib/gifts.test.ts`

### Success Criteria:

#### Automated Verification:

- `npm test` — wszystkie testy zielone.
- `npx tsc --noEmit` — brak błędów typów.

## Phase 2: Guard RLS — update_gifts

### Overview

Naprawić politykę `update_gifts` tak, aby reguła była źródłem prawdy w bazie.

### Changes Required:

#### 1. Migracja forward-only

**File:** `supabase/migrations/20261104120000_gift_editing_guard.sql`

**Intent:** `ALTER POLICY update_gifts` z warunkami własności listy, braku
statusu `reserved` i braku wiersza w `reservations`, zarówno w `USING`, jak i
`WITH CHECK`.

**Contract:** Właściciel może zaktualizować wolny prezent bez rezerwacji;
każdy inny wariant kończy się zerem wierszy (USING) albo `42501` (WITH CHECK).
Migracja jest idempotentna względem definicji polityki i nie edytuje
wcześniejszych migracji.

### Success Criteria:

#### Automated Verification:

- `npx supabase test db` — nowy plik pgTAP przechodzi.
- Polityka istnieje i ma oba warunki (`USING` + `WITH CHECK`).

## Phase 3: UI edycji

### Overview

Dodać formularz edycji i akcję na karcie prezentu, tylko dla właściciela i
tylko dla wolnych prezentów.

### Changes Required:

#### 1. Formularz i karta

**Files:** `src/components/edit-gift-form.tsx`, `src/components/gift-card.tsx`,
`src/components/gift-placeholder.tsx`, `src/components/ui/icon-button.tsx`,
`src/components/gift-list.tsx`

**Intent:** Formularz reużywa `parseGiftInput` i `updateGift`; karta pokazuje
akcję edycji obok usuwania i statusu, a siatka dostosowuje liczbę kolumn do
szerokości.

#### 2. Ekrany właściciela

**Files:** `src/app/(app)/index.tsx`, `src/app/(app)/list/[token].tsx`

**Intent:** Po zapisie podmienić prezent w stanie bez refetchu; wejście w
edycję przewija do formularza. W widoku linku akcja jest dostępna tylko, gdy
`list.owner_id === user.id`.

#### 3. Tokeny i stany UI

**Files:** `src/constants/theme.ts`, `src/app/dev/ui-states.tsx`

**Intent:** Dodać role kolorów statusów, tła zdjęcia i powierzchni
destrukcyjnej oraz próbki kart w dev route.

### Success Criteria:

#### Automated Verification:

- `npx tsc --noEmit` i `npx expo lint` przechodzą.
- Dev route `src/app/dev/ui-states.tsx` renderuje kartę bez błędów.

#### Manual Verification:

- Edycja wolnego prezentu z dashboardu i z udostępnionego linku działa.
- Brak akcji edycji dla `reserved`/`purchased` i dla gościa.

## Phase 4: Dokumentacja, pgTAP i domknięcie

### Overview

Zapisać decyzję i wymaganie, dodać test integracyjny oraz zamknąć roadmapę i
test plan.

### Changes Required:

#### 1. ADR i PRD

**Files:** `docs/adr-002-gift-editing.md`, `context/foundation/prd.md`

**Intent:** ADR-002 opisuje kontekst, decyzję i konsekwencje; PRD przenosi
edycję z Non-Goals do FR-012 i doprecyzowuje Business Logic.

#### 2. Test pgTAP

**File:** `supabase/tests/gift_editing_guard.test.sql`

**Intent:** Osiem asercji: sanity roli, happy path, odmowa dla `reserved`,
`purchased` i `free` z rezerwacją, `WITH CHECK` dla przemycenia statusu,
odmowa dla członka listy oraz brak zmian w danych po odmowie.

#### 3. Roadmapa i test plan

**Files:** `context/foundation/roadmap.md`,
`context/foundation/test-plan.md`

**Intent:** S-07 i milestone `done`; Risk #4 w pełni pokryty; fazy rollout
testów oznaczone `complete`; cookbook §6.5 wskazuje nowy plik.

### Success Criteria:

#### Automated Verification:

- `npm test`, `npx tsc --noEmit`, `npx expo lint` przechodzą.
- `npx supabase test db` uruchamia `gift_editing_guard.test.sql` i raportuje
  `Result: PASS`.

#### Manual Verification:

- Roadmapa nie ma otwartych elementów, a test plan nie ma `not started` w
  fazach 1–4.

## DoD (Definition of Done)

- [x] `updateGift` i `GiftNotEditableError` istnieją oraz mają testy Vitest.
- [x] Migracja RLS `update_gifts` zawiera `USING` i `WITH CHECK`.
- [x] UI edycji działa na dashboardzie i w widoku właściciela linku.
- [x] Test pgTAP pokrywa Risk #4 na poziomie bazy.
- [x] ADR-002, FR-012, S-07, milestone i test plan są spójne.
- [x] `npm test`, `npx tsc --noEmit` i `npx expo lint` są zielone.

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Do not rename step titles.

### Phase 1: Warstwa danych — updateGift i guard

#### Automated

- [x] 1.1 `updateGift` sprawdza status i brak rezerwacji przed update
- [x] 1.2 `GiftNotEditableError` mapuje każdą odmowę na wspólny komunikat
- [x] 1.3 `src/lib/gifts.test.ts` pokrywa reserved, purchased, free-with-reservation i happy path

### Phase 2: Guard RLS — update_gifts

#### Automated

- [x] 2.1 Migracja `20261104120000_gift_editing_guard.sql` istnieje i jest forward-only
- [x] 2.2 Polityka `update_gifts` ma warunki własności, statusu i braku rezerwacji w `USING`
- [x] 2.3 Polityka `update_gifts` powtarza warunki w `WITH CHECK`

### Phase 3: UI edycji

#### Automated

- [x] 3.1 `EditGiftForm` reużywa `parseGiftInput` i `updateGift`
- [x] 3.2 `GiftCard`/`GiftList` pokazują edycję tylko dla wolnych prezentów
- [x] 3.3 Dashboard i widok linku podmieniają prezent w stanie po zapisie
- [x] 3.4 Tokeny motywu i próbki w `src/app/dev/ui-states.tsx` są dodane

#### Manual

- [x] 3.5 Edycja z dashboardu i z linku właściciela działa; gość nie widzi akcji

### Phase 4: Dokumentacja, pgTAP i domknięcie

#### Automated

- [x] 4.1 ADR-002 zapisany, PRD zawiera FR-012 i nie zawiera edycji w Non-Goals
- [x] 4.2 `supabase/tests/gift_editing_guard.test.sql` pokrywa Risk #4
- [x] 4.3 Roadmapa: S-07 `done`, milestone `done`
- [x] 4.4 Test plan: Risk #4 zamknięty, fazy 1–4 `complete`, cookbook zaktualizowany
- [x] 4.5 `npm test`, `npx tsc --noEmit`, `npx expo lint` zielone
