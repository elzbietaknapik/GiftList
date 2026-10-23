# Dodawanie prezentu — Plan Brief

> Full plan: `context/changes/add-gift/plan.md`
> Research: none (decisions taken from PRD FR-005, roadmap S-02, schema review)

## What & Why

Życzący dodaje prezent do swojej listy — nazwę, link, cenę i opcjonalny URL zdjęcia — i widzi go na liście. To pierwszy krok w pętli „lista → prezenty → udostępnienie → rezerwacja" i zamyka FR-005 z PRD.

## Starting Point

Logowanie i pierwsza lista (S-01) działają: ekran `(app)/index.tsx` pokazuje listę użytkownika lub formularz jej utworzenia. Tabela `gifts` i polityki RLS dla wstawiania i odczytu są już w migracji, więc zmiana nie dotyka bazy. Prymitywy `Button`, `TextField`, `FormError` z `src/components/ui/` są gotowe.

## Desired End State

Na ekranie listy właściciel widzi formularz „Dodaj prezent" i pod nim listę prezentów z ceną w zł i statusem „Wolny". Błędne dane są odrzucane inline, poprawne zapisują się w bazie i przetrwają przeładowanie aplikacji.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Complexity | MEDIUM, 5 questions | Zakres obejmuje dane, formularz i ekran; większość decyzji rozstrzygnął PRD | Plan |
| Currency | PLN, pokazywane jako „zł", bez kolumny waluty | Polski UI i odbiorcy; zero zmian schematu | Plan (user) |
| Form placement | Inline na ekranie listy | Jeden ekran, bez nowej trasy i regeneracji typów | Plan (user) |
| Image | Opcjonalny URL http(s) | Spełnia FR-005 bez obsługi storage; zgodne z decyzją roadmapy | Plan (user) + Roadmap |
| Duplicates | Dozwolone | Schemat nie ma unikalności; warianty tego samego produktu są realne | Plan (user) |
| Link check | Trim + `URL` z protokołem http/https | Link jest otwierany przez gości; odrzuca literówki i nie-webowe schematy | Plan (user) |
| Price | Wymagana, ≥ 0, ≤ 2 miejsca, przecinek lub kropka | Schemat `numeric(10,2) NOT NULL CHECK (price >= 0)` | Schema |
| Validation location | Czysta funkcja `parseGiftInput` w `src/lib/gifts.ts` | Jedno miejsce reguł; gotowe pod przyszły test | Plan |
| Owner view | Tylko `gifts.status` | Tożsamość rezerwującego nie jest czytana ani wyświetlana (PRD guardrail) | PRD |

## Scope

**In scope:** `src/lib/gifts.ts` (typ, `listGifts`, `addGift`, `parseGiftInput`); `AddGiftForm`; `GiftList`; aktualizacja `ListEmptyState` i `(app)/index.tsx`.

**Out of scope:** edycja i usuwanie prezentów (S-06); link udostępniania i widok gościa (S-03); rezerwacje i statusy zmieniane przez użytkowników (S-04/S-05); scraping metadanych; upload zdjęć; wybór waluty; blokada duplikatów; nowa trasa; zmiany w `supabase/`.

## Architecture / Approach

Ekran `(app)/index.tsx` trzyma listę i prezenty. `AddGiftForm` woła `parseGiftInput`, potem `addGift(listId, …)` i przekazuje wynik do `onAdded`. `GiftList` renderuje tablicę prezentów. Bezpieczeństwo własności egzekwuje RLS (`insert_gifts`, `select_gifts`), nie klient.

```
index.tsx ──listGifts(list.id)──► gifts (RLS: owner)
   │
   ├── AddGiftForm ──parseGiftInput──► addGift(list.id, …) ──► gifts (RLS insert: owner)
   └── GiftList (status only)
```

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Dane i walidacja | `gifts.ts`: typ, odczyt, zapis, `parseGiftInput` | Format liczby z przecinkiem i limit `numeric(10,2)` |
| 2. Formularz | `AddGiftForm` na prymitywach `ui/` z błędami inline | Klawiatura i błędy na web vs native (`keyboardType`, `aria-describedby`) |
| 3. Lista i ekran | `GiftList`, stan pusty, przewijany ekran | `flex: 1` w `ListEmptyState` psuje układ w `ScrollView` |

**Prerequisites:** S-01 zrealizowane (zalogowany użytkownik z listą); `ui-first-list-screen` zaimplementowane (prymitywy `ui/`); brak zmian w bazie.
**Estimated effort:** ~1 sesja, 3 fazy z ręcznymi zatrzymaniami na weryfikację.

## Open Risks & Assumptions

- Zakładamy, że PostgREST zwraca `numeric` jako liczbę JSON; mapowanie `Number(...)` chroni przed stringiem.
- Link bez schematu (np. `example.com`) zostanie odrzucony — akceptowane świadomie w decyzji „Require http(s) URL".
- Duplikaty linków są dozwolone; użytkownik może dodać ten sam prezent dwa razy przy podwójnym kliknięciu, mimo guarda `saving`.
- Brak testów automatycznych dla `parseGiftInput` do czasu dodania runnera.

## Success Criteria (Summary)

- Życzący dodaje prezent z ceną `12,50` i widzi go jako `12,50 zł — Wolny` po odświeżeniu ekranu.
- Każdy niepoprawny wpis (pusta nazwa, zły link, cena ujemna lub nie-liczba, zdjęcie spoza http(s)) jest odrzucony z komunikatem przy właściwym polu.
- `npx tsc --noEmit` i `npx expo lint` przechodzą; brak literałów kolorów w zmienionych widokach.
