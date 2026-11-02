---
change_id: fix-session-swallowed-error
title: Fix swallowed session error (P-03) and stuck loading state
status: planned
created: 2026-10-30
updated: 2026-10-30
archived_at: null
---

## Notes

Naprawiamy połknięty błąd P-03 z raportu observability w src/lib/session.tsx:
1. Obsłuż odrzucenie obietnicy (dodaj .catch() i .finally() do getSession()).
2. Dodaj logowanie błędu do konsoli (console.error) z zachowaniem pełnego obiektu błędu i kontekstu.
3. Upewnij się, że stan ładowania (loading) zostaje prawidłowo zdjęty, a błąd jest dostępny w stanie lub sygnalizowany, zapobiegając wiecznemu pustemu ekranowi (blank screen).
