# Rezerwacja prezentu z ukrytą tożsamością — Plan Brief

> Full plan: `context/changes/reserve-gift-hidden-identity/plan.md`

## What & Why

Zalogowany Obdarowujący na udostępnionej liście rezerwuje wolny prezent. Status zmienia się na „Zarezerwowany” dla wszystkich przeglądających, a tożsamość rezerwującego nie jest widoczna dla nikogo. To gwiazda przewodnia milestone'u: dowodzi główną hipotezę produktu (US-01, FR-009, FR-010).

## Starting Point

Lista gościa (S-03) działa: `openSharedList` dołącza gościa i zwraca listę, `listGifts` pokazuje prezenty z ich statusami. Funkcja bazy `reserve_gift` już istnieje i jest atomowa (`update … where status = 'free'`). Żaden kod klienta jej jeszcze nie wywołuje, a `openSharedList` nie zwraca `owner_id`.

## Desired End State

Gość widzi przycisk „Zarezerwuj” przy każdym wolnym prezencie, klika go i od razu widzi status „Zarezerwowany”. Przy wyścigu dostaje czytelny komunikat i aktualną listę. Właściciel nie widzi przycisku na swojej liście. Żaden widok nie pokazuje, kto zarezerwował.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Complexity | MEDIUM | Cztery pliki, bez zmian schematu | Plan (user) |
| Owner self-reservation | Przycisk ukryty w UI, bez blokady w RPC | Zgodne z Parked „Self-reservation”, bez migracji | Plan (user) |
| Change ID | `reserve-gift-hidden-identity` | Zgodność z roadmapą; synchronizacja działa | Plan (user) |
| Status update | Refetch `listGifts` po sukcesie i po wyścigu | Interfejs nie pokazuje rezerwacji, której baza nie przyjęła | Plan |
| Race handling | Komunikat + odświeżenie listy | Gość od razu widzi aktualny stan | Plan + Roadmap risk |
| Reserve wrapper | `reserveGift` w `src/lib/gifts.ts` | Dane o prezentach, obok `addGift` | Plan |
| Double tap | `reservingId` blokuje przyciski | Jedno wywołanie RPC na kliknięcie | Plan |
| Realtime | Poza zakresem | Roadmapa dopuszcza refetch jako fallback | Roadmap |

## Scope

**In scope:** `src/lib/gifts.ts` (`reserveGift`, `GiftAlreadyReservedError`); `src/lib/lists.ts` (`owner_id`); `GiftList` (opcjonalna akcja); widok `list/[token].tsx` (wiring, komunikaty, refetch).

**Out of scope:** migracje i zmiany RPC; Realtime; lokalna mutacja stanu; potwierdzenie i cofanie rezerwacji; oznaczanie jako zrealizowany (S-05); usuwanie (S-06); dopracowana stylizacja.

## Architecture / Approach

Widok gościa wywołuje wyłącznie funkcje z `src/lib/`. Wrapper RPC mapuje wyjątki bazy na błędy domenowe. Atomowość rezerwacji zapewnia baza, a klient odświeża listę z bazy po każdej próbie.

```
[token].tsx ──reserveGift(id)──► lib/gifts.ts ──rpc reserve_gift──► gifts (atomic update)
     │                                                                  │
     └──────────────listGifts(list.id)◄──────── refetch po sukcesie/wyścigu ┘
```

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Dane | `reserveGift`, `GiftAlreadyReservedError`, `owner_id` z `openSharedList` | Mapowanie wyjątków po treści komunikatu |
| 2. Komponent | Przycisk „Zarezerwuj” w `GiftList` tylko dla wolnych prezentów | Widok właściciela nie może dostać akcji |
| 3. Widok gościa | Ukrycie dla właściciela, wywołanie, komunikaty, refetch | Błąd wyścigu nie może przykryć listy |
| 4. Weryfikacja | Dwa konta, wyścig, double tap, brak wycieku tożsamości | Wymaga dwóch kont i lokalnego `supabase start` dla pgTAP |

**Prerequisites:** S-03 (`share-link-and-guest-access`) i F-01 (`reservation-privacy-tests`) zrealizowane; brak zmian w bazie.
**Estimated effort:** ~1 sesja, 4 fazy z ręcznymi zatrzymaniami na weryfikację.

## Open Risks & Assumptions

- Ochrona przed rezerwacją przez właściciela działa tylko w UI; RPC nadal przyjmie takie wywołanie. Domknięcie wymaga osobnej migracji.
- Status dla innych gości widoczny po ponownym otwarciu ekranu (brak Realtime).
- Mapowanie wyjątków po treści: zmiana komunikatu w `raise exception` wymaga aktualizacji klienta.

## Success Criteria (Summary)

- Gość rezerwuje wolny prezent; status na liście zmienia się na „Zarezerwowany” bez restartu.
- Drugi gość na tym samym prezencie dostaje komunikat „Ten prezent został już zarezerwowany.” i aktualną listę.
- Właściciel nie widzi przycisku; żaden widok nie pokazuje tożsamości rezerwującego.
- `npx tsc --noEmit` i `npx expo lint` przechodzą; `supabase/` bez zmian.
