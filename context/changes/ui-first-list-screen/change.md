---
change_id: ui-first-list-screen
title: Ui first list screen
status: implementing
created: 2026-10-23
updated: 2026-10-23
archived_at: null
---

## Notes

<!-- Free-form notes for this change: links, ad-hoc context, decisions that don't belong in research/frame/plan. -->

**Widok:** `src/app/(app)/index.tsx` — ekran „Twoja lista” po zalogowaniu (S-01, tworzenie pierwszej listy oraz istniejąca lista).

**Źródło tokenów:** istniejący system projektowy — wartości w `src/constants/theme.ts` (`Colors`, `Fonts`, `Spacing`), publikowane przez `useTheme` / `ThemedText` / `ThemedView`; komponenty współdzielone w `src/components/`.

**Poza zakresem:** rebranding całego MVP, tworzenie widoku, którego nie ma, dodawanie runnera zrzutów ekranu.
