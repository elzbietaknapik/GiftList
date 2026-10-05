---
project: "GiftList"
version: 1
status: draft
created: 2026-09-28
context_type: greenfield
product_type: mobile
target_scale:
  users: small
  qps: low
  data_volume: small
timeline_budget:
  mvp_weeks: 5
  hard_deadline: 2026-11-04
  after_hours_only: false
---

## Vision & Problem Statement

Istniejące narzędzia do list życzeń (Amazon Wishlist, Listonic itp.) są zamknięte w ekosystemie jednego sklepu. Brakuje prostego sposobu, żeby zebrać linki do produktów z dowolnych sklepów internetowych w jedną listę i udostępnić ją bliskim z możliwością rezerwacji prezentów.

Narzędzia wish-list zakładają zakupy w jednym sklepie. Ludzie chcą prezenty z różnych źródeł — potrzebują listy agnostycznej wobec sklepu, z rezerwacją ukrytą przed właścicielem listy, żeby zachować element niespodzianki.

## User & Persona

**Główna persona: Osoba tworząca listę życzeń (Życzący)**

Ktoś, kto przed okazją (urodziny, święta, ślub) zbiera pomysły na prezenty z różnych sklepów internetowych. Chce je zebrać w jednym miejscu i udostępnić bliskim — tak, żeby nie musieć powtarzać każdemu osobno „co mi kupić". Sięga po narzędzie, gdy bliscy pytają, czego sobie życzy.

## Success Criteria

### Primary
- Życzący może stworzyć listę prezentową, dodać prezenty (nazwa, link, cena, opcjonalnie zdjęcie) i udostępnić listę przez link.
- Obdarowujący po otwarciu linka i zalogowaniu widzi listę z prezentami i ich statusami (wolny/zarezerwowany/zrealizowany) i może zarezerwować wolny prezent.
- Życzący widzi statusy prezentów na swojej liście, ale żadna ścieżka nie ujawnia tożsamości rezerwującego.

### Secondary
- Obdarowujący może oznaczyć zarezerwowany prezent jako zrealizowany (kupiony) — wyraźne zamknięcie cyklu.

### Guardrails
- Ukrycie tożsamości rezerwującego — fundament niespodzianki; żadna ścieżka w aplikacji nie może ujawnić *kto* zarezerwował dany prezent (ani Życzącemu, ani innym Obdarowującym).
- Trwałość danych prezentów — po dodaniu prezentu dane nie mogą zniknąć; brak utraty danych użytkownika.

## User Stories

### US-01: Obdarowujący rezerwuje prezent z udostępnionej listy

- **Given** zalogowany Obdarowujący, który otworzył link udostępnionej listy
- **When** widzi listę prezentów ze statusami (wolny/zarezerwowany/zrealizowany) i klika „Zarezerwuj" przy wolnym prezencie
- **Then** prezent zmienia status na „zarezerwowany", a tożsamość rezerwującego nie jest widoczna dla nikogo innego

#### Acceptance Criteria
- Prezent ze statusem „zarezerwowany" lub „zrealizowany" nie może być ponownie zarezerwowany
- Status prezentów jest widoczny dla wszystkich (Życzący i Obdarowujący), ale tożsamość rezerwującego — nie
- Po rezerwacji prezent jest natychmiast widoczny jako zarezerwowany dla wszystkich przeglądających listę

## Functional Requirements

### Authentication
- FR-001: Życzący can register and log in. Priority: must-have
  > Socrates: Counter-argument considered: "requiring registration for Obdarowujący creates friction." Resolution: kept; internal identity of the reserving user requires an account.
- FR-002: Obdarowujący can register and log in. Priority: must-have
  > Socrates: same as FR-001 — registration barrier accepted.

### Gift List
- FR-003: Życzący can create one gift list with a name. Priority: must-have
  > Socrates: Counter-argument considered: "one list per user limits use for multiple occasions." Resolution: changed from multiple lists to one — simpler MVP; multiple lists are nice-to-have.
- FR-004: Życzący can delete their gift list only if no gift on it has a reservation. Priority: must-have
  > Socrates: Counter-argument considered: "deleting a list with reservations silently removes someone else's commitment." Resolution: changed — delete blocked when any reservation exists.

### Gifts
- FR-005: Życzący can add a gift to their list (name, link, price, optional image). Priority: must-have
  > Socrates: No counter-argument; it stands as written.
- FR-006: Życzący can remove a gift from their list only if the gift is unreserved. Priority: must-have
  > Socrates: Counter-argument considered: "removing a reserved gift silently breaks the Obdarowujący's commitment." Resolution: changed — removal blocked when gift is reserved or purchased.

### Sharing
- FR-007: Życzący can generate a shareable link for their list. Priority: must-have
  > Socrates: Counter-argument considered: "a single link gives access to anyone — if it leaks, strangers can reserve gifts." Resolution: kept; simple link is acceptable for gift lists in MVP.
- FR-008: Obdarowujący can open a shared link and view the list after logging in. Priority: must-have
  > Socrates: No counter-argument; it stands as written.

### Reservations
- FR-009: Obdarowujący can reserve an unreserved gift. Priority: must-have
  > Socrates: No counter-argument; it stands as written.
- FR-010: Any viewer can see which gifts are reserved or purchased, but not by whom. Priority: must-have
  > Socrates: Counter-argument considered: "hidden identity means two people might coordinate poorly outside the app." Resolution: kept; reservation status is sufficient — identity hidden is the surprise element.
- FR-011: Reserving user can mark a reserved gift as purchased (requires prior reservation). Priority: must-have
  > Socrates: Counter-argument considered: "'reserved' already blocks duplicates — 'purchased' adds state complexity." Resolution: kept; three statuses (free/reserved/purchased) give clear lifecycle closure.

## Non-Functional Requirements

- Interfejs użyteczny na telefonie i desktopie — większość Obdarowujących otworzy link na telefonie z komunikatora.
- Reakcja na akcję użytkownika (rezerwacja, dodawanie prezentu, ładowanie listy) poniżej 2 sekund.
- Tożsamość rezerwującego nigdy nie wycieka poza system — ani w odpowiedziach API, ani w URLach, ani w interfejsie.
- Aplikacja dostępna co najmniej 99% czasu — lista musi działać, gdy ktoś chce zarezerwować prezent przed okazją.

## Business Logic

Aplikacja zarządza cyklem życia prezentu (wolny → zarezerwowany → zrealizowany) ukrywając tożsamość rezerwującego przed wszystkimi innymi użytkownikami i blokując usuwanie/modyfikację zarezerwowanych elementów — chroniąc zobowiązanie Obdarowującego i niespodziankę.

Reguła konsumuje status prezentu, tożsamość aktualnie zalogowanego użytkownika i jego rolę wobec listy (właściciel vs. obdarowujący). Przy rezerwacji system zmienia status i przypisuje tożsamość rezerwującego wewnętrznie, ale nie ujawnia jej nikomu. Przy próbie usunięcia lub modyfikacji zarezerwowanego elementu — odmowa z wyjaśnieniem.

Obdarowujący klika „Zarezerwuj" na wolnym prezencie — status zmienia się natychmiast dla wszystkich. Życzący widzi zmianę statusu, ale nie wie kto stoi za rezerwacją. Obdarowujący, który zarezerwował, może oznaczyć prezent jako zrealizowany — zamykając cykl.

## Access Control

Model autoryzacji: Login (email + hasło / OAuth / passwordless). Wymagane konto dla obu ról.

Dwie role:
- **Życzący (właściciel listy):** Tworzy listę prezentową, dodaje prezenty (nazwa, link, cena, zdjęcie), udostępnia listę przez link. Widzi statusy prezentów (wolny/zarezerwowany/zrealizowany), ale NIE widzi kto zarezerwował.
- **Obdarowujący (przeglądający listę):** Widzi listę udostępnioną przez Życzącego. Może zarezerwować prezent, oznaczyć jako zrealizowany. Widzi statusy prezentów (wolny/zarezerwowany/zrealizowany), ale NIE widzi kto zarezerwował.

Niezalogowany użytkownik trafiający na link udostępnionej listy: przekierowanie do logowania/rejestracji, a po zalogowaniu — do widoku listy jako Obdarowujący.

## Non-Goals

- Brak automatycznego scrapingu metadanych z linków — MVP wymaga ręcznego wpisania nazwy, ceny i zdjęcia. Pobieranie Open Graph/meta to przyszła funkcja.
- Brak powiadomień (email/push) — MVP nie informuje o rezerwacjach ani zmianach na liście. Użytkownicy sprawdzają listę sami.
- Brak wielu list na użytkownika — MVP obsługuje jedną listę. Wiele list (np. na różne okazje) to przyszła funkcja.
- Brak edycji prezentu po dodaniu — MVP pozwala dodać lub usunąć (jeśli niezarezerwowany), ale nie edytować istniejącego prezentu.
- Brak self-reservation — Życzący nie rezerwuje prezentów u siebie; wie sam co kupuje.

## Open Questions

*Brak otwartych pytań — wszystkie sygnały kształtowania zostały rozwiązane podczas /10x-shape (quality_check_status: accepted).*
