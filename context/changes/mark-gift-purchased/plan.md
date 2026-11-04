# Mark Gift Purchased — Implementation Plan

## Overview

Dostarczyć S-05 (roadmap: `context/foundation/roadmap.md`, Change ID `mark-gift-purchased`, PRD: FR-011): rezerwujący Obdarowujący oznacza swój zarezerwowany prezent jako kupiony. Akcja „Oznacz jako kupiony” pojawia się wyłącznie przy prezencie o statusie „Zarezerwowany”, który należy do bieżącego użytkownika. Po sukcesie status na liście to „Zrealizowany”, a tożsamość rezerwującego nie jest widoczna dla nikogo. Zmiana wykorzystuje istniejącą RPC `mark_gift_purchased(p_gift_id)` i `my_reserved_gift_ids()`, opakowane w `src/lib/gifts.ts`. Bez zmian schematu i bez nowych migracji.

Źródła: `context/foundation/roadmap.md` (S-05, lines 137–147), PRD: FR-010, FR-011, Guardrails; `supabase/migrations/20261005113900_initial_schema.sql:119–127, 129–133, 137–138`.

> **Ograniczenia zakresu:** bez zmian w `supabase/`, bez nowych testów pgTAP, bez Realtime. Weryfikacja: `npx tsc --noEmit`, `npx expo lint`, kontrole manualne na trzech kontach.

## Current State Analysis

- **RPC `mark_gift_purchased`** (`supabase/migrations/20261005113900_initial_schema.sql:119–127`): `security definer`; aktualizuje `reservations.purchased_at` tylko dla wiersza, którego `reserver_user_id = auth.uid()`; przy braku dopasowania rzuca `only the reserver can mark as purchased` (`:125`); następnie ustawia `gifts.status = 'purchased'` (`:126`). Grant dla `authenticated` (`:137–138`). Nie sprawdza, czy status to `reserved` (luka, zob. Open risks).
- **RPC `my_reserved_gift_ids`** (`:129–133`): zwraca `uuid[]` prezentów zarezerwowanych przez `auth.uid()`. Jedyna dozwolona ścieżka klienta do pytania „czy to moja rezerwacja” bez czytania `reservations` (tabela zamknięta, `:85`).
- **Klient:** `src/lib/gifts.ts` ma `listGifts`, `addGift`, `reserveGift` i `GiftAlreadyReservedError` (po S-04). Nie ma wrappera na `mark_gift_purchased` ani na `my_reserved_gift_ids`.
- **Komponent:** `GiftList` (`src/components/gift-list.tsx:19–23`) ma props `onReserve` i `reservingId`. Etykieta `purchased` to już „Zrealizowany” (`:12`). Akcja „Zarezerwuj” renderowana jest dla `free` (`:37–45`).
- **Widok gościa:** `src/app/(app)/list/[token].tsx` ma `canReserve` (`:61`), `handleReserve` z refetchem (`:63–89`), osobny stan `reserveError` (`:27`) i reset przy zmianie tokenu (`:30–38`).
- **Widok właściciela:** `src/app/(app)/index.tsx:105` renderuje `<GiftList gifts={gifts} />` bez callbacków, więc nie dostaje żadnej akcji. Status „Zrealizowany” jest widoczny bez zmian.

### Key Discoveries:

- Egzekwowanie uprawnienia „tylko rezerwujący” działa już w bazie (`reserver_user_id = auth.uid()`, `initial_schema.sql:122–124`). Klient nie musi go duplikować, tylko go odzwierciedlić w UI.
- Gość nie widzi, kto zarezerwował prezent, więc sam status `reserved` nie mówi, czy przycisk należy do tej osoby. Źródłem tej informacji jest wyłącznie `my_reserved_gift_ids()`.
- `raise exception` trafia do klienta jako `PostgrestError.message` (jak w S-04). Mapowanie odbywa się po treści `only the reserver can mark as purchased`, wzorem `reserveGift` (`src/lib/gifts.ts`).
- Po własnej rezerwacji zbiór `my_reserved_gift_ids` też się zmienia. Bez jego odświeżenia przycisk „Oznacz jako kupiony” nie pojawi się na prezencie, który właśnie zarezerwowano.

## What We're NOT Doing

- Zmian w RPC `mark_gift_purchased` i nowej migracji (w tym sprawdzenia `status = 'reserved'`). Decyzja: ochrona przed powtórnym wywołaniem tylko w UI; ryzyko w Open risks.
- Akcji zakupu dla innych gości niż rezerwujący. Decyzja: wyłącznie rezerwujący (FR-011, RPC).
- Cofnięcia zakupu i potwierdzenia dialogiem.
- Zmiany etykiety statusu („Zrealizowany” zostaje) ani zmian w widoku właściciela.
- Subskrypcji Realtime i aktualizacji statusu „na żywo”. Status odświeża się po własnej akcji i przy ponownym otwarciu ekranu.
- Lokalnej mutacji stanu (ręcznego ustawiania `status: 'purchased'`). Po sukcesie robimy refetch.
- Odczytu `reservations` i `reservation_status` w kliencie. Tożsamość rezerwującego pozostaje niewidoczna.
- Nowych testów pgTAP (w tym dla ryzyka #5) i testów automatycznych klienta. Decyzja użytkownika: kontrole manualne.
- Usuwania prezentów z ochroną (S-06).

## Implementation Approach

Warstwa danych w `src/lib/gifts.ts` owija obie RPC i mapuje błąd uprawnień na klasę domenową. `GiftList` dostaje opcjonalną akcję zakupu oraz zbiór identyfikatorów własnych rezerwacji, a widok gościa pobiera ten zbiór razem z listą i odświeża oba zbiory po każdej operacji. Widok nie importuje `supabase`. Uprawnienie egzekwuje baza, a UI pokazuje przycisk tylko tam, gdzie ma to sens.

Decyzje podjęte w rozmowie:
- Kto oznacza: wyłącznie rezerwujący (przycisk tylko dla prezentów z `my_reserved_gift_ids`).
- Nazwa akcji: „Oznacz jako kupiony”; status pozostaje „Zrealizowany”.
- Powtórne wywołanie: ochrona tylko w UI, bez zmiany bazy.
- Weryfikacja: `tsc`, `lint` i kontrole manualne; bez nowego testu pgTAP.

Decyzje podjęte samodzielnie:
- Wrapper odczytu nazwany `listMyReservedGiftIds`, zwraca `Set<string>`, żeby widok i komponent sprawdzały przynależność w stałym czasie.
- Osobny stan `purchasingId` i `purchaseError`, odrębny od `reservingId` i `reserveError`, żeby obie akcje nie blokowały się nawzajem.
- Brak nowego ekranu i nowej trasy, więc `.expo/types/` nie wymaga regeneracji.

## Critical Implementation Details

- **Przynależność z bazy, nie z lokalnego stanu:** przycisk pokazuje się tylko, gdy `gift.status === 'reserved'` i `gift.id` jest w `ownReservedIds`. Oba zbiory są pobierane z bazy; nie dopisujemy identyfikatora do zbioru lokalnie po kliknięciu „Zarezerwuj”.
- **Odświeżenie po rezerwacji:** `handleReserve` musi odświeżyć także `ownReservedIds` (w sukcesie i w gałęzi wyścigu), inaczej właśnie zarezerwowany prezent nie dostanie przycisku bez ponownego wejścia na ekran.
- **Brak lokalnej mutacji statusu:** po `markGiftPurchased` status zmienia się w UI dopiero po refetchu z bazy.
- **Mapowanie po treści:** `raise exception 'only the reserver can mark as purchased'` przychodzi jako `PostgrestError.message`; rozpoznajemy go po fragmencie, tak jak w `reserveGift`.
- **Podwójne kliknięcie:** `disabled` na przyciskach „Oznacz jako kupiony” gdy `purchasingId !== null`; jedno wywołanie RPC na kliknięcie.
- **Gate na widoku:** `onMarkPurchased={canReserve ? handleMarkPurchased : undefined}`, tak jak dla rezerwacji, żeby właściciel nigdy nie dostał akcji, nawet gdyby zbiór nie był pusty.

---

## Phase 1: Data layer — mark purchased and own reserved ids

### Overview

Dodać wrapper RPC `mark_gift_purchased` z mapowaniem błędu uprawnień oraz wrapper odczytu `my_reserved_gift_ids`. Bez UI.

### Changes Required:

#### 1. Mark purchased wrapper and own reserved ids reader

**File**: `src/lib/gifts.ts`

**Intent**: Jedno miejsce wywołujące `mark_gift_purchased` i tłumaczące jego wyjątek na błąd domenowy, oraz jedno miejsce pobierające identyfikatory własnych rezerwacji. Wzorzec: `reserveGift` i `GiftAlreadyReservedError` z S-04.

**Contract**: `export class NotGiftReserverError extends Error` (komunikat: „Tylko osoba, która zarezerwowała prezent, może oznaczyć go jako kupiony.”, `name` ustawione jak w `GiftAlreadyReservedError`). `export async function markGiftPurchased(giftId: string): Promise<void>` wywołuje `supabase.rpc('mark_gift_purchased', { p_gift_id: giftId })`; przy `error.message` zawierającym `only the reserver can mark as purchased` rzuca `NotGiftReserverError`; inaczej `new Error(error.message)`. `export async function listMyReservedGiftIds(): Promise<Set<string>>` wywołuje `supabase.rpc('my_reserved_gift_ids')`, zwraca `new Set((data ?? []) as string[])`; błąd → `new Error(error.message)`.

### Success Criteria:

#### Automated Verification:

- `npx tsc --noEmit` przechodzi
- `npx expo lint` przechodzi
- `src/lib/gifts.ts` eksportuje `markGiftPurchased`, `NotGiftReserverError` i `listMyReservedGiftIds`

---

## Phase 2: Gift list purchase action slot

### Overview

Dodać do `GiftList` opcjonalną akcję „Oznacz jako kupiony” widoczną tylko dla prezentów o statusie „Zarezerwowany”, należących do bieżącego użytkownika.

### Changes Required:

#### 1. Optional purchase action in the list

**File**: `src/components/gift-list.tsx`

**Intent**: Rozszerzyć komponent o opcjonalny callback, identyfikator prezentu w trakcie oznaczania oraz zbiór własnych rezerwacji. Bez przekazanych props lista zachowuje się jak dotychczas, więc widok właściciela się nie zmienia.

**Contract**: `GiftListProps` dostaje `onMarkPurchased?: (gift: Gift) => void`, `purchasingId?: string | null` i `ownReservedIds?: ReadonlySet<string>`. Akcja renderuje się wyłącznie, gdy `gift.status === 'reserved'`, `onMarkPurchased` jest zdefiniowany i `ownReservedIds?.has(gift.id)` jest prawdą. Przycisk: `Button` z `@/components/ui/button`, `label` „Oznacz jako kupiony”, `accessibilityLabel` `Oznacz jako kupiony: <nazwa>`, `loading` gdy `purchasingId === gift.id`, `disabled` gdy `purchasingId !== null`. Etykieta statusu bez zmian (`STATUS_LABELS`). Wiersz pozostaje w `ThemedView type="backgroundElement"`.

### Success Criteria:

#### Automated Verification:

- `npx tsc --noEmit` przechodzi
- `npx expo lint` przechodzi
- `src/components/gift-list.tsx` przyjmuje `onMarkPurchased`, `purchasingId`, `ownReservedIds` i używa `Button` z `@/components/ui/button`

#### Manual Verification:

- Ekran właściciela (`src/app/(app)/index.tsx`) nie pokazuje przycisku „Oznacz jako kupiony” przy żadnym prezencie, także zarezerwowanym

---

## Phase 3: Guest view — mark purchased flow

### Overview

Podłączyć akcję w widoku gościa: pobrać własne rezerwacje razem z listą, wywołać RPC, obsłużyć błąd uprawnień i odświeżyć oba zbiory.

### Changes Required:

#### 1. Guest route wiring

**File**: `src/app/(app)/list/[token].tsx`

**Intent**: Dodać obsługę oznaczania zakupu do istniejącego ekranu gościa bez bezpośrednich wywołań Supabase. Akcja jest dostępna tylko dla nie-właściciela, a po każdej operacji lista i własne rezerwacje są pobierane ponownie z bazy.

**Contract**:
- Import `markGiftPurchased`, `listMyReservedGiftIds`, `NotGiftReserverError` z `@/lib/gifts`.
- Stan: `ownReservedIds: ReadonlySet<string>` (start: pusty zbiór), `purchasingId: string | null`, `purchaseError: string | null`. Wszystkie resetowane w bloku `activeToken` (`:30–38`).
- Ładowanie (`useEffect`, `:40–59`): po `openSharedList` pobrać równolegle `listGifts(data.id)` i `listMyReservedGiftIds()`; ustawić `gifts` i `ownReservedIds`.
- Wspólny helper odświeżający oba zbiory (np. `refreshListState(listId)`), używany przez `handleReserve` (`:63–89`) w sukcesie i w gałęzi `GiftAlreadyReservedError`, oraz przez nową akcję zakupu.
- `handleMarkPurchased(gift)`: ustawia `purchasingId`, czyści `purchaseError`, wywołuje `markGiftPurchased(gift.id)`, po sukcesie odświeża stan. W `catch`: dla `NotGiftReserverError` ustawia `purchaseError` komunikatem z klasy; inne błędy → `error.message`. W `finally` czyści `purchasingId`.
- Przekazanie do `GiftList`: `onMarkPurchased={canReserve ? handleMarkPurchased : undefined}`, `purchasingId`, `ownReservedIds`.
- Błąd zakupu pokazany przez `FormError` obok `reserveError`, pod nagłówkiem listy; istniejący błąd ładowania nietknięty.

### Success Criteria:

#### Automated Verification:

- `npx tsc --noEmit` przechodzi
- `npx expo lint` przechodzi
- `src/app/(app)/list/[token].tsx` nie importuje `@/lib/supabase` ani `supabase` bezpośrednio

#### Manual Verification:

- Rezerwujący widzi „Oznacz jako kupiony” przy swoim zarezerwowanym prezencie; po kliknięciu status zmienia się na „Zrealizowany” bez restartu aplikacji, a przycisk znika
- Gość, który zarezerwował prezent w tej samej sesji (S-04), widzi przycisk „Oznacz jako kupiony” od razu po rezerwacji, bez ponownego otwierania ekranu

---

## Phase 4: End-to-end verification

### Overview

Zweryfikować przepływ na trzech kontach: właściciel, rezerwujący i inny gość. Potwierdzić brak wycieku tożsamości i brak regresji S-04.

### Changes Required:

#### 1. Verification pass

**File**: brak zmian w plikach (weryfikacja)

**Intent**: Potwierdzić, że całość działa razem: tylko rezerwujący oznacza zakup, inny gość nie widzi akcji, właściciel widzi „Zrealizowany” bez tożsamości, a rezerwacja z S-04 nadal działa.

**Contract**: uruchomić `npx tsc --noEmit` i `npx expo lint` na finalnym drzewie. Scenariusze manualne na trzech kontach w trzech sesjach.

### Success Criteria:

#### Automated Verification:

- `npx tsc --noEmit` przechodzi na finalnym drzewie
- `npx expo lint` przechodzi na finalnym drzewie
- `supabase/` bez zmian (`git diff --stat -- supabase/` pusty)

#### Manual Verification:

- Właściciel otwiera własny link: widzi „Zrealizowany” przy oznaczonym prezencie i nie widzi przycisku zakupu
- Inny gość (nie rezerwujący) na prezencie „Zarezerwowany” nie widzi przycisku „Oznacz jako kupiony”; po oznaczeniu przez rezerwującego widzi „Zrealizowany” po ponownym otwarciu ekranu
- Szybkie podwójne kliknięcie „Oznacz jako kupiony” wysyła jedno wywołanie RPC (przyciski zablokowane)
- Ponowne otwarcie ekranu rezerwującego po zakupie pokazuje „Zrealizowany” bez przycisku
- Żaden widok (właściciel, gość, komunikaty) nie pokazuje tożsamości rezerwującego
- Rezerwacja z S-04 nadal działa: wolny prezent można zarezerwować, a drugi gość dostaje komunikat „Ten prezent został już zarezerwowany.”

---

## DoD (Definition of Done)

- `markGiftPurchased` wywołuje RPC `mark_gift_purchased` i mapuje błąd uprawnień na `NotGiftReserverError` lub czytelny komunikat (Faza 1).
- `listMyReservedGiftIds` zwraca identyfikatory z `my_reserved_gift_ids` (Faza 1).
- Akcja „Oznacz jako kupiony” jest widoczna tylko przy statusie „Zarezerwowany”, tylko dla rezerwującego i nigdy dla właściciela (Fazy 2–3).
- Po sukcesie status na liście to „Zrealizowany” z bazy; błąd uprawnień obsłużony komunikatem i refetchem (Faza 3).
- Tożsamość rezerwującego nigdzie nie jest czytana ani pokazywana (Faza 4).
- `npx tsc --noEmit` i `npx expo lint` przechodzą; `supabase/` bez zmian.

## Risks

| # | Risk | Mitigation |
|---|------|-----------|
| 1 | Inny gość oznacza zakup cudzej rezerwacji (ryzyko #5) | Przycisk ukryty w UI przez `ownReservedIds`; RPC egzekwuje `reserver_user_id = auth.uid()`. Brak automatycznego testu (decyzja); kontrola manualna w Fazie 4. |
| 2 | Przycisk widoczny po zakupie lub bez prawa własności | Warunek `status === 'reserved'` i członkostwo w `ownReservedIds` (Faza 2). |
| 3 | Właśnie zarezerwowany prezent bez przycisku | `refreshListState` odświeża oba zbiory także po rezerwacji (Faza 3). |
| 4 | Podwójne wywołanie RPC przy szybkim kliknięciu | `purchasingId` blokuje wszystkie przyciski podczas wywołania (Faza 2–3). |
| 5 | Zmiana treści wyjątku w bazie łamie mapowanie | Mapowanie po fragmencie `only the reserver can mark as purchased` z odniesieniem do migracji (Faza 1). |

## Out of scope

- Migracje DB, zmiany w `mark_gift_purchased`, zmiany RLS.
- Testy pgTAP dla ryzyka #5 i testy automatyczne klienta, CI.
- Realtime i odświeżanie statusów na żywo.
- Cofnięcie zakupu, usuwanie z ochroną (S-06).

## Open risks & assumptions

- **RPC nie sprawdza `status = 'reserved'`.** Bezpośrednie ponowne wywołanie przez rezerwującego nadpisze `purchased_at`, a wywołanie przy statusie `free` nie dotknie gift, bo wymaga istniejącej rezerwacji. Ochrona tylko w UI; zaakceptowane na tym etapie, domknięcie wymaga osobnej migracji forward-only.
- **Ścieżka błędu `NotGiftReserverError` nie jest osiągalna z poprawnego UI.** Przycisk pokazuje się tylko rezerwującemu, więc komunikat weryfikujemy przez kod i mapowanie, nie w scenariuszu manualnym.
- **Brak automatycznej ochrony przed innym gościem** (ryzyko #5 z `testing-reservation-lifecycle`). Decyzja użytkownika: kontrole manualne; test pgTAP może wejść jako osobna zmiana.
- **Status dla innych gości po ponownym otwarciu ekranu** (brak Realtime), zgodnie z fallbackiem z roadmapy.
- **Mapowanie wyjątków po treści.** Zmiana komunikatu `raise exception` w bazie wymaga aktualizacji `src/lib/gifts.ts`.

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Data layer — mark purchased and own reserved ids

#### Automated
- [x] 1.1 `npx tsc --noEmit` passes — 3908189
- [x] 1.2 `npx expo lint` passes — 3908189
- [x] 1.3 `src/lib/gifts.ts` exports `markGiftPurchased`, `NotGiftReserverError` and `listMyReservedGiftIds` — 3908189

### Phase 2: Gift list purchase action slot

#### Automated
- [x] 2.1 `npx tsc --noEmit` passes
- [x] 2.2 `npx expo lint` passes
- [x] 2.3 `src/components/gift-list.tsx` accepts `onMarkPurchased`, `purchasingId`, `ownReservedIds` and uses `Button`

#### Manual
- [x] 2.4 Owner screen (`src/app/(app)/index.tsx`) shows no “Oznacz jako kupiony” button, including on reserved gifts

### Phase 3: Guest view — mark purchased flow

#### Automated
- [ ] 3.1 `npx tsc --noEmit` passes
- [ ] 3.2 `npx expo lint` passes
- [ ] 3.3 `src/app/(app)/list/[token].tsx` does not import `supabase` directly

#### Manual
- [ ] 3.4 Reserver sees “Oznacz jako kupiony” on own reserved gift; after tap status becomes “Zrealizowany” without app restart and the button disappears
- [ ] 3.5 Guest who reserved a gift in the same session sees the purchase button right after reserving, without reopening the screen

### Phase 4: End-to-end verification

#### Automated
- [ ] 4.1 `npx tsc --noEmit` passes on the final tree
- [ ] 4.2 `npx expo lint` passes on the final tree
- [ ] 4.3 `supabase/` has no changes (`git diff --stat -- supabase/` empty)

#### Manual
- [ ] 4.4 Owner opening own link sees “Zrealizowany” and no purchase button
- [ ] 4.5 Non-reserving guest sees no purchase button on a reserved gift; after purchase, reopening the screen shows “Zrealizowany”
- [ ] 4.6 Rapid double tap on “Oznacz jako kupiony” sends one RPC call
- [ ] 4.7 Reserver reopening the screen after purchase sees “Zrealizowany” and no button
- [ ] 4.8 No view (owner, guest, messages) shows the reserver identity
- [ ] 4.9 S-04 reservation still works: free gift can be reserved; second guest gets “Ten prezent został już zarezerwowany.”

## References

- Roadmap: `context/foundation/roadmap.md` (S-05 lines 137–147)
- PRD: `context/foundation/prd.md` (FR-010, FR-011, Guardrails)
- Schema/RPC: `supabase/migrations/20261005113900_initial_schema.sql:119–127, 129–133, 137–138`
- Previous slice: `context/archive/2026-11-02-reserve-gift-hidden-identity/plan.md`
- Risk #5 origin: `context/changes/testing-reservation-lifecycle/change.md:13–14`
- Client: `src/lib/gifts.ts`, `src/lib/lists.ts:53–64`, `src/components/gift-list.tsx:9–45`, `src/app/(app)/list/[token].tsx:61–89`, `src/app/(app)/index.tsx:105`
