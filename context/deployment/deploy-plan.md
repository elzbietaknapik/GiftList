---
project: "GiftList"
created: 2026-10-05
plan_type: "first-deploy"
inputs: [context/foundation/infrastructure.md, context/foundation/tech-stack.md, context/foundation/prd.md]
recommended_platform: "Supabase"
deployment_target: "Supabase (backend) + EAS Build (mobile binary, późniejszy milestong)"
status: "do akceptacji przed wykonaniem"
---

# Plan pierwszego wdrożenia — GiftList (Expo SDK 57 + Supabase)

## 1. Cel i zakres

Wdrożyć backend GiftList na Supabase: schema (listy, prezenty, rezerwacje), RLS ukrywające tożsamość rezerwującego, publikację Realtime, klient Supabase w Expo (wraz z odświeżaniem tokenów przez AppState) oraz komplet sekretów/zmiennych środowiskowych. **Ten plan nie modyfikuje plików źródłowych aplikacji** — kroki automatyczne dotyczą infra/kodu Supabase oraz przygotowania EAS; podłączenie UI to osobna sesja implementacyjna opisana w rozdziale 6.

Poza zakresem: build binarki (App Store / Play Store), GitHub Actions CI/CD (auto-deploy-on-merge z `tech-stack.md` — bez zdalnego repo nie ma gdzie go wpiąć), zmiana brandingu `app.json` (nazwa/slug/scheme), rezerwacje wielokrotne / zwalnianie rezerwacji, powiadomienia, OAuth (tylko email+hasło w MVP).

## 2. Stan obecny (zweryfikowany)

| Element | Stan |
|---|---|
| `supabase/` (migrations, config.toml) | brak |
| `@supabase/supabase-js`, `expo-sqlite`, AsyncStorage | brak w `package.json` |
| `eas.json` / połączenie EAS | brak |
| `.env` | jest, **niegitignore'owany** (`EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY` = `sb_publishable_…`) |
| Git | branch `master`, brak remote |
| `.github/workflows` | brak |
| Projekt Supabase (URL `bdbgjyzypmrkvbhfilqj`) | istnieje wg `.env`; dostęp CLI niezweryfikowany |

## 3. Decyzje projektowe (zablokowane)

1. **Status prezentu żyje na `gifts.status`** (`free|reserved|purchased`), aktualizowany atomowo przez security-definer RPC. Umożliwia Realtime na **samej tabeli `gifts`** — payload nigdy nie zawiera `reserver_user_id`. **Świadome odejście od sugestii infra.md** („Realtime dla `gifts` i `reservations`"): publikacja `reservations` w Realtime wysyła pełny wiersz, więc RLS nie chroni kolumny przed subskrybentem (Risk #6 z infra.md). Tabela `reservations` nie jest publikowana w ogóle.
2. **`reservations` jest całkowicie zamknięta dla klienta** (`revoke select/insert/update/delete` na `anon`+`authenticated`). Tożsamość rezerwującego jest odczytywalna wyłącznie przez security-definer RPC `my_reserved_gift_ids()` (dla samego rezerwującego — obsługa FR-011) — zgodnie z Risk #1 i guardrailem „tożsamość nigdy nie wycieka".
3. **Dostęp gościa (Obdarowujący) przez membership, nie przez share_token w RLS.** RLS nie może porównywać policy z parametrem zapytania, więc dostęp przez sam token wymagałby `using (true)` (wyciek wszystkich list). Zamiast tego: RPC `open_shared_list(token)` wpisuje `(list_id, auth.uid())` do `list_members`; wszystkie policy sprawdzają właściciela **lub** członka. Dodatkowy zysk: Realtime działa też dla gości (polityka select przechodzi).
4. **Auth: email + hasło** (Supabase Auth, wbudowane `auth.users`), flow **PKCE**, `detectSessionInUrl: false` (Risk #11), `autoRefreshToken: true` + ręczny `startAutoRefresh()`/`stopAutoRefresh()` z `AppState` (Risk #5).
5. **Nazwy tabel wg infra.md**: `gifts_lists`, `gifts`, `reservations` (+ `list_members`).
6. **Jedna lista na użytkownika** (FR-003): unikalny indeks na `gifts_lists.owner_id`; łatwy do usunięcia, gdy dojdzie wiele list.

## 4. Część A — Migracje bazy danych (kroki automatyczne)

Pliki pod `supabase/migrations/` (forward-only, z timestampem). Kolejność = jeden plik init + jeden plik testów.

### 4.1 `supabase/migrations/<timestamp>_initial_schema.sql`

```sql
-- Tabele
create table public.gifts_lists (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references auth.users(id) on delete cascade,
  name        text not null check (length(trim(name)) > 0),
  share_token uuid not null default gen_random_uuid() unique,
  created_at  timestamptz not null default now()
);
create unique index gifts_lists_one_per_owner on public.gifts_lists (owner_id); -- FR-003

create table public.gifts (
  id          uuid primary key default gen_random_uuid(),
  list_id     uuid not null references public.gifts_lists(id) on delete cascade,
  name        text not null check (length(trim(name)) > 0),
  link        text not null,
  price       numeric(10,2) not null check (price >= 0),
  image_url   text,
  status      text not null default 'free'
              check (status in ('free','reserved','purchased')),
  created_at  timestamptz not null default now()
);
create index gifts_list_id_idx on public.gifts (list_id); -- Risk #8

create table public.list_members (               -- dostęp gości, pkt 3
  list_id   uuid not null references public.gifts_lists(id) on delete cascade,
  user_id   uuid not null references auth.users(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (list_id, user_id)
);

create table public.reservations (               -- tożsamość: ZAMKNIĘTA dla klienta
  id              uuid primary key default gen_random_uuid(),
  gift_id         uuid not null unique references public.gifts(id) on delete cascade,
  reserver_user_id uuid not null references auth.users(id) on delete cascade,
  created_at      timestamptz not null default now(),
  purchased_at    timestamptz
);

-- RLS: włącz + polityki
alter table public.gifts_lists enable row level security;
alter table public.gifts enable row level security;
alter table public.list_members enable row level security;
alter table public.reservations enable row level security;

-- gifts_lists: właściciel lub członek widzi; zapis/usuwanie tylko właściciel
create policy select_lists on public.gifts_lists for select to authenticated
  using (owner_id = auth.uid()
      or exists (select 1 from public.list_members m
                 where m.list_id = id and m.user_id = auth.uid()));
create policy insert_lists on public.gifts_lists for insert to authenticated
  with check (owner_id = auth.uid());
create policy update_lists on public.gifts_lists for update to authenticated
  using (owner_id = auth.uid());
create policy delete_lists on public.gifts_lists for delete to authenticated
  using (owner_id = auth.uid()
     and not exists (select 1 from public.gifts g
                     join public.reservations r on r.gift_id = g.id
                     where g.list_id = id));  -- FR-004

-- gifts: widoczność jak listy; usunięcie tylko niezarezerwowanego (FR-006)
create policy select_gifts on public.gifts for select to authenticated
  using (exists (select 1 from public.gifts_lists gl
                 where gl.id = list_id and gl.owner_id = auth.uid())
      or exists (select 1 from public.gifts_lists gl
                 join public.list_members m on m.list_id = gl.id
                 where gl.id = list_id and m.user_id = auth.uid()));
create policy insert_gifts on public.gifts for insert to authenticated
  with check (exists (select 1 from public.gifts_lists gl
                      where gl.id = list_id and gl.owner_id = auth.uid()));
create policy update_gifts on public.gifts for update to authenticated
  using (exists (select 1 from public.gifts_lists gl
                 where gl.id = list_id and gl.owner_id = auth.uid()));
create policy delete_gifts on public.gifts for delete to authenticated
  using (exists (select 1 from public.gifts_lists gl
                 where gl.id = list_id and gl.owner_id = auth.uid())
     and status = 'free');

-- list_members: tylko wstawienie przez security-definer RPC (poniżej)
create policy select_members on public.list_members for select to authenticated
  using (user_id = auth.uid());

-- reservations: zero bezpośredniego dostępu — to jest sedno „skryptu RLS"
revoke all on public.reservations from anon, authenticated;
revoke all on public.list_members from anon;

-- Widok statusów bez tożsamości (zgodnie z infra.md „view, który pomija kolumnę")
create view public.reservation_status
  with (security_invoker = true) as
  select r.gift_id, r.created_at, r.purchased_at
  from public.reservations r;
grant select on public.reservation_status to authenticated;

-- RPC: rezerwacja i zakup (security definer = atomowość + dostęp do zamkniętej tabeli)
create or replace function public.open_shared_list(p_token uuid)
returns public.gifts_lists language sql security definer set search_path = public as $$
  insert into public.list_members (list_id, user_id)
  select id, auth.uid() from public.gifts_lists where share_token = p_token
  on conflict do nothing;
  select * from public.gifts_lists where share_token = p_token;
$$;

create or replace function public.reserve_gift(p_gift_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (
    select 1 from public.gifts_lists gl
    join public.gifts g on g.list_id = gl.id
    left join public.list_members m on m.list_id = gl.id and m.user_id = auth.uid()
    where g.id = p_gift_id and (gl.owner_id = auth.uid() or m.user_id is not null)
  ) then raise exception 'no access to this list'; end if;
  update public.gifts set status = 'reserved' where id = p_gift_id and status = 'free';
  if not found then raise exception 'gift is not free'; end if;
  insert into public.reservations (gift_id, reserver_user_id)
  values (p_gift_id, auth.uid());
end $$;

create or replace function public.mark_gift_purchased(p_gift_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.reservations
     set purchased_at = now()
   where gift_id = p_gift_id and reserver_user_id = auth.uid();
  if not found then raise exception 'only the reserver can mark as purchased'; end if;
  update public.gifts set status = 'purchased' where id = p_gift_id;
end $$;

create or replace function public.my_reserved_gift_ids()
returns uuid[] language sql security definer set search_path = public as $$
  select coalesce(array_agg(gift_id), '{}')
  from public.reservations where reserver_user_id = auth.uid();
$$;

revoke all on function public.reserve_gift(uuid), public.mark_gift_purchased(uuid),
                 public.open_shared_list(uuid), public.my_reserved_gift_ids() from public;
grant execute on function public.reserve_gift(uuid), public.mark_gift_purchased(uuid),
                 public.open_shared_list(uuid), public.my_reserved_gift_ids() to authenticated;

-- Realtime: publikujemy TYLKO gifts (decyzja 1; Risk #6). NIE reservations.
alter publication supabase_realtime set table public.gifts;
```

### 4.2 `supabase/tests/<timestamp>_reservations_hidden.test.sql` (pgTAP)

Testy (Risk #1, odpalane przez `supabase test db` w CI):

1. Właściciel i członek widzą `gifts`; `select * from reservations` dla obu ról zwraca błąd/zéro wierszy (brak uprawnień).
2. `reservation_status` zwraca `gift_id`/`purchased_at`, ale kolumna `reserver_user_id` nie istnieje w widoku.
3. `reserve_gift` dwa razy na tym samym prezencie → drugie wywołanie rzuca `gift is not free`.
4. `mark_gift_purchased` przez innego użytkownika niż rezerwujący → `only the reserver…`.
5. `open_shared_list` nadaje membership, a `my_reserved_gift_ids()` zwraca tylko własne `gift_id`.
6. Usunięcie listy z rezerwacją (delete) → odrzucone (FR-004).

## 5. Część B — Konfiguracja klienta Supabase w Expo

**Krok automatyczny** (sesja implementacyjna, nie ta: rozdział 6 mówi co — zależności + kod):

1. Zależności (przez `npx expo install`, żeby rozwiązać wersje SDK 57):
   ```
   npx expo install @supabase/supabase-js @react-native-async-storage/async-storage react-native-url-polyfill
   ```
   (`expo-sqlite` z integracji EAS nie jest potrzebne w MVP — nie instalować.)
2. `src/lib/supabase.ts`:
   ```ts
   import 'react-native-url-polyfill/auto';
   import AsyncStorage from '@react-native-async-storage/async-storage';
   import { createClient } from '@supabase/supabase-js';
   import { AppState } from 'react-native';

   const supabase = createClient(
     process.env.EXPO_PUBLIC_SUPABASE_URL!,
     process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!,
     {
       auth: {
         detectSessionInUrl: false,   // Risk #11 — RN, nie web
         autoRefreshToken: true,
         persistSession: true,
         flowType: 'pkce',
         storage: AsyncStorage,
       },
     },
   );

   // Risk #5 — tokeny wygasają, gdy urządzenie śpi; wznów odświeżanie przy active
   AppState.addEventListener('change', (state) => {
     if (state === 'active') supabase.auth.startAutoRefresh();
     else supabase.auth.stopAutoRefresh();
   });

   export { supabase };
   ```
3. W `src/app/_layout.tsx`: `getSession()` na starcie (przed renderem) i `SessionProvider` (kontekst `supabase.auth`).
4. Link udostępniania: deep link `giftlist://list/<share_token>` przez `expo-linking` — wymaga zmiany `scheme` w `app.json` (osobny krok, rozdział 6).
5. `EXPO_PUBLIC_*` trafiają do bundla (public-by-design, infra.md Risk #7) — klucz `service_role` nigdy tam nie trafia.

## 6. Część C — Sekrety i zmienne środowiskowe

| Zmienna | Charakter | Wartość | Gdzie |
|---|---|---|---|
| `EXPO_PUBLIC_SUPABASE_URL` | public (bundle) | `https://<ref>.supabase.co` | `.env.local` (gitignored) + EAS env per environment |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | public (bundle) | `sb_publishable_…` | `.env.local` + EAS env |
| `SUPABASE_ACCESS_TOKEN` | **sekret** | PAT scoped do projektu | env agenta / GitHub Actions secret; **nigdy `EXPO_PUBLIC_*`** |
| `SUPABASE_DB_PASSWORD` | **sekret** | hasło bazy | vault/dashboard Supabase; do `psql`/incidentów |
| `SUPABASE_SERVICE_ROLE_KEY` | **sekret** | klucz service_role | tylko CI (testy RLS) i Edge Functions; **nigdy w kliencie** |
| `EXPO_TOKEN` | **sekret** | token EAS | GitHub Actions secret (build w CI) |

Porządki w repo: `.gitignore` ignoruje tylko `.env*.local` — przenieść wartości z `.env` do `.env.local` i dodać `.env` do `.gitignore` (wartości są publiczne, ale trzymamy jedną konwencję wg infra.md).

## 7. Podział zadań

### Kolejność (sekwencyjnie; kroki automatyczne czekają na bramki manualne)

1. **[M] Bramka konta**: potwierdź projekt Supabase `bdbgjyzypmrkvbhfilqj` (lub utwórz nowy), włącz dostawcę **Email** w `Authentication → Providers` i przełącznik **Realtime API** w `Database → Realtime`. Uruchom Docker Desktop (Windows).
2. **[A] Inicjalizacja**: `npx supabase init` (tworzy `supabase/config.toml`), `npx expo-doctor` jako sanity check.
3. **[A] Migracje**: zapisz pliki z rozdziału 4 w `supabase/migrations/` i `supabase/tests/`; `npx supabase start` → `npx supabase db reset` (stosuje lokalnie).
4. **[M] Bramka sekretów**: podaj agentowi `SUPABASE_ACCESS_TOKEN` (PAT scoped) oraz potwierdź `SUPABASE_DB_PASSWORD` w vault; **nie wpisuj ich do żadnego pliku w repo**.
5. **[A] Link + push**: `npx supabase link --project-ref bdbgjyzypmrkvbhfilqj`, `npx supabase db push` (migracja czysto addytywna, bez destrukcji). Weryfikacja: `npx supabase db diff --linked` → pusto; `supabase test db` lokalnie → zielone.
6. **[M] Bramka akceptacji**: przejrzyj rozdział 4 (policy `reservations` = zero dostępu, publikacja Realtime = tylko `gifts`); zatwierdź push do produkcji.
7. **[A] EAS**: `npm i -g eas-cli`, `eas login` (bramka [M] — konto/user), `eas init` (tworzy `eas.json`), `eas env:create --environment production|preview|development` dla obu `EXPO_PUBLIC_*` w każdej środowisku.
8. **[M] Bramka sekretów EAS**: `EXPO_TOKEN` do CI (dopiero przy milestonie CI — nie teraz).
9. **[A] Klient (następna sesja)** — rozdział 5: zależności, `src/lib/supabase.ts`, `_layout.tsx` + session, weryfikacja `npx expo lint` + `npx tsc --noEmit` + `npx expo-doctor`. Weryfikacja funkcyjna w Expo Go: rejestracja → utworzenie listy → `open_shared_list` → `reserve_gift` → status widoczny natychmiast, tożsamość niewidoczna.

### Legenda

- **[A] automatyczny** — wykonuje agent (CLI `supabase`, `eas`).
- **[M] manualny** — wykonuje użytkownik (konto, sekrety, akceptacje, destrukcja). Nieodwracalne operacje (usuwanie projektu, rotacja klucza) pozostają wyłącznie manualne wg infra.md.

## 8. Definicja ukończenia (DoD)

1. `supabase db push` zastosowany na `bdbgjyzypmrkvbhfilqj`; `db diff --linked` puste.
2. Testy RLS (rozdział 4.2) przechodzą lokalnie i są wpinane do CI (milestong CI).
3. `reservations` nieodczytywalna przez `anon`/`authenticated`; publikacja Realtime zawiera wyłącznie `gifts`.
4. `.env.local` (gitignored) zawiera oba `EXPO_PUBLIC_*`; `.env` dodany do `.gitignore`; brak `service_role`/`SUPABASE_*` w `EXPO_PUBLIC_*`.
5. `src/lib/supabase.ts` z `detectSessionInUrl: false`, `flowType: 'pkce'` i wiringiem `AppState`; `npx expo lint` + `npx tsc --noEmit` zielone.
6. Ręczny test end-to-end w Expo Go (rozdział 7 krok 9) potwierdza: rezerwacja widoczna natychmiast, tożsamość ukryta, podwójna rezerwacja zablokowana, zakup tylko przez rezerwującego.

## 9. Ryzyka i mapowanie na `infrastructure.md`

| Ryzyko (infra.md) | Mitygacja w tym planie |
|---|---|
| #1 RLS wycieka `reserver_user_id` | `revoke all` na `reservations` + RPC (rozdz. 4.1) + pgTAP (rozdz. 4.2) |
| #5 tokeny wygasają po śnie urządzenia | wiring `AppState` (rozdz. 5.2) |
| #6 RLS nie obejmuje broadcastów | publikacja wyłącznie `gifts`, nigdy `reservations` (decyzja 1) |
| #7 `service_role` w `EXPO_PUBLIC_*` | dozwolone są tylko 2 publiczne zmienne; grep `EXPO_PUBLIC_.*SECRET` w kroku DoD 4 |
| #8 regresja wydajności RLS | indeks `gifts(list_id)`, unikalny `reservations(gift_id)` |
| #9 lag replikacji Realtime | klient optymistycznie ustawia status po sukcesie `reserve_gift`, przed broadcastem |
| #11 `detectSessionInUrl` | jawnie `false` + komentarz w `src/lib/supabase.ts` |

## 10. Następne milestony (poza tym wdrożeniem)

- **Branding**: `name`/`slug`/`scheme` w `app.json` (giftlist://) przed linkiem udostępniania.
- **GitHub**: utworzenie repo + remote, gałąź `main`, secrets CI (`EXPO_TOKEN`, `SUPABASE_ACCESS_TOKEN`, `SUPABASE_SERVICE_ROLE_KEY`), workflow auto-deploy-on-merge + `supabase db push` + `supabase test db`.
- **EAS Build**: `eas build --profile production`, Store credentials (manualne, App Store / Google Play).
- **Hardening auth**: `expo-secure-store` zamiast AsyncStorage dla sesji.
