# Research: struktura nawigacji, auth i widok listy (S-03 share-link-and-guest-access)

Pytanie: gdzie wpiąć nasłuchiwanie deep linków, gdzie żyje stan auth (decyzja dla niezalogowanego gościa),
gdzie jest widok listy prezentów do udostępnienia, oraz aktualna zawartość `app.json`.

## 1. Struktura nawigacji (gdzie wpiąć deep linki)

Expo Router, file-based. Hierarchia:

- `src/app/_layout.tsx` — **root layout**. Owijają: `ThemeProvider` → `SessionProvider` → `AnimatedSplashOverlay` + `RootNavigator`. `RootNavigator` czyta `useSession()` i renderuje `Stack` z dwiema grupami chronionymi:
  - `Stack.Screen name="(auth)"` pod `Stack.Protected guard={!session}`
  - `Stack.Screen name="(app)"` pod `Stack.Protected guard={!!session}`
  - Gdy `loading` → `return null`.
- `src/app/(auth)/_layout.tsx` → `Slot` (ekrany: `login.tsx`, `register.tsx`).
- `src/app/(app)/_layout.tsx` → `Stack` (ekran: `index.tsx`).
- `src/app/(app)/index.tsx` → główny ekran po zalogowaniu.

**Wniosek:** nasłuchiwanie na przychodzący link wpiąć w **`src/app/_layout.tsx`** (root), a nie w grupy —
root jest jedynym miejscem ponad guardem `Stack.Protected` i ma dostęp do `useSession()`.
Krytyczna konsekwencja: niezalogowany gość otwierający `giftlist://list/<token>` zostanie przez
`Stack.Protected guard={!session}` przekierowany do `(auth)`. Trzeba więc **zbuforować (pending) token
przed redirectem** i skonsumować go po zalogowaniu. Rozwiązanie: osobny `ShareLinkProvider`/hook
(np. `src/lib/share-link.tsx`) wpięty w root, tuż wewnątrz `SessionProvider`, który subskrybuje
`Linking.useLinkingURL()` / `addEventListener('url')`, trzyma `pendingToken` w stanie i czeka na `session`.

## 2. Stan autoryzacji

`src/lib/session.tsx` — jedyne źródło prawdy:

- `SessionProvider` używa `supabase.auth.getSession()` + `supabase.auth.onAuthStateChange(...)`,
  eksponuje wartość `{ session, user, loading }`.
- Hook `useSession()` (rzuca, gdy użyty poza providerem).

**Wniosek:** decyzję „co zrobić z niezalogowanym gościem" podejmujemy w oparciu o `useSession().session`
(nie `undefined`) — dopiero po `loading === false`. To miejsce łączy się z guardem z pkt 1.

## 3. Widok listy prezentów (co udostępniamy)

**Uwaga — zależność NIE jest jeszcze dostarczona.** Slice **S-02 (`add-gift`) ma status `proposed`**
(roadmap.md:46, 101-111) — nie ma go w kodzie. Obecny stan:

- `src/app/(app)/index.tsx` pokazuje tylko **nazwę listy + empty state** („Twoja lista jest jeszcze pusta",
  z dopiskiem „Dodawanie prezentów w kolejnym kroku", index.tsx:99-105). **Nie ma widoku z prezentami
  ani statusami** — to jest artefakt, który S-03 ma udostępniać.
- `src/lib/lists.ts` — `GiftList` zawiera już `share_token: string` (lists.ts:6); `getMyList`, `createList`.
- Brak modułu odczytu prezentów (brak `src/lib/gifts.ts`) i brak ekranu gościa.

**Wniosek:** S-03 nie może w pełni wystartować przed ukończeniem **S-02** (zgodnie z `Prerequisites: S-02`
w roadmap.md:118). Warstwa DB jest jednak gotowa i wskazuje kontrakt gościa:

- Tabela `gifts_lists.share_token uuid unique` (migracja `20261005113900_initial_schema.sql:8`).
- RPC `open_shared_list(p_token uuid)` — zapisuje gościa do `list_members` i zwraca listę
  (initial_schema.sql:96-102); **grant tylko dla `authenticated`** — czyli gość MUSI się zalogować
  (FR-008), a token w URL to `uuid`.
- Widok statusów `reservation_status` już istnieje (initial_schema.sql:89-93, zmigrowany w
  `20261005153300_reservation_status_scope.sql`) — bez tożsamości rezerwującego.

To domyka flow S-03: link `giftlist://list/<uuid>` → (gość niezalogowany → login) → `open_shared_list(token)`
→ lista ze statusami.

## 4. Aktualna zawartość `app.json`

```json
{
  "expo": {
    "name": ".bootstrap-scaffold",
    "slug": ".bootstrap-scaffold",
    "version": "1.0.0",
    "orientation": "portrait",
    "icon": "./assets/images/icon.png",
    "scheme": "bootstrapscaffold",
    "userInterfaceStyle": "automatic",
    "ios": { "icon": "./assets/expo.icon" },
    "android": {
      "adaptiveIcon": { "...": "..." },
      "predictiveBackGestureEnabled": false
    },
    "web": { "output": "static", "favicon": "./assets/images/favicon.png" },
    "plugins": ["expo-router", ["expo-splash-screen", { "...": "..." }]],
    "experiments": { "typedRoutes": true, "reactCompiler": true }
  }
}
```

- `"scheme": "bootstrapscaffold"` — **placeholder**, do zmiany na `"giftlist"` (build-time, brak efektu w Expo Go).
- Brak `expo-dev-client` w `plugins` i w zależnościach — trzeba dodać (`npx expo install expo-dev-client`).
- `name`/`slug` wciąż `.bootstrap-scaffold` (kosmetyczne, poza zakresem linku).
