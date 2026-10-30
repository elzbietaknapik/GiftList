# Reservation lifecycle integrity: test ryzyka #1 — Plan Brief

> Full plan: `context/changes/testing-reservation-lifecycle/plan.md`
> Research: `context/changes/testing-reservation-lifecycle/research.md`

## What & Why

Dwaj obdarowujący nie mogą zarezerwować tego samego wolnego prezentu i zobaczyć oba sukcesy. Ryzyko #1 (High × High) przechodzi wyłącznie przez RPC `reserve_gift` w bazie, więc dowód musi uruchamiać dwie prawdziwe, współbieżne transakcje, a nie tylko sekwencyjne wywołania.

## Starting Point

Ochrona już istnieje w migracji: warunkowy `UPDATE ... where status = 'free'` oraz unikalność `reservations.gift_id`. Nie ma testu, który by to wykazał pod współbieżnością. Klient nie wywołuje jeszcze rezerwacji (S-04 w roadmapie jest `proposed`), więc ryzyko dotyczy kontraktu bazy. Lokalny eksperyment potwierdził zachowanie: przegrany zablokował się na 2 s i dostał `P0001`, a w bazie została jedna rezerwacja.

## Desired End State

Plik `supabase/tests/reservation_concurrency.test.sql` (11 asercji) działa w `npx supabase test db` obok harnessu F-01 (17 asercji). Przegrany jest odrzucony jawnie, zwycięzca jest jedynym właścicielem rezerwacji, a po przebiegu nie zostają żadne dane testowe.

## Key Decisions Made

| Decision                        | Choice                                             | Why (1 sentence)                                                              | Source   |
| ------------------------------- | -------------------------------------------------- | ----------------------------------------------------------------------------- | -------- |
| Warstwa testu                   | pgTAP, dwie sesje przez `dblink`                   | Sekwencyjny test nie odróżnia CAS od check-then-act                           | Research |
| Asercja odmowy                  | SQLSTATE `P0001`, nie tekst komunikatu             | Kod jest kontraktem, tekst może się zmienić                                   | Research |
| Synchronizacja wyścigu          | Stan z `pg_stat_activity` (czekanie na blokadę)    | `pg_sleep` daje niestabilną kolejność                                         | Plan     |
| Połączenia `dblink`             | `supabase_admin` (rola `postgres` nie jest superuserem) | `dblink` odrzuca połączenie bez hasła dla nie-superużytkownika          | Research |
| Sprzątanie fixture'ów           | Commit przez autocommit + jawne sprzątanie na wejściu i wyjściu | Sesje `dblink` nie widzą niezatwierdzonych danych; wybrano wariant z commitem | Plan (decyzja użytkownika) |
| Plik testowy                    | Nowy `reservation_concurrency.test.sql`            | Nie zmienia `plan(17)` F-01 ani jego założenia transakcyjnego                 | Plan (decyzja użytkownika) |
| Zakres ryzyka                   | Tylko #1; #5 wydzielone                            | Mały diff, łatwy rollback                                                     | Plan (decyzja użytkownika) |
| Self-reservation                | Test używa wyłącznie członków; decyzja osobno      | PRD i `reserve_gift` są sprzeczne, nie zamrażamy żadnego zachowania          | Plan (decyzja użytkownika) |
| Migracje                        | Brak zmian; `dblink` tylko w pliku testowym        | Rozszerzenie nie może trafić do hosted projektu                               | Plan     |

## Scope

**In scope:** nowy plik pgTAP dla ryzyka #1; asercje wyścigu, odmowy i sekwencyjnej odmowy; dowód mutacyjny lokalnie; §6.2 cookbooka; `verification.md`.

**Out of scope:** ryzyko #5 (`mark_gift_purchased`); self-reservation; odwrotna kolejność wyścigu; testy klienta i UI; zmiany migracji lub `reservation_privacy.test.sql`; CI.

## Architecture / Approach

Jeden plik testowy z trzema etapami: fixture'y i połączenia przez autocommit (`race_admin`), wyścig sterowany stanem (zwycięzca trzyma transakcję otwartą, przegrany czeka w blokadzie, potwierdzone przez `pg_stat_activity`), a następnie asercje stanu i widoczności, sprzątanie i asercja braku residue.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Harness współbieżności | Plik, połączenia, zatwierdzone fixture'y, sprzątanie | Fixture'y niewidoczne dla `dblink`, jeśli wstawione w sesji głównej |
| 2. Asercje wyścigu i odmowy | 11 asercji, synchronizacja przez stan, dowód mutacyjny | Błąd przegranego pojawia się przy `dblink_get_result`; zbyt krótka pętla daje fałszywy wynik |
| 3. Weryfikacja i cookbook | Dwa przebiegi, zero residue, §6.2, `verification.md` | Test działa tylko z uprawnieniem `supabase_admin` bez hasła (lokalnie) |

**Prerequisites:** lokalny stack Supabase (WSL, Docker Engine), `supabase/migrations` bez zmian, działający `npx supabase test db`.
**Estimated effort:** ~1–2 sesje (1 nowy plik SQL, 1 dowód mutacyjny, aktualizacja dwóch dokumentów).

## Open Risks & Assumptions

- Założenie: `dblink_connect` jako `supabase_admin` działa bez hasła w lokalnym stacku (zweryfikowane eksperymentem). Na innych środowiskach może wymagać hasła — test jest lokalny i nie jest uruchamiany na hosted.
- Ryzyko: błąd SQLSTATE może nie propagować się przez `dblink_get_result` w tej postaci. Plan: jeśli tak się stanie, asercja przenosi się na wrapper po stronie zdalnej, bez zmiany kontraktu.
- Ryzyko: fixture'y zatwierdzone przy przerwanym przebiegu zostają w bazie; mitygacja to sprzątanie na wejściu i asercja końcowa.
- Otwarte produktowo: self-reservation (PRD `prd.md:122` vs `reserve_gift`) i ryzyko #5 — poza tą zmianą.
- Istniejąca niezacommitowana zmiana formatowania w `reservation_privacy.test.sql` nie jest częścią tego planu.

## Success Criteria (Summary)

- `npx supabase test db` przechodzi dwukrotnie dla obu plików (17 + 11 asercji) na świeżym resecie.
- Dowód mutacyjny: usunięcie predykatu `status = 'free'` czerwieni test wyścigu.
- Po przebiegu zero danych testowych w bazie i `test-plan.md` §6.2 wskazuje nowy plik.
