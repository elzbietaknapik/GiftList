---
date: 2026-10-30T08:40:33+01:00
researcher: Elżbieta Knapik
git_commit: 00e41e74318de65a21c02e594298efedca78655c
branch: master
repository: 10xdevs
topic: "Ryzyko #1: dwaj obdarowujący rezerwują ten sam wolny prezent; obaj widzą sukces"
tags: [research, codebase, reservations, concurrency, pgtap]
status: complete
last_updated: 2026-10-30
last_updated_by: Elżbieta Knapik
---

# Research: Ryzyko #1 — dwie równoległe rezerwacje jednego wolnego prezentu

**Date**: 2026-10-30T08:40:33+01:00
**Researcher**: Elżbieta Knapik
**Git Commit**: 00e41e74318de65a21c02e594298efedca78655c
**Branch**: master
**Repository**: 10xdevs

## Research Question

Ryzyko z `context/foundation/test-plan.md:44`: „[Two gift-givers reserve the same free gift; both see success]".

1. Gdzie to ryzyko realnie przechodzi przez nasz kod (plik, funkcja, moduł)?
2. Jakie obserwowalne zachowanie udowodniłoby ochronę przed tym ryzykiem (z perspektywy kontraktu biznesowego, a nie kształtu implementacji)?
3. Jaki jest najtańszy test (cost × signal: jednostkowy czy integracyjny), który realnie wyłapie to ryzyko?

Zakres: ryzyko #1. Ryzyko #5 (`mark_gift_purchased`, ta sama faza rollout) nie jest tu badane.

## Summary

- W zbadanych ścieżkach (`supabase/migrations/`, `src/`) jedynym miejscem, które nadaje prezentowi status `reserved`, jest funkcja `public.reserve_gift(uuid)` (`supabase/migrations/20261005113900_initial_schema.sql:104-117`). Klient nie ma żadnego wywołania tej funkcji: grep po `src/` dla `\.rpc\(|reserve_gift|mark_gift_purchased|my_reserved_gift_ids|reservation_status` zwrócił 0 plików, więc dziś nie istnieje ekran, który mógłby pokazać „sukces".
- Ochrona opiera się na warunkowym `UPDATE` (compare-and-swap): `update public.gifts set status = 'reserved' where id = p_gift_id and status = 'free'`, a następnie `if not found then raise exception 'gift is not free'` (`:113-114`). Przegrany czeka na blokadę wiersza, po commicie zwycięzcy warunek `status = 'free'` jest ponownie oceniany, daje 0 wierszy i podnosi wyjątek `P0001`.
- Zmierzone zachowanie (dwie niezależne sesje, lokalna baza, PostgreSQL 17.11): drugie wywołanie zablokowało się na 2005 ms i zakończyło błędem `P0001: gift is not free`; stan końcowy to `status = 'reserved'`, dokładnie 1 wiersz w `public.reservations`, `reserver_user_id` = pierwszy wywołujący.
- Istnieje drugi, niezależny bezpiecznik: `reservations.gift_id uuid not null unique` (`:35`). Nawet gdyby warunkowy `UPDATE` został zastąpiony przez check-then-act, przegrany trafiłby na `23505` przy `insert` i jego cała transakcja (w tym wcześniejszy `update` statusu) zostałaby wycofana. „Obaj widzą sukces" wymaga więc jednoczesnego osłabienia obu gwarancji albo kłamstwa po stronie klienta (optymistyczny UI).
- Najtańszy test z realnym sygnałem to integracyjny test pgTAP na dwóch sesjach (`dblink`) wewnątrz istniejącej bramki `npx supabase test db`. Test sekwencyjny (dwa wywołania po kolei) jest tańszy, ale nie odróżnia poprawnego CAS od check-then-act — obie wersje odmawiają sekwencyjnie — więc nie może być dowodem dla tego ryzyka. Wykonalność `dblink` w tym środowisku została sprawdzona.

## Detailed Findings

### 1. Gdzie ryzyko realnie przechodzi przez kod

| Element | Kotwica | Rola względem ryzyka |
| --- | --- | --- |
| `public.reserve_gift(p_gift_id uuid)` | `supabase/migrations/20261005113900_initial_schema.sql:104-117` | Jedyne miejsce nadające status `reserved`; `security definer`, więc RLS na `gifts` nie jest tu bramką |
| Warunkowy `UPDATE` (CAS) | `:113` | Faktyczny punkt rozstrzygnięcia wyścigu |
| `if not found then raise exception 'gift is not free'` | `:114` | Jawna odmowa dla przegranego (`P0001`) |
| `gift_id uuid not null unique` | `:35` | Drugi, niezależny bezpiecznik „najwyżej jedna rezerwacja na prezent" |
| Bramka dostępu do listy | `:107-112` | Warunek wstępny; przepuszcza właściciela (`gl.owner_id = auth.uid()`) i członka (`m.user_id is not null`) |
| `public.my_reserved_gift_ids()` | `:129-133` | Czytelny dla klienta dowód „czyja to rezerwacja", bez ujawniania tożsamości |
| Brak ścieżki klienta | `src/` (całe drzewo) | Grep po `\.rpc\(|reserve_gift|mark_gift_purchased|my_reserved_gift_ids|reservation_status` → 0 plików; jedyne wystąpienia rezerwacji w `src/` to typ `GiftStatus` (`src/lib/gifts.ts:3`) i etykieta `reserved` (`src/components/gift-list.tsx:10`) |
| Planowana, nieistniejąca funkcja | `context/foundation/roadmap.md:48`, `:125-131` | S-04 `reserve-gift-hidden-identity` ma status `proposed`; UI rezerwacji jeszcze nie istnieje |

Dodatkowo: w obu migracjach nie ma żadnego triggera ani innej funkcji ustawiającej `gifts.status = 'reserved'`; `mark_gift_purchased` (`:119-127`) ustawia wyłącznie `'purchased'`. Definicja funkcji w działającej lokalnej bazie (`select pg_get_functiondef(...)`) jest zgodna z migracją: te same instrukcje i ta sama bramka; różni się tylko formatowanie i quoting `search_path` — brak dryfu semantycznego.

**Konsekwencja dla ryzyka:** dziś „obaj widzą sukces" nie może wystąpić w UI, bo UI nie rezerwuje. Ryzyko sprowadza się do kontraktu bazy danych (RPC) i staje się widoczne dla użytkownika dopiero po wdrożeniu S-04.

### 2. Zachowanie pod prawdziwą współbieżnością (obserwacja, nie lektura kodu)

Eksperyment wykonany na lokalnym stacku (`supabase_db_10xdevs`, PostgreSQL 17.11, WSL) w dwóch niezależnych sesjach połączonych przez `dblink`:

- Sesja A (członek L1): `begin` → `reserve_gift(G1)` → `pg_sleep(3)` → `commit`.
- Sesja B (inny członek L1), start 1 s później, podczas gdy A trzyma blokadę: `reserve_gift(G1)`.

Wynik:

- Sesja B zablokowała się na **2005 ms** (czekała na commit A) i zakończyła się `ERROR: P0001: gift is not free`.
- Stan końcowy: `gifts.status = 'reserved'`, `count(*) from reservations where gift_id = G1` = **1**, `reserver_user_id` = użytkownik z sesji A.

Mechanizm (wnioskowanie z semantyki PostgreSQL READ COMMITTED): przy `UPDATE` kolidującym z równoległym `UPDATE` tego samego wiersza PostgreSQL czeka na zakończenie drugiej transakcji, a następnie ponownie ocenia predykat `WHERE` na nowej wersji wiersza. `status` nie jest już `'free'`, więc aktualizowanych jest 0 wierszy, `FOUND` = false i funkcja podnosi wyjątek. To jest dokładnie ten sam mechanizm, który został zaobserwowany powyżej.

Uzupełnienie o drugi bezpiecznik: gdyby `:113` zamienić na check-then-act (`select status` → `if` → bezwarunkowy `update`), to przy współbieżności obaj odczytaliby `'free'`; przegrany wykonałby `insert` kolidujący z `reservations_gift_id_key` i dostał `23505`, a ponieważ funkcja nie ma bloku `EXCEPTION`, całe jej wywołanie (łącznie z `update` statusu) zostałoby wycofane. Skutek biznesowy nadal nie jest „oba sukcesy", ale odmowa przestaje być jawna (`gift is not free`) i staje się technicznym `23505` — to jest właśnie klasa regresji, której test sekwencyjny nie wykryje, a test dwusesyjny tak.

### 3. Co dowodzi ochrony — obserwable na poziomie kontraktu

Test powinien orzekać o stanie i odpowiedziach RPC, nie o treści SQL:

| # | Obserwowalne zachowanie | Co wyłapuje |
| --- | --- | --- |
| O1 | Zwycięzca: `reserve_gift` kończy się bez błędu | Zerwany happy path |
| O2 | Przegrany: wywołanie kończy się jawną odmową, różną od sukcesu; dziś `P0001` z komunikatem `gift is not free` | Połknięty błąd, cichy sukces, zamiana jawnej odmowy na `23505` |
| O3 | `gifts.status` po wyścigu = `'reserved'` (nie `free`, nie `purchased`) | Cofnięcie statusu, podwójny zapis |
| O4 | Dokładnie 1 wiersz w `public.reservations` dla tego prezentu, a `reserver_user_id` = zwycięzca | Podwójna rezerwacja, „ostatni wygrywa" nadpisujący tożsamość |
| O5 | `my_reserved_gift_ids()` zawiera prezent u zwycięzcy i nie zawiera u przegranego | Nadpisanie tożsamości rezerwującego (istota niespodzianki) |

Uwaga o komunikacie: `P0001` + `gift is not free` jest dziś surowym tekstem Postgresa; konwencja klienta (`src/components/add-gift-form.tsx:45-46`) pokazuje `e.message` bez mapowania. Dla ryzyka #1 wystarczy asercja „jawna odmowa" z kodem `P0001`; lokalizacja tekstu to osobna decyzja produktowa, nie warunek ochrony.

### 4. Najtańszy test (cost × signal)

| Opcja | Koszt | Sygnał dla ryzyka #1 | Werdykt |
| --- | --- | --- | --- |
| pgTAP sekwencyjny (2 wywołania po kolei, drugie ma rzucić) | najniższy: rozszerzenie istniejącego harnessu, 0 nowych narzędzi | Łapie usunięcie bramki, połknięcie błędu, drugi wiersz w `reservations`. **Nie odróżnia CAS od check-then-act** — obie wersje odmawiają sekwencyjnie | Warstwa dolna (tanio, szybko), nie dowód |
| pgTAP dwusesyjny przez `dblink` (rekomendowany) | średni: `create extension dblink` + ok. 40-60 linii, uruchamiane w istniejącej bramce `npx supabase test db` (`test-plan.md:108`, `:136`) | Dokładnie to ryzyko: przeplatanie, jawna odmowa, dokładnie jedna rezerwacja, tożsamość zwycięzcy | **Główny test fazy 1** |
| Dwa klienty `@supabase/supabase-js` + `Promise.all` w Jest | wyższy: Jest nie jest zainstalowany (`test-plan.md:107`), potrzebne tokeny i użytkownicy | Dochodzi warstwa PostgREST/JWT i kształt błędu HTTP; dla tego ryzyka marginalny zysk, bo jedyna ścieżka to RPC, a PostgREST tylko przenosi błąd | Odłożyć |
| e2e / UI | wysoki, a UI rezerwacji nie istnieje | Brak sygnału dzisiaj | Poza zakresem |

Wykonalność rekomendacji została sprawdzona na tym środowisku:

- `dblink` jest dostępny w obrazie lokalnym (`/usr/share/postgresql/extension/dblink.control` oraz `dblink--1.2.sql` są obecne w kontenerze).
- `dblink_connect` musi łączyć się jako `supabase_admin`: rola `postgres` w tym obrazie **nie jest** superuserem (`rolsuper = f`), a `dblink` odmawia bez hasła/GSSAPI („password or GSSAPI delegated credentials required"). Połączenie jako `supabase_admin` zadziałało.
- `auth.uid()` przenosi się do sesji `dblink` przez `set_config('request.jwt.claims', '{"sub":"..."}', true)` w transakcji tej sesji — ten sam wzorzec, co w istniejącym harnessie (`supabase/tests/reservation_privacy.test.sql:77-79`).

Pułapki, które musi zaadresować plan:

1. **`dblink` łamie własność „cały plik się wycofuje".** Obecny harness zakłada, że fixture nigdy nie zostają w bazie, bo wszystko dzieje się w jednej transakcji (`supabase/tests/reservation_privacy.test.sql:10-11`, `verification.md:116-118`). Sesja `dblink` commituje niezależnie — fixtures trzeba commitować, a test musi je jawnie sprzątać (deterministyczne UUID, `delete` na początku i na końcu). Awaria w środku testu może zostawić residue.
2. **Przegrany musi być członkiem tej samej listy.** Obcy użytkownik trafi najpierw na gałąź `no access to this list` (`:112`) i test udowodni bramkę dostępu (ryzyko #3), a nie bramkę statusu.
3. **Pułapka przeciążenia `throws_ok`:** forma trzyargumentowa z drugim argumentem długości dokładnie 5 bajtów jest interpretowana jako `errcode`, a trzeci jako `errmsg`. Używać formy czteroargumentowej z `NULL` errmsg (`verification.md:39-45`).
4. **Uruchamianie z WSL.** Docker Desktop nie jest zainstalowany na hoście Windows; `npx supabase ...` działa z WSL (`verification.md:9-12`, `:182-184`).

## Code References

- `supabase/migrations/20261005113900_initial_schema.sql:35` — `reservations.gift_id ... unique` (drugi bezpiecznik).
- `supabase/migrations/20261005113900_initial_schema.sql:104-117` — `public.reserve_gift(uuid)`, jedyny punkt nadający `reserved`.
- `supabase/migrations/20261005113900_initial_schema.sql:107-112` — bramka dostępu (właściciel lub członek).
- `supabase/migrations/20261005113900_initial_schema.sql:113-114` — warunkowy `UPDATE` + `raise exception 'gift is not free'`.
- `supabase/migrations/20261005113900_initial_schema.sql:119-127` — `mark_gift_purchased` (ryzyko #5, poza zakresem).
- `supabase/migrations/20261005113900_initial_schema.sql:129-133` — `my_reserved_gift_ids()`.
- `supabase/tests/reservation_privacy.test.sql:27-30` — wzorzec `plan(N)` i `search_path`.
- `supabase/tests/reservation_privacy.test.sql:77-85` — wzorzec przełączania tożsamości (`set local role` + `request.jwt.claims`).
- `src/lib/gifts.ts:3` — jedyne wystąpienie statusu `reserved` w `src/` obok etykiety w `gift-list.tsx`.
- `src/components/add-gift-form.tsx:45-46` — konwencja prezentowania `e.message` (surowy tekst błędu).
- `context/foundation/test-plan.md:44`, `:59`, `:80` — sformułowanie ryzyka, wymagane dowody i przypisanie do fazy 1.

## Architecture Insights

- Autoryzacja rezerwacji nie opiera się na RLS: `reserve_gift` jest `security definer`, a `gifts` mają `update_gifts` tylko dla właściciela (`:72-74`), więc klient nie może zmienić statusu bezpośrednio — jedyna droga to RPC. To celowe i oznacza, że test musi iść przez RPC, nie przez `UPDATE`.
- `reservations` jest zamknięte dla klienta (`revoke all`, `:85`), więc asercje o liczbie wierszy i tożsamości wykonuje rola uprzywilejowana w teście, a warstwa „co widzi klient" korzysta z `my_reserved_gift_ids()` i `reservation_status`.
- „Sukces" w kontrakcie RPC to brak błędu (`returns void`); nie ma identyfikatora rezerwacji do porównania. Dlatego obserwable sukcesu to stan bazy + `my_reserved_gift_ids()`, nie wartość zwracana.
- Kolejność bramek w funkcji jest istotna dla doboru uczestników testu: najpierw dostęp do listy, potem status prezentu.

## Historical Context (from prior changes)

- `context/changes/reservation-privacy-tests/verification.md:7-19` — harness pgTAP działał z WSL; `db reset` + dwa przebiegi `test db` (17 asercji). Potwierdza, że bramka z `test-plan.md:136` jest realna, nie postulowana.
- `context/changes/reservation-privacy-tests/verification.md:39-45` — opisana pułapka `throws_ok` (dotyczy każdego nowego testu z jawną asercją błędu).
- `context/changes/reservation-privacy-tests/verification.md:116-118` — „każdy plik działa we własnej, wycofywanej transakcji"; założenie, które `dblink` łamie (patrz §4, pułapka 1).
- `context/changes/reservation-privacy-tests/verification.md:126-129` — dlaczego `select *` z `reservations` daje `42501`: tabela jest zamknięta, a grant obejmuje tylko kolumny bez tożsamości. Wpływa na to, jak test może liczyć rezerwacje.
- `context/foundation/roadmap.md:48`, `:125-131` — S-04 to gwiazda przewodnia i wciąż `proposed`; ryzyko #1 wyprzedza UI rezerwacji, więc faza 1 testuje kontrakt bazy, nie ekran.

## Related Research

- `context/changes/share-link-and-guest-access/expo-linking-research.md`, `navigation-auth-research.md` — nie dotyczą rezerwacji (routing/deep link); nie dotykano.
- Brak wcześniejszego `research.md` o współbieżności rezerwacji w `context/changes/**` ani `context/archive/**`.

## Open Questions

1. **Self-reservation.** PRD (`context/foundation/prd.md:122`) mówi „Brak self-reservation", ale predykat dostępu w `reserve_gift` (`:111`) jawnie przepuszcza właściciela (`gl.owner_id = auth.uid()`), a żadna późniejsza instrukcja go nie wyklucza. Test fazy 1 nie powinien używać właściciela jako żadnej ze stron wyścigu, dopóki produkt nie zdecyduje, czy to luka, czy świadome odstępstwo.
2. **Kształt odmowy w UI (S-04).** Dziś odmowa to surowy tekst `gift is not free`. Kontrakt „jawna odmowa" jest spełniony na poziomie bazy; mapowanie na komunikat użytkownika nie ma jeszcze kodu. Nie blokuje fazy 1.
3. **Rezydualność testu `dblink`.** Otwarte: czy plan zaakceptuje plik testowy, który nie jest w pełni transakcyjny (konieczny commit sesji `dblink`), czy woli osobny, jawnie sprzątany fixture. Wpływ: ryzyko pozostawienia danych w lokalnej bazie po nieudanym przebiegu.