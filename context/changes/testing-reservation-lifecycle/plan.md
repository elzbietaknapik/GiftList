# Reservation lifecycle integrity: test ryzyka #1 (dwie równoległe rezerwacje) Implementation Plan

## Overview

Faza 1 planu testów (`context/foundation/test-plan.md` §3) domyka ryzyko #1: dwaj obdarowujący rezerwują ten sam wolny prezent i obaj widzą sukces. Ryzyko przechodzi wyłącznie przez RPC `public.reserve_gift(uuid)` w bazie danych, więc dowód musi być integracyjnym testem pgTAP, który uruchamia dwie prawdziwe, współbieżne transakcje przez `dblink`. Test sekwencyjny nie odróżnia poprawnej blokady wiersza od wzorca check-then-act, dlatego sam nie wystarcza.

Zmiana dodaje jeden nowy plik testowy `supabase/tests/reservation_concurrency.test.sql`, nie zmienia migracji, nie dotyka `src/` i nie zmienia istniejącego harnessu `reservation_privacy.test.sql`.

## Current State Analysis

- `public.reserve_gift(uuid)` (`supabase/migrations/20261005113900_initial_schema.sql:104-117`) jest jedynym miejscem nadającym status `reserved`. Bramka dostępu (`:107-112`) przepuszcza właściciela i członka listy. Warunkowy `UPDATE ... where status = 'free'` (`:113`) rozstrzyga wyścig, a `raise exception 'gift is not free'` (`:114`) daje jawną odmowę (SQLSTATE `P0001`).
- `reservations.gift_id` ma `unique` (`:35`), czyli drugi, niezależny bezpiecznik. Przegrany check-then-act dostałby `23505`, nie `P0001`.
- Klient nie wywołuje RPC rezerwacji (`src/` bez trafień na `.rpc(`, `reserve_gift`), więc ryzyko istnieje dziś tylko w kontrakcie bazy.
- Harness F-01 (`supabase/tests/reservation_privacy.test.sql`) jest w całości transakcyjny i pinuje `plan(17)`. Każdy plik działa we własnej transakcji, którą kończy `rollback`.
- Lokalna baza (`supabase_db_10xdevs`, PostgreSQL 17.11, WSL): `dblink` jest w obrazie, `dblink_connect` przyjmuje `user=supabase_admin` bez hasła, a rola `postgres` nie jest superuserem (`rolsuper = f`). Przeprowadzony eksperyment: sesja B zablokowała się na 2005 ms i dostała `P0001: gift is not free`, stan końcowy to 1 rezerwacja z tożsamością zwycięzcy. Dane eksperymentu zostały usunięte.

### Key Discoveries:

- Sesje `dblink` nie widzą niezatwierdzonych danych z sesji głównej. Fixture'y muszą być zatwierdzone (commit), co łamie założenie „cały plik się wycofuje” z F-01. Źródło: `context/changes/testing-reservation-lifecycle/research.md` §4, pułapka 1.
- Pułapka pgTAP: forma `throws_ok(sql, errcode, NULL, description)` z czterema argumentami. Trzyargumentowa forma z drugim argumentem o długości 5 bajtów mapuje argumenty błędnie. Źródło: `context/changes/reservation-privacy-tests/verification.md:39-45`.
- Warstwa identyfikacji (`auth.uid()`) przenosi się przez `set_config('request.jwt.claims', ..., true)` w obrębie transakcji, tak jak w F-01 (`supabase/tests/reservation_privacy.test.sql:77-79`).
- Test ma zostać w bramce `npx supabase test db`, bez wpływu na hosted (`test-plan.md` §5, wiersz pgTAP).

## Desired End State

Po wykonaniu planu `npx supabase test db` uruchamia dwa pliki (`reservation_privacy.test.sql`: 17 asercji, `reservation_concurrency.test.sql`: 11 asercji) i oba przechodzą dwukrotnie z rzędu na świeżo zresetowanej bazie. Test współbieżności:

- potwierdza, że przegrany wywołanie zostało zablokowane przez zwycięzcę, zanim zwycięzca zatwierdził transakcję (synchronizacja przez stan, nie przez czas),
- potwierdza, że zwycięzca dostał sukces, a przegrany jawną odmowę `P0001`,
- potwierdza, że w bazie jest dokładnie jedna rezerwacja z tożsamością zwycięzcy, a `my_reserved_gift_ids()` pokazuje prezent tylko zwycięzcy,
- nie zostawia żadnych danych fixture po przebiegu.

Dowód mutacyjny (lokalnie, z przywróceniem): usunięcie predykatu `status = 'free'` z `reserve_gift` powoduje niepowodzenie asercji odmowy `P0001`.

## What We're NOT Doing

- Ryzyka #5 (`mark_gift_purchased`, tylko rezerwujący oznacza zakup) — osobna zmiana w tej samej fazie rollout lub kolejna faza; nie dodajemy asercji o `purchased` do tego pliku.
- Self-reservation (PRD mówi „brak”, `reserve_gift` przepuszcza właściciela) — test używa wyłącznie członków listy jako stron wyścigu. Pytanie produktowe pozostaje otwarte i ma osobną decyzję.
- Odwrotnej kolejności wyścigu (zwycięzca B) — jeden porządek wystarcza do dowodu gwarancji; symetria nie daje dodatkowego sygnału w tanim teście.
- Testów klienta (Jest, dwa klienty `supabase-js`), UI rezerwacji i e2e — poza zakresem fazy 1 (`test-plan.md` §4, §7).
- Zmian w migracjach, w `reservation_privacy.test.sql` oraz w `reserve_gift`. Istniejąca niezacommitowana zmiana formatowania w `reservation_privacy.test.sql` nie jest częścią tego planu i nie jest ruszana.
- Dodania `dblink` do migracji. Rozszerzenie jest instalowane wyłącznie w pliku testowym, żeby nie trafiło do hosted projektu.
- Wiringu CI (`test-plan.md` §5, wiersz CI wiring — odroczony w roadmapie).

## Implementation Approach

Plik testowy działa w trzech etapach: (1) przygotowanie fixture'ów i połączeń `dblink`, (2) symulacja wyścigu z punktem synchronizacji i asercjami, (3) sprzątanie i asercja braku residue. Fixture'y oraz sprzątanie idą przez dedykowane połączenie `race_admin` w trybie autocommit, dzięki czemu są widoczne dla pozostałych sesji. Każda asercja używa istniejących nazw helperów pgTAP.

Wyścig jest sterowany stanem, nie czasem: zwycięzca wykonuje `reserve_gift` w otwartej transakcji i nie zatwierdza jej; przegrany wysyła wywołanie asynchronicznie; główna sesja czeka (z ograniczoną liczbą prób), aż `pg_stat_activity` pokaże backend przegranego w stanie oczekiwania na blokadę; dopiero wtedy zwycięzca zatwierdza, a wynik przegranego jest odbierany.

## Critical Implementation Details

- **Widoczność fixture'ów.** Dane wstawione w sesji głównej nie są widoczne dla sesji `dblink`. Wszystkie fixture'y (użytkownicy w `auth.users`, listy, członkostwa, prezent) muszą być wstawione przez połączenie `race_admin` w trybie autocommit. Plik nie może opakowywać się w `begin`/`rollback`.
- **Synchronizacja przez stan.** Kolejność „przegrany czeka na zwycięzcę” ma być potwierdzona przez `pg_stat_activity` (filtr po `application_name` ustawionym w connstr połączenia przegranego oraz `wait_event_type = 'Lock'`), w pętli z limitem prób. Brak potwierdzenia blokady to porażka testu z jawnym komunikatem, a nie cichy przebieg. `pg_sleep` nie służy jako warunek kolejności.
- **Odbiór błędu przegranego.** Błąd `P0001` z połączenia przegranego pojawia się przy odbiorze wyniku (`dblink_get_result`), nie przy wysłaniu. Po odbiorze połączenie przegranego ma być cofnięte (`rollback`) przed rozłączeniem, bo transakcja jest w stanie przerwania.
- **Tożsamość w połączeniach.** Połączenia `dblink` działają jako `supabase_admin` (rola `postgres` nie jest superuserem i `dblink` odrzuca połączenie bez hasła). Sesje wyścigu ustawiają `request.jwt.claims` przez `set_config(..., true)` wewnątrz własnej transakcji.
- **Sprzątanie.** Na początku i na końcu pliku usuwane są listy o deterministycznych UUID (kaskada usuwa prezenty, członkostwa i rezerwacje), następnie użytkownicy testowi z `auth.users`. Asercja końcowa sprawdza zerowy stan fixture'ów przez `race_admin`.
- **Rozszerzenie.** `create extension if not exists dblink with schema extensions;` w pliku testowym. Nie w migracji.

## Phase 1: Harness współbieżności

### Overview

Nowy plik pgTAP z infrastrukturą: rozszerzenie, połączenia `race_admin`, `race_a`, `race_b`, fixture'y zatwierdzone przez autocommit, sprzątanie przed i po, deklaracja `plan(11)` z pustym wnętrzem asercji do uzupełnienia w fazie 2.

### Changes Required:

#### 1. Plik testowy wyścigu

**File**: `supabase/tests/reservation_concurrency.test.sql`

**Intent**: Dostarczyć wspólny szkielet dla testu współbieżności: połączenia `dblink`, zatwierdzone fixture'y (właściciel L, dwóch członków-obdarowujących, jeden prezent wolny), sprzątanie na wejściu i wyjściu oraz `plan(11)` zgodne z liczbą asercji z fazy 2.

**Contract**: Plik nie używa `begin`/`rollback` wokół całości. Połączenie `race_admin` (autocommit) tworzy użytkowników z deterministycznymi UUID w `auth.users` (wzorzec `make_user` z F-01, bez zależności od pliku F-01), listę z właścicielem, dwa wpisy `list_members` dla członków i jeden wolny prezent. Połączenia `race_a` i `race_b` są otwierane z `application_name` ustawionym na nazwę roli w wyścigu. Użytkownicy i listy mają UUID z odrębnej przestrzeni niż F-01 (np. prefiks `c...`), aby nie kolidowały, gdyby plik został uruchomiony obok niego.

### Success Criteria:

#### Automated Verification:

- Plik istnieje i jest jedynym nowym plikiem w `supabase/tests/`; `Select-String -Path supabase/migrations/*.sql -Pattern dblink` nie zwraca trafień (brak zmian migracyjnych).
- `npx supabase db reset` (WSL) przechodzi bez błędów po dodaniu pliku.
- Połączenie `race_admin` i `race_b` otwierają się bez błędu (pierwsza asercja pliku, sprawdzana w fazie 2).

## Phase 2: Asercje wyścigu i odmowy

### Overview

Pełna sekwencja wyścigu z punktem synchronizacji i jedenaście asercji (w tym sekwencyjna odmowa jako tania warstwa dolna).

### Changes Required:

#### 1. Sekwencja wyścigu i asercje

**File**: `supabase/tests/reservation_concurrency.test.sql`

**Intent**: Zasymulować dwie równoległe rezerwacje tego samego wolnego prezentu i zweryfikować kontrakt biznesowy: dokładnie jeden sukces, jedna jawna odmowa, jedna rezerwacja z tożsamością zwycięzcy, brak ujawnienia tożsamości przegranemu.

**Contract**: Kolejność kroków dla implementującego:

1. Zwycięzca (członek A): w `race_a` otwarta transakcja, `set_config` z `sub` członka A, wywołanie `reserve_gift` na prezencie. Nie zatwierdzamy.
2. Przegrany (członek B): w `race_b` transakcja, `set_config` z `sub` członka B, wysłanie wywołania `reserve_gift` na tym samym prezencie asynchronicznie.
3. Główna sesja: pętla z limitem prób sprawdzająca w `pg_stat_activity`, czy backend o `application_name` przegranego czeka na blokadę. Potwierdzenie to asercja „przegrany zablokowany przed zatwierdzeniem zwycięzcy”.
4. Zwycięzca zatwierdza. Odbiór wyniku przegranego (`dblink_get_result`) jest opakowany w `throws_ok` z SQLSTATE `P0001`. Następnie `rollback` w `race_b` i rozłączenie.
5. Asercje stanu (przez `race_admin` lub superużytkownika): status prezentu `reserved`, dokładnie jeden wiersz w `reservations`, `reserver_user_id` = członek A.
6. Asercje widoczności (rola `authenticated`, JWT zwycięzcy i przegranego): `my_reserved_gift_ids()` zawiera prezent u zwycięzcy i nie zawiera go u przegranego.
7. Sekwencyjna odmowa: członek A (lub B po zakończeniu wyścigu) ponownie wywołuje `reserve_gift` w głównej sesji jako `authenticated`; oczekiwany `P0001`.
8. Na końcu: sprzątanie i asercja braku residue.

Liczba asercji i ich rola (plan(11)): połączenie `race_admin` i `race_b` (1); zwycięzca bez błędu (2); przegrany zablokowany przed commit (3); przegrany `P0001` (4); status `reserved` (5); dokładnie jedna rezerwacja (6); tożsamość zwycięzcy w `reservations` (7); `my_reserved_gift_ids` zwycięzcy zawiera prezent (8); `my_reserved_gift_ids` przegranego nie zawiera (9); sekwencyjna odmowa `P0001` (10); zero residue po sprzątaniu (11).

Asercja tożsamości w punkcie 7 jest sprawdzana przez superużytkownika w teście i nie wprowadza nowego ujawnienia w kontrakcie klienta; kontrakt klienta jest pokryty przez F-01.

### Success Criteria:

#### Automated Verification:

- `npx supabase test db` (WSL) uruchamia `reservation_concurrency.test.sql` z `plan(11)` i raportuje `Tests=11` oraz wszystkie `ok`.
- Asercja „przegrany zablokowany” przechodzi przy każdym przebiegu; w pętli nie ma stałego `pg_sleep` jako warunku kolejności.
- Dowód mutacyjny (lokalnie, z przywróceniem): tymczasowe usunięcie predykatu `status = 'free'` z `reserve_gift` w lokalnej bazie powoduje niepowodzenie asercji 4 (przegrany dostaje `23505` zamiast `P0001`); po przywróceniu definicji funkcji test przechodzi ponownie. Definicja funkcji w migracji pozostaje nietknięta.
- Przy usuniętym predykacie asercja 10 (sekwencyjna odmowa) także pada, bo drugie wywołanie dostaje `23505`. Sekwencyjny test wykrywa więc usunięcie bramki, ale nie odróżnia CAS od check-then-act; tę rolę pełni wyłącznie asercja 4 w wyścigu.

#### Manual Verification:

- Przebieg z wielokrotnym uruchomieniem pod obciążeniem (np. równoległe uruchomienie innej części testów) nie daje fałszywych zielonych ani fałszywych czerwonych wyników w pętli synchronizacji.

## Phase 3: Weryfikacja, sprzątanie i cookbook

### Overview

Dowód na świeżej bazie, dowód braku residue po przebiegu i wypełnienie §6.2 cookbooka w `test-plan.md`.

### Changes Required:

#### 1. Zapis weryfikacji

**File**: `context/changes/testing-reservation-lifecycle/verification.md`

**Intent**: Udokumentować wykonany przebieg (dwa pliki pgTAP, dwa kolejne przebiegi, mutacja) w formie, którą rewizja może odtworzyć, łącznie z ograniczeniem WSL i uprawnieniem `supabase_admin`.

**Contract**: Zawiera polecenia, wynik `Result: PASS` dla obu plików, liczbę asercji, wynik dowodu mutacyjnego, wynik zapytania o residue po przebiegu oraz sekcję „Ryzyka przeniesione”: test wymaga lokalnego dostępu do `dblink` jako `supabase_admin` bez hasła; na hosted nie jest uruchamiany.

#### 2. Cookbook §6.2

**File**: `context/foundation/test-plan.md`

**Intent**: Zastąpić placeholder „TBD — see §3 Phase 1” wpisem, który odpowiada na pytanie „jak dodać test współbieżności dla rezerwacji w tym projekcie?”.

**Contract**: Sekcja §6.2 wskazuje lokalizację (`supabase/tests/`), nazwę wzorca (plik `*.test.sql`, `plan(N)` zgodne z liczbą asercji, fixture'y zatwierdzone przez połączenie administracyjne w trybie autocommit, sprzątanie na wejściu i wyjściu), plik referencyjny (`reservation_concurrency.test.sql`) oraz polecenie uruchomienia (`npx supabase test db`, WSL). Pozostałe sekcje §6 nie są zmieniane.

#### 3. Metadane zmiany

**File**: `context/changes/testing-reservation-lifecycle/change.md`

**Intent**: Odzwierciedlić stan po zakończeniu planowania i wykonaniu fazy 3 bez naruszania tożsamości zmiany.

**Contract**: Status przechodzi zgodnie z regułami `/10x-implement` (wpis `planned` już obowiązuje po zapisie planu). Pola `change_id`, `title`, `created` oraz treść pozostają bez zmian.

### Success Criteria:

#### Automated Verification:

- `npx supabase db reset` oraz dwa kolejne `npx supabase test db` (WSL): oba przebiegi zwracają `Result: PASS` dla `reservation_privacy.test.sql` (17) i `reservation_concurrency.test.sql` (11).
- Zapytanie przez `race_admin` po przebiegu zwraca zero wierszy dla deterministycznych UUID listy, użytkowników testowych i prezentu (brak residue).
- `npx tsc --noEmit` i `npx expo lint` przechodzą (brak zmian w `src/`, ale wymagane przez zasady projektu przed zakończeniem pracy).
- `verification.md` istnieje w folderze zmiany i zawiera wyniki wymienione w sekcji Contract.
- `context/foundation/test-plan.md` §6.2 nie zawiera już ciągu `TBD` i wskazuje `reservation_concurrency.test.sql`.

#### Manual Verification:

- Recenzent potwierdza, że polecenie w §6.2 odtwarza ten sam wynik na czystej bazie po `db reset`.
- Recenzent potwierdza, że `verification.md` opisuje ograniczenie `supabase_admin` i brak uruchomienia na hosted.

## Testing Strategy

### Unit Tests:

- Brak. Ryzyko #1 jest kontraktem bazy danych; testy jednostkowe JS nie są częścią tej fazy (`test-plan.md` §3 Phase 3 dla walidacji klienta).

### Integration Tests:

- `reservation_concurrency.test.sql`: sekwencja wyścigu z punktem synchronizacji (asercje 1–11 z fazy 2).
- Regresja F-01: `reservation_privacy.test.sql` nadal przechodzi (17 asercji), co potwierdza, że nowy plik nie zmienia stanu wspólnej bazy.

### Manual Testing Steps:

1. `db reset` z WSL, następnie `npx supabase test db` — oczekiwane: dwa pliki `PASS`.
2. Ponowne `npx supabase test db` bez resetu — oczekiwane: `PASS`, brak residue (zapytanie sprzątające przez `race_admin` zwraca zero).
3. Tymczasowe usunięcie predykatu `status = 'free'` w lokalnej `reserve_gift` — oczekiwane: asercja 4 czerwona; przywrócenie definicji — oczekiwane: zielona.

## Performance Considerations

- Pętla synchronizacji ma limit prób (kilkadziesiąt iteracji po krótkim odczekaniu); typowy czas oczekiwania to pojedyncze sekundy, zgodnie z obserwowanym 2005 ms w eksperymencie.
- Dodatkowe połączenia `dblink` działają lokalnie; plik nie wpływa na czas `test-plan.md` §5 bramki pgTAP poza jednorazowym czasem wyścigu.

## Migration Notes

- Brak migracji schematu. Rozszerzenie `dblink` jest tworzone wyłącznie w pliku testowym i nie trafia do hosted projektu (`supabase db push` go nie obejmuje).
- Istniejące dane lokalne nie są modyfikowane poza fixture'ami testowymi usuwanymi przez sprzątanie.

## References

- Related research: `context/changes/testing-reservation-lifecycle/research.md`
- Risk source: `context/foundation/test-plan.md` §2 (ryzyko #1), §3 (Phase 1), §6.2
- Reserve RPC: `supabase/migrations/20261005113900_initial_schema.sql:104-117`
- Uniqueness guard: `supabase/migrations/20261005113900_initial_schema.sql:35`
- Harness pattern: `supabase/tests/reservation_privacy.test.sql:77-79`, `:42-53`
- Known pgTAP pitfall: `context/changes/reservation-privacy-tests/verification.md:39-45`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Harness współbieżności

#### Automated

- [x] 1.1 Plik `supabase/tests/reservation_concurrency.test.sql` istnieje; brak zmian w `supabase/migrations/` — 13ef81b
- [x] 1.2 `npx supabase db reset` przechodzi po dodaniu pliku — 13ef81b
- [x] 1.3 Połączenia `race_admin` i `race_b` otwierają się bez błędu — 13ef81b

### Phase 2: Asercje wyścigu i odmowy

#### Automated

- [x] 2.1 `npx supabase test db` uruchamia plik z `plan(11)`, wszystkie `ok` — b4bcf53
- [x] 2.2 Asercja „przegrany zablokowany przed commit” przechodzi bez `pg_sleep` jako warunku kolejności — b4bcf53
- [x] 2.3 Dowód mutacyjny: bez predykatu `status = 'free'` asercja 4 pada; po przywróceniu przechodzi — b4bcf53

#### Manual

- [x] 2.4 Wielokrotne uruchomienia pod obciążeniem bez fałszywych wyników w pętli synchronizacji — b4bcf53

### Phase 3: Weryfikacja, sprzątanie i cookbook

#### Automated

- [x] 3.1 `db reset` + dwa kolejne `npx supabase test db`: oba pliki `Result: PASS` (17 i 11) — 0c62e40
- [x] 3.2 Zapytanie przez `race_admin` po przebiegu: zero residue dla deterministycznych UUID — 0c62e40
- [x] 3.3 `npx tsc --noEmit` i `npx expo lint` przechodzą — 0c62e40
- [x] 3.4 `verification.md` zapisany w folderze zmiany z wynikami — 0c62e40
- [x] 3.5 `context/foundation/test-plan.md` §6.2 bez `TBD`, wskazuje `reservation_concurrency.test.sql` — 0c62e40

#### Manual

- [x] 3.6 Recenzent odtwarza wynik z §6.2 na czystej bazie — 0c62e40
- [x] 3.7 Recenzent potwierdza opis ograniczenia `supabase_admin` w `verification.md` — 0c62e40
