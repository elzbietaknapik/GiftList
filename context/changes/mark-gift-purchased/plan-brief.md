# Oznaczanie prezentu jako kupiony — Plan Brief

> Full plan: `context/changes/mark-gift-purchased/plan.md`

## What & Why

Obdarowujący, który zarezerwował prezent, oznacza go jako kupiony. Status zmienia się na „Zrealizowany” dla wszystkich przeglądających, a tożsamość rezerwującego pozostaje niewidoczna. To zamyka cykl prezentu (FR-011) i jest kolejnym krokiem po rezerwacji z ukrytą tożsamością (S-04).

## Starting Point

Rezerwacja działa (S-04): `reserve_gift` ustawia status `reserved` i zapisuje rezerwującego. Baza ma już `mark_gift_purchased` (tylko rezerwujący) i `my_reserved_gift_ids()`, ale klient nie wywołuje żadnej z nich. Nie wiadomo więc z poziomu klienta, które zarezerwowane prezenty należą do bieżącego użytkownika.

## Desired End State

Rezerwujący widzi przycisk „Oznacz jako kupiony” tylko przy swoich zarezerwowanych prezentach. Po kliknięciu status to „Zrealizowany” bez restartu aplikacji. Inny gość i właściciel nie widzą przycisku, a żaden widok nie pokazuje tożsamości rezerwującego.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Complexity | MEDIUM | Trzy pliki w `src/`, bez zmian schematu, dwa wywołania RPC | Plan (user) |
| Kto oznacza | Tylko rezerwujący | Zgodne z FR-011 i z RPC `mark_gift_purchased` | Plan (user) |
| Nazwa akcji i status | „Oznacz jako kupiony”; status „Zrealizowany” | Zgodne z PRD i istniejącym `STATUS_LABELS` | Plan (user) |
| Powtórne wywołanie | Ochrona tylko w UI, bez zmiany bazy | Bez nowej migracji; luka w Open risks | Plan (user) |
| Źródło „czyja rezerwacja” | `my_reserved_gift_ids()` | Jedyna ścieżka klienta, która nie ujawnia tożsamości | Research |
| Weryfikacja | `tsc`, `lint`, kontrole manualne | Bez nowego testu pgTAP dla ryzyka #5 | Plan (user) |
| Odświeżanie stanu | Refetch listy i własnych rezerwacji po sukcesie i błędzie | Interfejs nie pokazuje zmiany, której baza nie przyjęła | Plan |

## Scope

**In scope:** `src/lib/gifts.ts` (`markGiftPurchased`, `NotGiftReserverError`, `listMyReservedGiftIds`); `GiftList` (opcjonalna akcja zakupu); widok `list/[token].tsx` (pobranie własnych rezerwacji, wywołanie, komunikaty, refetch).

**Out of scope:** migracje i zmiany RPC; testy pgTAP; Realtime; cofanie zakupu; akcja dla innych gości; usuwanie z ochroną (S-06).

## Architecture / Approach

Widok gościa wywołuje wyłącznie funkcje z `src/lib/`. Wrapper RPC mapuje błąd uprawnień na klasę domenową. Przycisk pokazuje się tylko dla prezentów z `my_reserved_gift_ids()`, a uprawnienie egzekwuje baza.

```
[token].tsx ──markGiftPurchased(id)──► lib/gifts.ts ──rpc mark_gift_purchased──► reservations / gifts
     │                                                                              │
     ├──listGifts + listMyReservedGiftIds◄──── refetch po sukcesie/błędzie ◄────────┘
     └──GiftList(onMarkPurchased, ownReservedIds)  (przycisk tylko dla reserved ∩ own)
```

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Dane | `markGiftPurchased`, `NotGiftReserverError`, `listMyReservedGiftIds` | Mapowanie błędu po treści komunikatu |
| 2. Komponent | Przycisk w `GiftList` tylko dla zarezerwowanych, własnych prezentów | Przycisk widoczny nie dla tej osoby |
| 3. Widok gościa | Własne rezerwacje, wywołanie, komunikaty, refetch | Właśnie zarezerwowany prezent bez przycisku |
| 4. Weryfikacja | Trzy konta, podwójne kliknięcie, brak wycieku tożsamości | Brak automatycznego testu ryzyka #5 |

**Prerequisites:** S-04 (`reserve-gift-hidden-identity`) zrealizowany; brak zmian w bazie.
**Estimated effort:** ~1 sesja, 4 fazy z ręcznymi zatrzymaniami na weryfikację.

## Open Risks & Assumptions

- `mark_gift_purchased` nie sprawdza `status = 'reserved'`; powtórne wywołanie nadpisze `purchased_at`. Ochrona tylko w UI, zaakceptowana.
- Brak automatycznego testu, że inny gość nie może oznaczyć zakupu (ryzyko #5). Decyzja użytkownika: kontrola manualna.
- Ścieżka błędu `NotGiftReserverError` nie jest osiągalna z poprawnego UI; sprawdzana przez kod.
- Status dla innych gości widoczny po ponownym otwarciu ekranu (brak Realtime).

## Success Criteria (Summary)

- Rezerwujący oznacza swój prezent; status zmienia się na „Zrealizowany” bez restartu, a przycisk znika.
- Inny gość i właściciel nie widzą przycisku; żaden widok nie pokazuje tożsamości rezerwującego.
- `npx tsc --noEmit` i `npx expo lint` przechodzą; `supabase/` bez zmian.
