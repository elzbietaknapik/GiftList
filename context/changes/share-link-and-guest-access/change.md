---
change_id: share-link-and-guest-access
title: Share link and guest access
status: implementing
created: 2026-11-02
updated: 2026-11-02
archived_at: null
---

## Notes

<!-- Free-form notes for this change: links, ad-hoc context, decisions that don't belong in research/frame/plan. -->

**Roadmap:** S-03 — Link udostępniania i widok gościa (`context/foundation/roadmap.md`). Prerequisite S-02 (`add-gift`) jest `done`.

**Decyzje zatwierdzone w planowaniu:** link `giftlist://list/<share_token>`; development build lokalnie (`npx expo run:android|ios`, bez EAS); widok gościa jako trasa `src/app/(app)/list/[token].tsx`; oczekujący token tylko w pamięci; brak regeneracji linku (link stały).

**Poza zakresem:** rezerwacja i realtime (S-04), oznaczanie zrealizowanego (S-05), usuwanie z ochroną (S-06), testy E2E w Playwright i scaffolding testowy.
