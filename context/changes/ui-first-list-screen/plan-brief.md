# Ujednolicenie UI ekranu „Twoja lista” — Plan Brief

> Full plan: `context/changes/ui-first-list-screen/plan.md`
> Research: `context/changes/ui-first-list-screen/research.md`

## What & Why

Ekran „Twoja lista” (S-01) i ekran logowania mają literałe kolorów, promieni i stanów wpisane w każdym pliku, a przycisk i pole są zduplikowane. Zmieniamy tokeny i wspólne prymitywy tak, aby kolejne ekrany dziedziczyły kontrakt zamiast kopiować wartości, a przycisk akcji spełniał kontrast AA w obu motywach.

## Starting Point

Tokeny w `src/constants/theme.ts` są czytane przez `ThemedText` / `ThemedView`, ale nie mają ról `primary`, `onPrimary`, `destructive`, `ring` ani promienia. Label przycisku `#ffffff` na `#3c87f7` ma 3.50:1, a błąd w dark mode 4.35:1 — poniżej AA. Te same literały są w `auth-form.tsx`.

## Desired End State

Widok listy i `auth-form` składają się z `Button`, `TextField`, `FormError` i `ListEmptyState`/`CreateListForm`, bez literałów w plikach widoku. Kitchen sink z 7 stanami działa w trybie dev, a `AGENTS.md` zawiera regułę dla kolejnych agentów.

## Key Decisions Made

| Decision                    | Choice                                         | Why (1 sentence)                                                  | Source   |
| --------------------------- | ---------------------------------------------- | ----------------------------------------------------------------- | -------- |
| Confirm complexity          | MEDIUM, 5 questions                            | Zakres pokryty przez research i 3 odpowiedzi                       | Plan     |
| Light primary               | `#2563eb`, label white (5.17:1)                | Zachowuje odcień marki i spełnia AA                                | Plan     |
| Dark primary                | `#3c87f7`, label black (6.00:1)                | Jasny akcent w ciemnym motywie daje AA z czarnym tekstem          | Research (C1) + Plan |
| Dark destructive            | `#f97066` (7.54:1 na czarnym)                  | Czerwień z research (4.35:1) nie spełnia AA w dark                 | Research (C1) + Plan |
| Border token                | Brak; fokus i błąd rysuje `ring` / `destructive` | Mniej ról do utrzymania; research wymieniał `border`, ale nie jest potrzebny | Plan     |
| Radius                      | `Radius.small = 8` zamiast `Spacing.two`        | Odseparowuje promień od odstępów                                  | Research (C3) |
| Shared primitives location  | `src/components/ui/`                            | Katalog już istnieje (`collapsible.tsx`), zgodnie z kontraktem    | Research (C2) |
| Form extraction             | `CreateListForm` + `ListEmptyState`            | `index.tsx` ma być routingiem stanów                              | Research (C5) |
| auth-form                   | Migrowany na prymitywy w tej zmianie           | Brak drugiego `Button` w repo                                      | Plan (użytkownik) |
| Kitchen sink                | `src/app/dev/ui-states.tsx`, `__DEV__`         | Widok na urządzeniu i w webie bez dodatkowych narzędzi             | Plan (użytkownik) |

## Scope

**In scope:** tokeny ról i `Radius`; `linkPrimary` z tokenu; `ThemedView` bez martwych props; `Button`, `TextField`, `FormError`; `CreateListForm`, `ListEmptyState`; migracja `index.tsx` i `auth-form.tsx`; kitchen sink; reguła w `AGENTS.md`.

**Out of scope:** nowy system projektowy lub biblioteka UI; zmiany w `supabase/` i `src/lib/`; usuwanie martwych plików startera; runner zrzutów; rebranding poza tokenami.

## Architecture / Approach

Tokeny w `Colors`/`Radius` → prymitywy w `src/components/ui/` czytają wyłącznie role → widoki (`index.tsx`, `CreateListForm`, `ListEmptyState`, `auth-form`) składają prymitywy → kitchen sink renderuje te same komponenty w 7 stanach.

## Phases at a Glance

| Phase     | What it delivers                          | Key risk                                                      |
| --------- | ----------------------------------------- | ------------------------------------------------------------- |
| 1. Tokeny | Role light/dark i `Radius`                | Zmiana `primary` widoczna także w linkach — zamierzone        |
| 2. Prymitywy | `Button`, `TextField`, `FormError`     | `aria-describedby` na natywnym — fallback `accessibilityHint` |
| 3. Lista  | `CreateListForm`, `ListEmptyState`, `index.tsx` | Regresja przepływu tworzenia listy                      |
| 4. Auth   | `auth-form` na prymitywach                | Zmiana odstępów przy migracji — `style` z propów               |
| 5. Gate   | Kitchen sink, reguła, zrzuty, skan       | Kontrast `ring` ≥3:1 nie zweryfikowany do bramki              |

**Prerequisites:** Node/npm, `npx expo start --web` do zrzutów; brak zmian w bazie.
**Estimated effort:** ~1 sesja, 5 faz z ręcznymi zatrzymaniami na weryfikację.

## Open Risks & Assumptions

- Kontrast `ring` na `backgroundElement` (`#F0F0F3`) nie został jeszcze policzony — zweryfikować w Fazie 5.
- `aria-describedby` dla `TextInput` na RN 0.86 — jeśli nie działa natywnie, używamy `accessibilityHint`.
- Hover jest widoczny tylko na webie; na iOS/Android stan oznaczony jako N/A.
- Route `/dev/ui-states` jest w bundle; zostaje `null` poza `__DEV__` (akceptowane).

## Success Criteria (Summary)

- Skan literałów (regex z `10x-ui`) zwraca 0 trafień w objętych plikach.
- `npx tsc --noEmit` i `npx expo lint` przechodzą.
- Login, rejestracja i tworzenie listy działają jak przed zmianą, z czytelnymi stanami w obu motywach.
