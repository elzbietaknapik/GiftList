# Research: expo-linking dla schematu `giftlist://list/<token>` (S-03)

**Decyzja:** Przechodzimy na Development Build, ponieważ schemat `giftlist://` nie działa w domyślnym Expo Go (wymaga budowania natywnego).

Źródła (docs.expo.dev, 2026):
- Linking into your app — https://docs.expo.dev/linking/into-your-app/
- expo-linking SDK Reference — https://docs.expo.dev/versions/latest/sdk/linking/
- app.json `scheme` (build-time, brak efektu w Expo Go) — https://docs.expo.dev/versions/latest/config/app/

## Kontrakt API `expo-linking` (odbiór tokenu z URL)

`useURL()` jest **deprecated** — aktualny hook to `useLinkingURL()`. `Linking.parse()` zwraca
`{ hostname, path, queryParams }`. Dla `giftlist://list/<token>`: `hostname = "list"`,
`path = "<token>"` (czyli token to segment ścieżki, nie query param).

```tsx
import * as Linking from 'expo-linking';

// 1) Hook (rekomendowany, gdy nie używamy Expo Router):
export default function Home() {
  const url = Linking.useLinkingURL(); // string | null

  if (url) {
    const { hostname, path, queryParams } = Linking.parse(url);
    // giftlist://list/abc123 -> hostname: "list", path: "abc123"
    if (hostname === 'list' && path) {
      const token = path; // np. "abc123"
    }
  }

  return null;
}
```

```tsx
// 2) Event listener (link przychodzący gdy app już działa) + initial URL:
import * as Linking from 'expo-linking';
import { useEffect } from 'react';

useEffect(() => {
  Linking.getInitialURL().then((url) => {
    if (url) handleIncoming(url);
  });

  const sub = Linking.addEventListener('url', ({ url }) => handleIncoming(url));
  return () => sub.remove();
}, []);
```

Uwaga: przy Expo Router routing deep linków jest włączony automatycznie dla wszystkich
ekranów — hook/listener potrzebny jest tylko do własnej logiki (np. walidacji/wymiany tokenu),
a nie do samej nawigacji.

## Rejestracja scheme w `app.json`

Schemat jest ustawieniem build-time. Obecnie w repo jest `"scheme": "bootstrapscaffold"`
(placeholder ze scaffolda) — należy go zmienić na docelowy `giftlist`:

```json
{
  "expo": {
    "name": "GiftList",
    "slug": "giftlist",
    "scheme": "giftlist"
  },
  "plugins": [
    "expo-router",
    "expo-dev-client"
  ]
}
```

Po zmianie configu trzeba zbudować na nowo Development Build (`expo-dev-client`):
`npx expo install expo-dev-client` oraz build profilu development
(`npx expo run:android|ios` lub `eas build --profile development`).
