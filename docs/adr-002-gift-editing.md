# ADR-002: Edycja prezentu przez właściciela listy

- **Status:** Accepted
- **Data:** 2026-11-04
- **Decydenci:** Zespół GiftList (właściciel produktu + inżynieria)
- **Powiązania:** FR-005, FR-006, FR-012, Risk #4, `context/changes/protected-deletes/plan.md`

## Kontekst

MVP GiftList pierwotnie wykluczał edycję prezentu po dodaniu (PRD Non-Goals). W praktyce właściciel listy potrzebuje poprawić literówkę w nazwie, zaktualizować cenę lub podmienić link, gdy produkt zmienił się w sklepie. Usunięcie i ponowne dodanie prezentu jest uciążliwe, a przy błędzie cenowym prowadzi do utraty danych, które użytkownik już wprowadził.

Jednocześnie rezerwacja prezentu jest zobowiązaniem Obdarowującego. Zmiana treści prezentu po rezerwacji mogłaby:
- zmienić przedmiot, który Obdarowujący już kupił lub zamierza kupić,
- ujawnić pośrednio informacje o rezerwacji przez nagłe zmiany danych,
- naruszyć zasadę „przy próbie modyfikacji zarezerwowanego elementu — odmowa z wyjaśnieniem" z PRD (Business Logic).

Dotychczasowa polityka RLS `update_gifts` sprawdzała wyłącznie własność listy (`owner_id = auth.uid()`), więc właściciel mógł zmodyfikować także prezent zarezerwowany lub zrealizowany. To luka bezpieczeństwa i logiki danych (Risk #4).

## Decyzja

Dopuszczamy edycję prezentu przez właściciela listy (nazwa, link, cena, opcjonalny URL zdjęcia) **wyłącznie wtedy, gdy prezent nie ma statusu `reserved` ani `purchased` i nie istnieje powiązana rezerwacja**.

Reguła jest egzekwowana dwuwarstwowo:

1. **Warstwa aplikacji** — `updateGift` w `src/lib/gifts.ts` przed zapisem sprawdza aktualny status prezentu oraz brak wiersza w `reservation_status`. Przy naruszeniu rzuca `GiftNotEditableError` z komunikatem „Nie można edytować zarezerwowanego lub zrealizowanego prezentu.".
2. **Warstwa bazy danych** — polityka RLS `update_gifts` wymaga własności listy, statusu `free` oraz braku rezerwacji dla wiersza, zarówno w `USING` (stary wiersz), jak i w `WITH CHECK` (nowy wiersz). Brak rezerwacji jest sprawdzany przez `public.gift_has_reservation(uuid)`, funkcję `SECURITY DEFINER` zwracającą wyłącznie boolean: bezpośrednie podzapytanie do `reservations` z polityki `gifts` powodowałoby rekurencję RLS (polityka `reservations` czyta `gifts`). Dzięki temu nawet bezpośrednie wywołanie PostgREST nie ominie guardu, a tożsamość rezerwującego pozostaje ukryta.

Edycja nie zmienia cyklu życia statusu: `NewGift` nie zawiera pola `status`, więc operacja nie może zmienić `free` na `reserved`/`purchased` ani odwrotnie.

## Konsekwencje

### Pozytywne

- Właściciel może poprawić dane bez usuwania i ponownego dodawania prezentu.
- Zobowiązanie Obdarowującego jest chronione na poziomie UI i bazy.
- Spójność z FR-006: operacje modyfikujące są dozwolone tylko dla wolnych prezentów.
- Luka Risk #4 zostaje zamknięta niezależnie od klienta.

### Negatywne / koszty

- Dwa źródła prawdy o regule (klient + RLS) wymagają utrzymania w zgodzie; testy pgTAP powinny pokryć odmowę dla `reserved` i `purchased`.
- Konieczna migracja naprawcza polityki `update_gifts` (forward-only, bez edycji już wypchniętej migracji).
- Edycja prezentu z rezerwacją wymaga najpierw anulowania rezerwacji — proces anulowania nie istnieje w MVP, więc taka zmiana jest trwale zablokowana do czasu dodania go jako osobnej funkcji.

### Neutralne

- UI edycji jest dostępny wyłącznie dla właściciela i tylko dla `status === 'free'`; widok gościa nie otrzymuje akcji edycji.
- Brak edycji statusu i brak edycji prezentów z historią zakupu jest celowe.

## Rozważone alternatywy

1. **Brak edycji (status quo).** Odrzucone: nie odpowiada realnej potrzebie właściciela i wymusza destrukcyjny obejście „usuń i dodaj".
2. **Edycja bez ograniczeń dla właściciela.** Odrzucone: narusza zobowiązanie Obdarowującego i PRD Business Logic; otwiera Risk #4.
3. **Soft-delete + edycja jako nowy wiersz z historią.** Odrzucone w MVP: zwiększa złożoność modelu danych i UI bez wymagania produktowego; możliwe w przyszłym milestone.
4. **Guard tylko w kliencie.** Odrzucone: RLS pozostawałby obejściem przez bezpośrednie API.

## Egzekwowanie i weryfikacja

- `src/lib/gifts.ts` — guard w `updateGift` przed `update`.
- `supabase/migrations/20261104120000_gift_editing_guard.sql` — `ALTER POLICY update_gifts` z warunkami `USING` i `WITH CHECK`.
- Testy pgTAP (w zakresie zmian testowych): właściciel nie może zaktualizować prezentu `reserved` ani `purchased`; może zaktualizować `free`.
- `npx tsc --noEmit` oraz `npx expo lint` przed uznaniem zmiany za ukończoną.

## Powiązane dokumenty

- `context/foundation/prd.md` — FR-012 (In-Scope), Business Logic.
- `context/foundation/roadmap.md` — S-07 (edycja prezentu).
- `context/changes/protected-deletes/plan.md` — usunięte wykluczenie edycji z zakresu.
