---
type: observability-audit
date: 2026-10-30 14:38
mode: audit
commit: fe9992e
branch: master
dirty_tree: true
areas: [reservations, gifts]
area_source: arguments
runtime_proof: not-run
error_tracker: none in repo (unknown / assumed external — see Assumptions)
previous_report: null
findings: { critical: 2, high: 4, medium: 10, low: 2 }
---

# Audyt obserwowalności — reservations, gifts (2026-10-30)

> **Zakres faktów:** audyt dotyczy commita `fe9992e` na `master` z brudnym drzewem roboczym.
> Użytkownik potwierdził: **„Jeszcze nie ma produkcji”** — brak ruchu produkcyjnego.
> W repo nie ma żadnego SDK trackera błędów; wszystkie ustalenia są **statyczne**.

## 1. TL;DR

- **Każda obsłużona awaria kończy się jako string w stanie Reacta** — w `src/` nie ma ani jednego `console.*`, wywołania trackera, `ErrorBoundary` ani globalnego handlera. Nawet tracker skonfigurowany poza repo nigdy nie dostanie zdarzenia, bo kod nigdy go nie woła (`P-02`).
- **Bootstrap sesji potrafi zawiesić całą aplikację na zawsze bez śladu:** `getSession().then(...)` bez `.catch` nie wyłącza `loading`, a root layout przy `loading` zwraca `null` (`P-03`). To najbardziej kosztowna pojedyncza luka.
- **Warstwa danych niszczy diagnozę:** każde `PostgrestError` / `AuthError` jest zamieniane na `new Error(error.message)`, więc `code`, `details`, `hint`, `status` i `cause` znikają zanim ktokolwiek (UI albo tracker) może ich użyć (`P-01`).
- **Awaria backendu wygląda jak normalny stan produktu:** nieudany `getMyList` renderuje „Utwórz swoją pierwszą listę”, nieudany `listGifts` renderuje „Nie dodano jeszcze prezentów” (`G-01`).
- **Rezerwacje istnieją tylko w bazie.** W `src/` nie ma wywołania `.rpc(`; S-03/S-04/S-05/S-06 są `proposed`. Wszystkie odmowy RPC to jeden `P0001` z gołym komunikatem, bez `errcode`, `detail` i kontekstu — S-04 odziedziczy to bez zmian (`R-01`, `R-05`, `R-06`).
- **Jeden spójny wniosek:** w tym kodzie „brak wyjątku” jest jedynym sygnałem sukcesu, a „komunikat w formularzu” jedynym sygnałem porażki — dla użytkownika i dla reagującego.

## 2. Capture model

**Runtime i platforma**
- Klient Expo SDK 57 / React Native 0.86 z Expo Router (`package.json:6-42`); routing plikowy w `src/app/`, root layout `src/app/_layout.tsx`.
- Opcjonalny statyczny eksport web (`app.json` → `web.output: "static"`), więc część renderowania dzieje się w Node przy buildzie, a część w przeglądarce.
- Backend to Supabase (PostgREST + GoTrue + Realtime); **brak własnego serwera, edge functions, workerów, cronów i kolejek** w repo. Cała logika rezerwacji jest w SQL (`supabase/migrations/`).

**Tracker błędów**
- Brak. `package.json:6-42` nie zawiera Sentry/Datadog/Rollbar/Bugsnag/Honeybadger/Crashlytics/OTel; w `src/` nie ma inicjalizacji. Traktowane jako **nieznane** (może być poza repo), nie jako brak.

**Granice przechwytywania**
- Brak `ErrorBoundary` w całym `src/app/` (potwierdzone: `Select-String` po `ErrorBoundary` → 0 trafień).
- Brak `ErrorUtils.setGlobalHandler`, `window.onerror`, `unhandledrejection`, `process.on` w kodzie aplikacji.
- Expo Router montuje `Try` tylko dla tras eksportujących `ErrorBoundary` — żadna trasa go nie eksportuje, a `Try` ma tylko `getDerivedStateFromError`, bez `componentDidCatch`, więc nawet gdyby był, nic nie raportuje.
- Wniosek: przechwycone błędy nie opuszczają `catch`; nieprzechwycone trafiają wyłącznie do domyślnego handlera runtime (konsola/native exceptions manager), bez trasy, użytkownika i wersji.

**Logowanie**
- Zero wywołań `console.*` i zero loggera w `src/` (jedyne `console.*` w repo są w `scripts/reset-project.js`).
- Brak celu logów, brak poziomów, brak serializacji obiektów błędów.

**Czyszczenie i próbkowanie**
- Brak `beforeSend`, filtrów PII, próbkowania i list ignorowania w kodzie. Nic nie jest redagowane, bo nic nie jest wysyłane.

**Tożsamość wdrożenia**
- `app.json:3-8`: `name`/`slug` = `.bootstrap-scaffold`, `scheme` = `bootstrapscaffold`, `version` = `1.0.0`; brak `runtimeVersion`, `buildNumber`/`versionCode`, brak tagu środowiska w kodzie. `.env.example` i `.env.local` zawierają tylko URL i klucz Supabase.
- Preview/staging i produkcja nie są rozdzielone niczym, co widać w repo.

**Assumptions (poza repo, nie są ustaleniami):**
- platforma hostingowa zbiera logi/console i nieprzechwycone wyjątki — **niepotwierdzone**;
- istnieje tracker błędów skonfigurowany w panelu, mimo braku SDK w repo — **niepotwierdzone**;
- logi PostgREST/GoTrue/Postgres w Supabase są włączone i retencjonowane — **niepotwierdzone**;
- staging i produkcja używają różnych projektów/DSN — **niepotwierdzone**;
- source mapy dla web exportu są uploadowane — **niepotwierdzone**.

## 3. What reaches the tracker

Dowód runtime **nie został uruchomiony** (brak produkcji; użytkownik nie prosił o `--runtime`). Poniżej wersja statyczna — „tracker” oznacza „czy istnieje jakikolwiek kod, który by tam trafił”.

| Failure shape | Response / stan UI | Logi platformy | Tracker | Verdict |
|---|---|---|---|---|
| `getSession()` odrzucone (sieć, storage, refresh) | wieczny `null` z root layoutu → blank/splash | nic | nic | **missed** (`P-03`) |
| `listGifts` / `getMyList` odrzucone | stan „brak listy / brak prezentów” + linia błędu | nic | nic | **missed / misclassified** (`G-01`) |
| `addGift` / `createList` / login odrzucone | komunikat w `FormError` | nic | nic | **missed** (`G-02`, `P-01`) |
| `signOut()` odrzucone | brak zmiany UI, sesja może zostać | nic (wynik `{error}` odrzucony) | nic | **missed** (`P-04`) |
| `open_shared_list` zły token | zero wierszy → „brak listy” | request PostgREST | nic | **missed** (`R-02`) |
| `open_shared_list` jako `anon` | `23502` not-null, surowy komunikat | request PostgREST | nic | **poor** (`R-03`) |
| `reserve_gift` odmowa | `P0001` + komunikat tekstowy (gdy S-04 podłączy UI) | request PostgREST | nic | **poor** (`R-01`) |
| render crash | domyślny ekran/błąd Reacta | konsola / native handler | nic | **poor** (`P-02`) |
| brak env Supabase | throw przy ładowaniu modułu | goły stack runtime | nic | **poor** (`P-06` pośrednio) |

## 4. Systemic root causes

1. **Message-only error funnel w warstwie danych.** `src/lib/gifts.ts:98-100,111-113` i `src/lib/lists.ts:24-26,42-47` zamieniają `PostgrestError` na `new Error(error.message)`. `code`/`details`/`hint`/`status`/`cause` giną, zanim ktokolwiek może je zalogować lub zgrupować. Ten sam wzorzec jest w `src/app/(auth)/login.tsx:9-11`, `register.tsx:10-13` i `session.tsx:48`. Wyjaśnia `P-01`, `G-02`, `R-01` i większość `G-05`.
2. **Brak szwu inicjalizacji i brak granic.** Nie ma miejsca, które raz na starcie instaluje globalne handlery, czyta wersję/środowisko i udostępnia `reportError`. Najbliżej są `SplashScreen.preventAutoHideAsync()` w `src/app/_layout.tsx:8` i throw przy imporcie `src/lib/supabase.ts:10-14` — oba fire-and-forget i nieobserwowalne. Wyjaśnia `P-02`, `P-04`, `P-05`, `P-06`.
3. **`loading` i „brak danych” są sklejone z porażką.** `session.tsx:21-25` ustawia `setLoading(false)` tylko w `.then`; `index.tsx:31-60` po błędzie zostawia `list`/`gifts` jako `null`/`[]`, a render (`index.tsx:89-105`) traktuje to jako normalny stan. Wyjaśnia `P-03`, `G-01`, `R-02`.
4. **Sukces = brak wyjątku.** `reserve_gift` i `mark_gift_purchased` zwracają `void` (`20261005113900_initial_schema.sql:105,120`), a drugi `update` w `mark_gift_purchased` nie ma guardu ani `if not found` (`:126`). Klient nie ma czym potwierdzić, że operacja faktycznie zmieniła stan. Wyjaśnia `R-04`, `R-05`.
5. **Instrumentacja istnieje, ale nie jest podłączona.** Publikacja Realtime dla `gifts` jest włączona (`20261005113900_initial_schema.sql:141`), ale w `src/` nie ma żadnego `.channel()`/`.subscribe()` ani refetchu na focus; `vitest` obejmuje `src/**`, lecz w `src/` nie ma testów. Wyjaśnia `G-03`, `P-07`.

## 5. Findings by area

### 5.1 Reservations (warstwa SQL + przyszły klient)

> W tym commicie **nie ma klienta rezerwacji**: `Select-String` po `\.rpc\(` w `src/` → 0 trafień. Roadmapa: S-03/S-04/S-05/S-06 = `proposed`. Ustalenia dotyczą serwerowego kontraktu, który S-04 odziedziczy bez zmian.

| # | Location | Category | Severity | What happens in production | Fix direction |
|---|---|---|---|---|---|
| R-01 | `supabase/migrations/20261005113900_initial_schema.sql:112,114,125` + `src/lib/gifts.ts:99,112` | flattened-response / identity-lost | high | Wszystkie odmowy RPC to jeden `P0001` z gołym tekstem („no access to this list”, „gift is not free”, „only the reserver…”). Gdy S-04 podłączy UI przez istniejący funnel, „brak dostępu”, „ktoś mnie ubiegł” i awaria bazy są nierozróżnialne dla użytkownika i dla reagującego; `code` jest już wyrzucony w kliencie. | Nadać każdej odmowie własny `errcode` (np. `gift_no_access`, `gift_not_free`, `not_reserver`) i zachować `error.code` w typowanym błędzie klienta. |
| R-02 | `supabase/migrations/20261005113900_initial_schema.sql:96-102` | missing-throw / swallowed | high | `open_shared_list` robi `insert … on conflict do nothing` i `select … where share_token = p_token` bez `if not found`. Zły/wygasły token zwraca zero wierszy — gość widzi „brak listy”, nie odróżnia złego linku od pustej listy i od awarii; odpowiedź PostgREST jest jedynym śladem. | Po `select` dodać `if not found then raise exception 'invalid share token' errcode …`. |
| R-03 | `supabase/migrations/20261005113900_initial_schema.sql:98` (`list_members.user_id` NOT NULL, `:29`) | flattened-response / noise | medium | `anon` nadal ma EXECUTE na RPC (potwierdzone w `context/changes/reservation-privacy-tests/reviews/impl-review.md`), więc wywołanie z wygasłą sesją wstawia `NULL` do `user_id` i kończy się `23502` „violates not-null constraint”. Użytkownik widzi surowy błąd bazy, a reagujący — coś, co wygląda jak korupcja danych, nie jak utracona sesja. | Na początku funkcji: `if auth.uid() is null then raise exception 'must be signed in' errcode …`, plus `revoke execute … from anon`. |
| R-04 | `supabase/migrations/20261005113900_initial_schema.sql:122-127` | missing-throw | medium | `mark_gift_purchased` sprawdza `if not found` dla rezerwacji, ale potem robi `update public.gifts set status = 'purchased' where id = p_gift_id;` bez `and status = 'reserved'` i bez `if not found`. Przy rozjeździe wierszy funkcja zwraca sukces bez zamierzonej zmiany stanu. | Dodać `and status = 'reserved'` i `if not found then raise …` do drugiego update. |
| R-05 | `supabase/migrations/20261005113900_initial_schema.sql:105,120` | flattened-response (success channel) | medium | `reserve_gift` i `mark_gift_purchased` zwracają `void`; jedynym sygnałem sukcesu jest brak wyjątku. Klient nie dostaje id rezerwacji, więc nie może potwierdzić „wygranej”, zalogować sukcesu ani skorelować go z późniejszym `my_reserved_gift_ids()`. | Zwracać `reservation.id` (albo mały status) i traktować zwrócone id jako jedyny sygnał sukcesu. |
| R-06 | `supabase/migrations/20261005113900_initial_schema.sql:104-132` | missing-context | medium | Żadna funkcja nie robi `RAISE LOG` i nie przenosi `p_gift_id`/`auth.uid()` w `detail`/`context`. W logach Supabase zostaje wyłącznie request PostgREST; reagujący nie wie, którego prezentu i użytkownika dotyczyła odmowa, bez ręcznego dochodzenia. | Dodać `detail = json_build_object('gift_id', p_gift_id, 'user_id', auth.uid())` do każdego `raise`, a przy sukcesie — `RAISE LOG` z tym samym kontekstem (bez PII). |

### 5.2 Gifts (pełny stos klienta + tabela/RLS)

| # | Location | Category | Severity | What happens in production | Fix direction |
|---|---|---|---|---|---|
| G-01 | `src/app/(app)/index.tsx:31-60,89-105` | flattened-response | high | Po błędzie `getMyList` (`:35-40`) `list` zostaje `null`, więc renderuje się `CreateListForm` („Utwórz swoją pierwszą listę”) plus mała linia błędu. Po błędzie `listGifts` (`:55-60`) `gifts` zostaje `[]`, więc renderuje się `ListEmptyState` („Nie dodano jeszcze prezentów”). Awaria backendu/RLS czyta się jak normalny, pusty produkt; użytkownik może próbować stworzyć drugą listę. | Rozdzielić stan „request failed” od „brak danych”: dedykowany ekran błędu z retry, nie `CreateListForm`/`ListEmptyState`; raportować błąd z `op` i `listId`. |
| G-02 | `src/components/add-gift-form.tsx:45-46`, `create-list-form.tsx:34-40`, `auth-form.tsx:57-59` | flattened-response / logged-not-captured | medium | `catch` robi tylko `setFormError(e.message)` / `setError(e.message)`. Błąd RLS, constraintu, sieci i walidacji wygląda identycznie jak „popraw pole”, a oryginalny obiekt błędu jest porzucany. | Wywołać wspólny `reportError(err, { flow, op })` przed ustawieniem komunikatu; mapować znane kody na copy, nie pokazywać surowego `message` z bazy. |
| G-03 | `supabase/migrations/20261005113900_initial_schema.sql:141` + `src/app/(app)/index.tsx:31-60` | noise / config | medium | Publikacja Realtime dla `gifts` jest włączona, ale klient nigdy nie subskrybuje i nie odświeża na focus. Każda zmiana wiersza generuje ruch, którego nikt nie czyta (zużycie limitu), a zmiana dodana przez inną sesję nigdy nie pojawia się bez remountu; brak sygnału, że live-update nie działa. | Albo dodać subskrypcję `gifts` + refetch na focus z obsługą błędów, albo wyłączyć publikację do czasu S-03/S-04. |
| G-04 | `src/lib/gifts.ts:31-33`, `src/components/gift-list.tsx:14-16` | missing-throw | low | `toGift` robi `Number(row.price)` bez walidacji; wiersz z niepoprawną ceną renderuje „NaN zł” bez żadnego sygnału. | Walidować przy odczycie i raportować błąd integralności danych (nie tylko renderować). |
| G-05 | `src/app/(app)/index.tsx:31-60`, `src/lib/gifts.ts:90-114` | missing-context | low | Po funnelu `P-01` błędy `getMyList`, `listGifts` i `addGift` są nierozróżnialne — brak nazwy operacji i `list_id`, więc nawet dodany później log nie pozwoli ich rozdzielić. | Przekazywać `{ op: 'getMyList' | 'listGifts' | 'addGift', listId }` do miejsca raportowania. |

### 5.3 Platform / plumbing

| # | Location | Category | Severity | What happens in production | Fix direction |
|---|---|---|---|---|---|
| P-01 | `src/lib/gifts.ts:98-100,111-113`; `src/lib/lists.ts:24-26,42-47`; `src/app/(auth)/login.tsx:9-11`; `register.tsx:10-13`; `src/lib/session.tsx:48` | identity-lost | high | Każdy `PostgrestError`/`AuthError` staje się `new Error(message)` bez `code`, `details`, `hint`, `status` i `cause`. RLS `42501`, timeout, `42P01`, `23505`, wygasły token i błąd sieci są nierozróżnialne już w warstwie danych — zanim ktokolwiek mógłby je zgrupować lub alertować. | Jeden `fromSupabaseError()` zwracający typowany błąd z `code/status/details` i `{ cause }`; komunikat zostawić tylko dla UI. |
| P-02 | całe `src/` (0 `console.*`, 0 trackera, 0 `ErrorBoundary`, 0 globalnego handlera) | coverage-gap / logged-not-captured | **critical** | Przechwycone błędy kończą jako string w `useState` (`FormError`), a nieprzechwycone trafiają tylko do domyślnego handlera runtime. Tracker skonfigurowany poza repo nie dostanie zdarzenia, bo kod nigdy go nie woła; reagujący ma tylko zgłoszenie użytkownika „nie działa”. | Dodać jeden `reportError(error, context)` jako jedyny sink + eksport `ErrorBoundary` z `src/app/_layout.tsx` + globalne handlery; wołać w każdym `catch` przed `setError`. |
| P-03 | `src/lib/session.tsx:21-25` + `src/app/_layout.tsx:13-15` | swallowed / coverage-gap | **critical** | `getSession().then(...)` nie ma `.catch`, a `setLoading(false)` jest tylko w `.then`. Odrzucenie (sieć, odczyt storage, refresh tokenu) zostawia `loading = true` na zawsze; root layout zwraca `null`, więc użytkownik widzi wieczny blank/splash bez spinnera, retry i możliwości wylogowania — a w logach nie ma nic. | Dodać `.catch(err => reportError(err, { phase: 'getSession' }))` i `.finally(() => setLoading(false))`; wystawić stan błędu w kontekście i ekran retry. |
| P-04 | `src/app/(app)/index.tsx:66-68`; `src/lib/supabase.ts:28-37` | swallowed | medium | `void supabase.auth.signOut()` wyrzuca zarówno `{ error }`, jak i promise — nieudane wylogowanie jest ciche, a użytkownik pozostaje zalogowany. `startAutoRefresh()`/`stopAutoRefresh()` w listenerze `AppState` również mają ignorowane promisy, więc błędy odświeżania tokenu nie mają app-level sygnału. | `signOut().then(({ error }) => error && reportError(...))` z feedbackiem UI; wrapować wywołania refresh w `.catch(reportError)`. |
| P-05 | `src/components/animated-icon.tsx:50-55`; `src/app/_layout.tsx:8` | swallowed | medium | `SplashScreen.hideAsync().finally(...)` bez `.catch`, a `preventAutoHideAsync()` jest fire-and-forget na poziomie modułu. Jeśli `hideAsync` odrzuci, `setAnimate(true)` nigdy nie ruszy i overlay splasha zostaje nad aplikacją — ten sam wzorzec „zawieszenia bez sygnału” co `P-03`, na krytycznej ścieżce startu. | `.catch` przed `.finally`, który zawsze uruchamia animację; raportować odrzucenie. |
| P-06 | `app.json:3-8`; `package.json:2-4`; brak odczytu wersji/środowiska w `src/` | config | medium | Tożsamość wydania to nadal `.bootstrap-scaffold` / `1.0.0` / scheme `bootstrapscaffold`; brak `runtimeVersion`, numerów buildów i tagu środowiska. Gdy tracker/logi zostaną podłączone, każde zdarzenie będzie nieprzypisywalne do konkretnego builda, a staging i produkcja nierozróżnialne. | Ustawić realną nazwę/scheme, `runtimeVersion`, numery buildów i `EXPO_PUBLIC_APP_ENV`; dołączać wersję i środowisko do każdego raportu. |
| P-07 | `vitest.config.mts:5` (obejmuje `src/**`, 0 testów w `src/`); `tests/e2e/seed.spec.ts` | coverage-gap | medium | `npm test` przechodzi bez testów w `src/`, a jedyny test E2E sprawdza redirect. Regresja, która usunie obsługę błędu sesji albo zgubi `code` w mapowaniu, nie obali żadnego testu — brak sygnału regresji dla poprawek z tego raportu. | Dodać testy jednostkowe na odrzucenie `getSession` i na zachowanie pól `PostgrestError` w mapperze; rozszerzyć E2E o stan błędu listy. |

## 6. Recommended fix order

1. **`P-02` + `P-03` — jeden szew raportowania i poprawka bootstrapu sesji.** Najwięcej ślepoty na jednostkę wysiłku: `reportError` + root `ErrorBoundary` + globalne handlery, oraz `.catch/.finally` w `session.tsx`. Bez tego każda kolejna poprawka nie ma gdzie raportować, a użytkownik może utknąć na blank screenie. *Constraint:* żadnych PII w raporcie — dołączać `op`, `list_id`, `user_id` (id, nie e-mail) i `code`.
2. **`P-01` — typowany mapper błędów Supabase.** Zachować `code/details/hint/status` i `{ cause }`; komunikat dla UI odseparować. To odblokowuje sensowność `G-02`, `R-01`, `G-05`.
3. **`G-01` — rozdzielić „błąd” od „brak danych”.** Dedykowany stan błędu + retry w `(app)/index.tsx`; nigdy nie renderować `CreateListForm`/`ListEmptyState` po nieudanym żądaniu. *Constraint:* nie tworzyć drugiej listy przy błędzie odczytu.
4. **`R-01`–`R-06` — utwardzić SQL przed S-04.** Własne `errcode`, `detail` z `gift_id`/`user_id`, `if not found` w `open_shared_list`, guard w `mark_gift_purchased`, zwracane id rezerwacji, `RAISE LOG` (bez PII). Zrobienie tego teraz jest tańsze niż retrospektywne łatanie po wdrożeniu S-04.
5. **`G-03`, `P-06`, `P-07`** — podłączyć albo wyłączyć Realtime, ustawić tożsamość wydania/środowiska, dodać testy regresji dla `P-01`/`P-03`.

## 7. Changes since last audit

Brak poprzedniego raportu (pierwsze uruchomienie).

## 8. Method and limits

- **Audytorzy:** 3 równoległe, read-only podagenty — `gifts`, `reservations`, `plumbing`. Wszystkie dostały ten sam capture model i potwierdzony brak produkcji.
- **Ręcznie zweryfikowane twierdzenia:**
  - brak `ErrorBoundary` / `.rpc(` / `console.*` / trackera w `src/` — `Select-String` (0 trafień);
  - `session.tsx:21-25` bez `.catch`, `setLoading(false)` tylko w `.then`, root layout `loading → null` — odczyt plików;
  - render `(app)/index.tsx:89-105` po błędzie trafia w `CreateListForm`/`ListEmptyState` — odczyt plików;
  - SQL RPC: `raise exception` bez `errcode`, brak `if not found` w `open_shared_list`, nieguardowany drugi `update` w `mark_gift_purchased`, `returns void` — odczyt migracji;
  - `anon` zachowuje EXECUTE na RPC i `open_shared_list` jako `anon` kończy się `23502` — potwierdzone w `context/changes/reservation-privacy-tests/reviews/impl-review.md` (raport z wcześniejszego review, nie uruchamiany ponownie w tym audycie).
- **Runtime:** nie uruchamiano. Powód: użytkownik potwierdził brak produkcji; brak `--runtime`. Wszystkie ustalenia są **static-only**. Nie utworzono worktree ani harnessu sond.
- **Czego nie da się zweryfikować z repo:** czy platforma zbiera logi/console, czy istnieje tracker w panelu, retencja logów Supabase, rozdział środowisk, upload source map.
- **Liczby z przeglądu repo (bez `node_modules`, `tests`, `scripts`):** 0 pustych `catch {}`; 1 `catch` bez bindingu (`gifts.ts:39`, uzasadniony — walidacja URL); 0 `.catch(() => default)`; 0 `console.*`; 0 wywołań trackera; 10 `throw new Error(...)` bez `cause`; 2 promisy bez handlera odrzucenia (`session.tsx:21`, `supabase.ts:32-34`); 1 fire-and-forget `void` (`index.tsx:67`); 1 własna klasa błędu (`lists.ts:10-15`).
- **Ograniczenie zakresu:** „reservations” w tym commicie to wyłącznie SQL + pgTAP; nie istnieje klient rezerwacji, więc nie ma czego audytować w UI. Ustalenia `R-*` opisują kontrakt, który S-04 odziedziczy.
