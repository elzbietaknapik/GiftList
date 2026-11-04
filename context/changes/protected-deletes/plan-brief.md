# Protected Deletes — Plan Brief

> Full plan: `context/changes/protected-deletes/plan.md`

## What & Why

Życzący musi móc usunąć prezent tylko wtedy, gdy jest wolny, a całą listę tylko wtedy, gdy nic na niej nie jest zarezerwowane (FR-004, FR-006). Dziś aplikacja nie ma żadnej funkcji usuwania, więc właściciel nie może posprzątać listy ani zacząć od nowa.

## Starting Point

Baza już egzekwuje oba warunki w politykach RLS: `delete_lists` blokuje listę z jakąkolwiek rezerwacją, `delete_gifts` wymaga `status = 'free'` (`initial_schema.sql:57–60, 75–77`). Klient nie ma ani funkcji usuwania, ani przycisków; `GiftList` jest współdzielony przez właściciela i gościa.

## Desired End State

Właściciel widzi „Usuń” przy wolnych prezentach i „Usuń listę” w nagłówku, oba z dwustopniowym potwierdzeniem inline. Odmowa jest komunikowana zdaniem wyjaśniającym, a po usunięciu listy ekran wraca do formularza tworzenia listy. Gość nie widzi żadnej akcji usuwania.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Potwierdzenie | Inline two-step | Działa identycznie na iOS/Android/web, bez problemu z `Alert` na RN Web | Plan |
| Miejsce akcji listy | Nagłówek ekranu właściciela | Nie dotyka `GiftList` współdzielonego z gościem | Plan |
| Weryfikacja | `tsc` + `lint` + manual | Spójne z S-05 i obecnym stanem repo (brak testów klienta) | Plan |
| Wykrywanie odmowy | `.select('id')` po DELETE | PostgREST zwraca sukces przy 0 wierszach odfiltrowanych przez RLS | Research |
| Guardy | Wyłącznie istniejące RLS | Zero migracji, jedno źródło prawdy | Research |
| Wariant przycisku | `variant="destructive"` w `Button` | Bez literałów kolorów i lokalnych stylów w widokach | Plan |

## Scope

**In scope:** `deleteGift`, `deleteList`, wariant `destructive` w `Button`, akcja usuwania w `GiftList`, akcja usuwania listy w nagłówku właściciela, sekcja w `ui-states.tsx`.

**Out of scope:** migracje i `supabase/`, pgTAP, undo/kosz, Realtime, modal `Alert`. (Edycja prezentu jest osobnym zakresem: S-07 / `docs/adr-002-gift-editing.md`.)

## Architecture / Approach

Ekran właściciela (`src/app/(app)/index.tsx`) trzyma stan operacji i przekazuje callback do `GiftList`; `GiftList` renderuje akcję tylko dla `status === 'free'` i tylko gdy callback istnieje, więc widok gościa pozostaje bez zmian. Warstwa danych (`src/lib/gifts.ts`, `src/lib/lists.ts`) wywołuje DELETE z `.select('id')` i tłumaczy pusty wynik na błąd domenowy, który UI pokazuje przez `FormError`.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Data layer | `deleteGift` / `deleteList` z wykrywaniem odmowy | Odmowa RLS wygląda jak sukces |
| 2. Gift delete | Wariant `destructive` + akcja w wierszu z potwierdzeniem | Akcja wycieka do widoku gościa |
| 3. List delete | Akcja w nagłówku + powrót do `CreateListForm` | Ekran nie odświeża się po usunięciu |
| 4. Verification | `tsc`, `lint`, scenariusze manualne | Regresja S-04/S-05 |

**Prerequisites:** S-04 i S-05 wdrożone; lokalne/hosted Supabase z politykami z migracji.
**Estimated effort:** 1 sesja, 4 fazy.

## Open Risks & Assumptions

- Brak automatycznej ochrony FR-004/FR-006 — tylko kontrole manualne (decyzja użytkownika).
- Prezent `purchased` jest trwale nieusuwalny z UI (zgodne z FR-006).
- Zmiana polityk RLS w bazie zmieni zachowanie klienta bez zmian w kodzie.

## Success Criteria (Summary)

- Właściciel usuwa wolny prezent i listę bez rezerwacji, z potwierdzeniem.
- Próba usunięcia chronionego elementu kończy się czytelnym komunikatem, a dane zostają.
- Gość i widok gościa nie mają żadnej akcji usuwania.
