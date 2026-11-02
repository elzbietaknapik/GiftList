# Share Link and Guest Access — Plan Brief

> Full plan: `context/changes/share-link-and-guest-access/plan.md`
> Research: `context/changes/share-link-and-guest-access/expo-linking-research.md`, `…/navigation-auth-research.md`

## What & Why

Życzący udostępnia swoją listę linkiem `giftlist://list/<token>`. Obdarowujący otwiera link, loguje się i widzi prezenty ze statusami (Wolny / Zarezerwowany / Zrealizowany), bez ujawniania, kto zarezerwował. To pierwszy widok statusów (FR-010) i fundament pod rezerwację w S-04 (roadmap S-03).

## Starting Point

S-01 (konto i lista) oraz S-02 (dodawanie prezentów) są gotowe. Baza ma już `share_token` dla każdej listy, RPC `open_shared_list` i RLS pozwalający członkom czytać `gifts.status`. Brakuje: schematu `giftlist` w `app.json` (dziś `bootstrapscaffold`), `expo-dev-client`, elementu udostępniania na ekranie właściciela, przechwytywania linku oraz ekranu gościa.

## Desired End State

Właściciel widzi i udostępnia swój link z ekranu listy. Gość, który otworzy link (po zalogowaniu, także po przekierowaniu do logowania), trafia na listę z aktualnymi statusami prezentów, tylko do odczytu. Weryfikacja: `tsc` i `expo lint` przechodzą, kontrole manualne na development build.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
|----------|--------|------------------|--------|
| Format linku | `giftlist://list/<share_token>` (custom scheme) | Zgodne z ustaleniami research; nie wymaga hostingu web | Research (D1, D3, D4) |
| Build natywny | Lokalny `npx expo run:android\|ios` | Bez konta EAS i bez nowej konfiguracji `eas.json` | Plan (pytanie 2) |
| Widok gościa | Trasa `src/app/(app)/list/[token].tsx` | Expo Router routuje link automatycznie do prawdziwego URL | Plan (pytanie 3) |
| Oczekujący token | Tylko w pamięci | Najprostsze, zgodne z celem szybkości MVP; ryzyko zaakceptowane | Plan (pytanie 4) |
| Regeneracja linku | Brak, link stały | Mniejszy zakres; brak nowej logiki unieważniania | Plan (pytanie 5) |
| Odczyt statusów | `gifts.status` przez RLS, bez `reservation_status` | Status nie ujawnia tożsamości; widok nie potrzebuje identity | Plan (analiza schematu) |
| Dołączenie do listy | RPC `open_shared_list` przed `listGifts` | Członkostwo jest wymagane przez `select_gifts` | Research (D8) |
| Udostępnianie | `Share` z `react-native`, bez nowej zależności | Wbudowane API; brak `expo-clipboard` | Plan (decyzja własna) |

## Scope

**In scope:** konfiguracja scheme i dev-client; helpery linku i walidacja UUID; `openSharedList`; karta linku na ekranie właściciela; provider przechwytywania i bufor po zalogowaniu; ekran gościa tylko do odczytu.

**Out of scope:** rezerwacja i realtime (S-04); oznaczanie zrealizowanego (S-05); usuwanie z ochroną (S-06); regeneracja linku; migracje i RLS; testy E2E w Playwright i scaffolding testowy; `eas.json`; Universal/App Links.

## Architecture / Approach

Dane i walidacja w `src/lib/` (`share-link.ts`, `share-link.tsx`, `lists.ts`). Ekrany tylko wywołują te funkcje. Root layout montuje `ShareLinkProvider` wewnątrz `SessionProvider`: gdy sesji nie ma, token trafia do bufora; po zalogowaniu `(app)/_layout.tsx` kieruje do `/list/[token]`, który wywołuje RPC i potem `listGifts`.

## Phases at a Glance

| Phase | What it delivers | Key risk |
|-------|------------------|----------|
| 1. Native config | Scheme `giftlist` + dev build | Stary build bez nowego scheme; brak lokalnego toolchain |
| 2. Data layer | `buildShareUrl`, `parseShareToken`, `openSharedList` | Pusty wynik RPC dla złego tokenu bez komunikatu |
| 3. Owner link | Karta z linkiem i akcją `Share` | Brak dostępnego arkusza udostępniania na web |
| 4. Deep link + buffer | Przechwycenie linku i przekierowanie po logowaniu | Podwójna nawigacja; kontrole manualne zależą od Fazy 5 |
| 5. Guest view | Lista ze statusami, tylko do odczytu | Typed routes wymagają regeneracji przed `tsc` |

**Prerequisites:** S-02 `done` (spełnione); lokalne Android Studio lub Xcode; zalogowane dwa konta testowe (właściciel i gość).
**Estimated effort:** ~2–3 sesje przez 5 faz; najwięcej czasu w Fazie 1 (build natywny).

## Open Risks & Assumptions

- Link `giftlist://` nie jest klikalny we wszystkich komunikatorach (zaakceptowane).
- Oczekujący token ginie, jeśli aplikacja zostanie zabita na ekranie logowania (zaakceptowane).
- Statusy są migawką z otwarcia ekranu, bez odświeżania na żywo do S-04.
- `package.json` zawiera `vitest` i Playwright; nie są używane w tym zakresie.
- Owner otwierający własny link zostaje dodany jako członek (nieszkodliwe).

## Success Criteria (Summary)

- Właściciel kopiuje/udostępnia link `giftlist://list/<uuid>` z ekranu listy.
- Gość po zalogowaniu widzi wszystkie prezenty ze statusami i nie widzi tożsamości rezerwującego.
- Niezalogowany gość trafia do logowania, a po nim do listy, bez utraty tokenu (w tej samej sesji aplikacji).
- `npx tsc --noEmit` i `npx expo lint` przechodzą.
