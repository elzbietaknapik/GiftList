---
change_id: auth-and-first-list
title: Rejestracja/logowanie + pierwsza lista użytkownika
status: archived
created: 2026-10-16
updated: 2026-10-16
archived_at: 2026-10-16T10:28:03Z
---

## Notes

Roadmap item: **S-01** (Change ID `auth-and-first-list`), see `context/foundation/roadmap.md`.
Cel: e-mail + hasło (rejestracja/logowanie) i pierwsza lista prezentowa użytkownika (PRD FR-001, FR-002, FR-003).

Decyzje zamknięte podczas planowania:

- Bramkowanie tras: natywny `Stack.Protected` z `expo-router` + prosty `SessionProvider` / `useSession`.
- E-mail confirmation: wyłączone (dev) — po rejestracji użytkownik jest od razu zalogowany, bez potwierdzania linkiem.
- Ekrany: minimalny zestaw auth (logowanie + rejestracja z przełącznikiem) oraz prosty formularz utworzenia pierwszej listy (tytuł + zapis).
- UX pierwszej listy: brak listy użytkownika → bezpośrednio formularz tworzenia.
- Weryfikacja: brak błędów `tsc`/`lint` + weryfikacja manualna w aplikacji.
