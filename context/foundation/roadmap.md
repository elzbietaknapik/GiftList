---
project: "GiftList"
version: 1
status: draft
created: 2026-10-05
updated: 2026-10-23
prd_version: 1
main_goal: speed
top_blocker: time
milestone_id: shared-gift-reservation
milestone_seq: 1
milestone_status: open
---

# Roadmap: GiftList

> Derived from `context/foundation/prd.md` (v1) + auto-researched codebase baseline.
> Edit-in-place; archive when superseded.
> Slices below are listed in dependency order. The "At a glance" table is the index.

## Milestone

**M-1: Udostępniona lista z rezerwacją ukrytą** — Status: open

- **Intent:** Dostarczyć end-to-end MVP, w którym Życzący tworzy listę, dodaje prezenty i udostępnia ją linkiem, a Obdarowujący może ją otworzyć, zobaczyć statusy i zarezerwować prezent — bez ujawnienia tożsamości rezerwującego (fundament niespodzianki).
- **Source materials:** `context/foundation/prd.md` (v1)
- **Done when:** każde F-NN i S-NN poniżej ma status `done`.
- **Scope anchors:** FR-001…FR-011, US-01.

## Vision recap

Istniejące narzędzia do list życzeń (Amazon Wishlist, Listronic) są zamknięte w ekosystemie jednego sklepu. GiftList to prosta lista agnostyczna wobec sklepu: Życzący zbiera linki do prezentów z dowolnych sklepów, udostępnia listę bliskim, a Obdarowujący rezerwują prezenty — przy czym tożsamość rezerwującego pozostaje ukryta przed wszystkimi, żeby zachować element niespodzianki. MVP to jedna lista na użytkownika, rezerwacja widoczna natychmiast dla wszystkich przeglądających, a żadna ścieżka (API, URL, interfejs) nie ujawnia, kto zarezerwował dany prezent.

## North star

**S-04: Obdarowujący rezerwuje wolny prezent; status widoczny natychmiast, tożsamość ukryta** — najmniejszy przepływ end-to-end, który udowadnia główną hipotezę produktu; dlatego jest gwiazdą przewodnią i jest sekwencjonowany tak wcześnie, jak pozwalają jego zależności.

> Gwiazda przewodnia (north star) oznacza tutaj: najmniejszy przekrój od początku do końca, którego pomyślne dostarczenie dowodzi, że produkt spełnia swoją główną hipotezę — wszystko inne ma sens tylko, jeśli ten przekrój działa. W tym wypadku hipotezą jest „rezerwacja z ukrytą tożsamością".

## At a glance

| ID    | Change ID                    | Outcome (może …)                                             | Prerequisites | PRD refs              | Status   |
| ----- | ---------------------------- | ------------------------------------------------------------ | ------------- | --------------------- | -------- |
| F-01  | reservation-privacy-tests    | (foundation) harness pgTAP dowodzący, że tożsamość rezerwującego nigdy nie wycieka | —             | FR-010, Guardrails    | done     |
| S-01  | auth-and-first-list          | użytkownik zarejestrować się/zalogować i mieć własną listę    | —             | FR-001, FR-002, FR-003 | done     |
| S-02  | add-gift                     | Życzący dodać prezent (nazwa, link, cena, opcjonalnie zdjęcie) | S-01          | FR-005                | done     |
| S-03  | share-link-and-guest-access  | udostępnić listę linkiem; gość otworzyć link i zobaczyć listę ze statusami | S-02          | FR-007, FR-008, FR-010 | proposed |
| S-04  | reserve-gift-hidden-identity | Obdarowujący zarezerwować wolny prezent; status widoczny natychmiast, tożsamość ukryta | S-03, F-01    | US-01, FR-009, FR-010 | proposed |
| S-05  | mark-gift-purchased          | rezerwujący oznaczyć zarezerwowany prezent jako zrealizowany | S-04          | FR-011                | proposed |
| S-06  | protected-deletes            | usunąć listę/prezent tylko, gdy żadna rezerwacja go nie chroni | S-04          | FR-004, FR-006        | proposed |

## Streams

Pomoc nawigacyjna — grupuje elementy współdzielące łańcuch Prerequisites. Kanoniczna kolejność żyje w grafie zależności poniżej; ta tabela to proponowana kolejność czytania między równoległymi ścieżkami.

| Stream | Theme                         | Chain                                      | Note |
| ------ | ----------------------------- | ------------------------------------------ | ---- |
| A      | Pętla rezerwacji (ukryta tożsamość) | `F-01` → `S-04` → `S-05` → `S-06`          | Serce hipotezy — walidacja niespodzianki; czytane pierwsze przy celu `speed`. |
| B      | Lista i udostępnianie         | `S-01` → `S-02` → `S-03`                   | Ścieżka właściciela; dołącza do Stream A przy `S-04`. |

## Baseline

Co jest już na miejscu w kodzie (stan na `2026-10-05`, auto-researched + potwierdzone). Foundations poniżej zakładają, że to jest obecne, i NIE przebudowują tego.

- **Frontend:** partial — szkielet Expo SDK 57 (`expo-router`, ekrany starterowe); brak ekranów produktu; klient Supabase podpięty (`src/lib/supabase.ts:17`); scheme w `app.json` to `bootstrapscaffold` (do zmiany przy linku udostępniania).
- **Backend / API:** present — migracja `supabase/migrations/20261005113900_initial_schema.sql` (tabele, RLS, security-definer RPC, widok statusów); brak custom serwera.
- **Data:** partial — schema obecna; brak testów pgTAP (`supabase/tests/`).
- **Auth:** present — provider email w `supabase/config.toml`; klient z PKCE + wiring AppState; włączenie providera w hosted (dashboard) niepotwierdzone.
- **Deploy / infra:** absent — brak `eas.json`, brak CI/CD, brak git remote.
- **Observability:** absent.

## Foundations

### F-01: Weryfikacja prywatności rezerwacji (harness pgTAP)

- **Outcome:** (foundation) działa lokalny harness testowy `supabase/tests/` (pgTAP), uruchamiany przez `supabase test db`, który jako role `authenticated` (Życzący i Obdarowujący) dowodzi, że `reservations` / `reservation_status` nigdy nie ujawniają tożsamości rezerwującego.
- **Change ID:** reservation-privacy-tests
- **PRD refs:** FR-010, Guardrails („tożsamość nigdy nie wycieka")
- **Unlocks:** S-04 (gwiazda przewodnia — jej weryfikowalność), S-05.
- **Prerequisites:** — (schema i RPC już obecne w migracji z Baseline; to jest harness weryfikacyjny, nie budowa warstwy danych)
- **Parallel with:** S-01, S-02
- **Blockers:** —
- **Unknowns:** — (decyzja o podpięciu do CI pozostaje w Parked)
- **Risk:** Fałszywe zielone testy, jeśli pgTAP nie działa jako rola `authenticated` (a np. `postgres`); role testowe muszą odwzorowywać właściciela vs. członka (Risk #1 z infra.md).
- **Status:** done

## Slices

### S-01: Konto i pierwsza lista

- **Outcome:** Użytkownik (Życzący) może się zarejestrować lub zalogować (email + hasło) i trafić na swoją listę prezentową (pustą, z nazwą).
- **Change ID:** auth-and-first-list
- **PRD refs:** FR-001, FR-002, FR-003
- **Prerequisites:** — (klient Supabase i provider email obecne w Baseline; hosted E2E wymaga bramki z `## Open Roadmap Questions` #1)
- **Parallel with:** F-01
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Wrażliwy na wiring tokenów (PKCE/AppState) — brak `startAutoRefresh` przy wznawianiu aplikacji daje ciche wylogowania (Risk #5 z infra.md).
- **Status:** done

### S-02: Dodawanie prezentu

- **Outcome:** Życzący może dodać prezent (nazwa, link, cena, opcjonalnie zdjęcie) i zobaczyć go na swojej liście.
- **Change ID:** add-gift
- **PRD refs:** FR-005
- **Prerequisites:** S-01
- **Parallel with:** F-01
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Walidacja danych wejściowych (link, cena ≥ 0); zdjęcie tylko jako URL — brak decyzji storage (poza zakresem MVP).
- **Status:** done

### S-03: Link udostępniania i widok gościa

- **Outcome:** Życzący może wygenerować link udostępniania; Obdarowujący po otwarciu linka i zalogowaniu widzi listę ze statusami (wolny/zarezerwowany/zrealizowany).
- **Change ID:** share-link-and-guest-access
- **PRD refs:** FR-007, FR-008, FR-010
- **Prerequisites:** S-02 (lista z prezentami do pokazania)
- **Parallel with:** —
- **Blockers:** —
- **Unknowns:** „Czy deep link `giftlist://list/<token>` działa w Expo Go, czy wymaga dev build (zmiana scheme w `app.json` i `expo-linking`)?" — Owner: team. Block: no.
- **Risk:** Zmiana scheme (`bootstrapscaffold` → `giftlist`) dotyka konfiguracji natywnej; to pierwszy użytek widoku statusów (FR-010) i wzorca membership (`open_shared_list`).
- **Status:** proposed

### S-04: Rezerwacja prezentu (gwiazda przewodnia)

- **Outcome:** Obdarowujący może zarezerwować wolny prezent; status staje się natychmiast widoczny dla wszystkich, a tożsamość rezerwującego nie jest widoczna dla nikogo.
- **Change ID:** reserve-gift-hidden-identity
- **PRD refs:** US-01, FR-009, FR-010
- **Prerequisites:** S-03, F-01
- **Parallel with:** —
- **Blockers:** —
- **Unknowns:** „Czy Realtime gwarantuje natychmiastową widoczność statusu, czy klient potrzebuje optymistycznego update po `reserve_gift` + refetch fallback (np. `useFocus`)?" — Owner: team. Block: no.
- **Risk:** Wyścig dwóch rezerwujących — RPC `reserve_gift` jest atomowy (`update … where status = 'free'` + guard), ale UI musi pokazywać status niezależnie od lagu Realtime (Risk #3/#9 z infra.md).
- **Status:** proposed

### S-05: Oznaczanie jako zrealizowany

- **Outcome:** Obdarowujący, który zarezerwował prezent, może oznaczyć go jako zrealizowany (kupiony) — wyraźne zamknięcie cyklu.
- **Change ID:** mark-gift-purchased
- **PRD refs:** FR-011
- **Prerequisites:** S-04
- **Parallel with:** S-06
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Kontrola tożsamości rezerwującego (`my_reserved_gift_ids`) — właściciel listy nie może oznaczać cudzej rezerwacji jako zrealizowanej.
- **Status:** proposed

### S-06: Usuwanie z ochroną rezerwacji

- **Outcome:** Życzący może usunąć listę tylko, gdy żaden prezent na niej nie ma rezerwacji; może usunąć prezent tylko, gdy jest wolny.
- **Change ID:** protected-deletes
- **PRD refs:** FR-004, FR-006
- **Prerequisites:** S-04 (rezerwacje istnieją, by ich strzec)
- **Parallel with:** S-05
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Odmowa musi być komunikowana z wyjaśnieniem (PRD: „odmowa z wyjaśnieniem") — inaczej użytkownik nie rozumie, dlaczego delete nie przechodzi.
- **Status:** proposed

## Backlog Handoff

| Roadmap ID | Change ID                    | Suggested issue title                                     | Ready for `/10x-plan` | Notes |
| ---------- | ---------------------------- | -------------------------------------------------------- | --------------------- | ----- |
| F-01       | reservation-privacy-tests    | RLS: pakiet pgTAP dowodzący ukrycia tożsamości rezerwującego | yes                   | Run `/10x-plan reservation-privacy-tests` — odblokowuje S-04 |
| S-01       | auth-and-first-list          | Rejestracja/logowanie + pierwsza lista użytkownika        | yes                   | Run `/10x-plan auth-and-first-list` |
| S-02       | add-gift                     | Dodawanie prezentów do listy                             | no                    | done — zrealizowane (FR-005) |
| S-03       | share-link-and-guest-access  | Link udostępniania i widok listy dla gościa               | yes                   | S-02 done — gotowe do `/10x-plan` |
| S-04       | reserve-gift-hidden-identity | Rezerwacja prezentu z ukrytą tożsamością                 | no                    | gwiazda przewodnia; czeka na S-03, F-01 |
| S-05       | mark-gift-purchased          | Oznaczanie rezerwacji jako zrealizowanej                 | no                    | czeka na S-04 |
| S-06       | protected-deletes            | Usuwanie listy/prezentu z ochroną rezerwacji             | no                    | czeka na S-04 |

## Open Roadmap Questions

1. **Czy hosted Supabase project (`bdbgjyzypmrkvbhfilqj`) ma włączonego providera Email i Realtime (bramka dashboardu, deploy-plan §7.1)?** — Owner: user. Block: S-01 (tylko weryfikacja E2E na hosted; lokalny `supabase start` nie jest zablokowany).

## Parked

- **Scraping metadanych z linków (Open Graph)** — Poza zakresem MVP (PRD Non-Goals); przyszła funkcja.
- **Powiadomienia (email/push)** — Poza zakresem MVP (PRD Non-Goals); użytkownicy sprawdzają listę sami.
- **Wiele list na użytkownika** — Poza zakresem MVP (PRD Non-Goals); unikalny indeks `gifts_lists.owner_id` łatwy do usunięcia.
- **Edycja prezentu po dodaniu** — Poza zakresem MVP (PRD Non-Goals); MVP: tylko dodaj/usuń wolny.
- **Self-reservation** — Poza zakresem MVP (PRD Non-Goals); Życzący wie sam, co kupuje.
- **OAuth / passwordless** — Zdeferowane przy celu `speed`; MVP = email + hasło.
- **CI/CD + git remote (GHA auto-deploy-on-merge, `supabase db push`, `supabase test db` w CI)** — Zdeferowane (deploy-plan: następny milestone); F-01 definiuje testy, które CI potem odpalą.
- **EAS Build + publikacja do sklepów (App Store / Google Play)** — Zdeferowane (deploy-plan: następny milestone); bramki kont/kluczy są manualne.
- **Obserwowalność (sentry/logi/metrics)** — Zdeferowane; brak NFR wymuszających infra obserwowalności w MVP.

## Milestone History

(Do pierwszej generacji pusta; wpisy dopisuje zamknięcie kamienia milowego.)

## Done

- **S-01: Konto i pierwsza lista** — Użytkownik (Życzący) może się zarejestrować lub zalogować (email + hasło) i trafić na swoją listę prezentową (pustą, z nazwą). — Archived 2026-10-16 → `context/archive/2026-10-16-auth-and-first-list/`. Lesson: —.
