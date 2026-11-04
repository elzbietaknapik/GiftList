---
change_id: gift-editing
title: Gift editing
status: implemented
created: 2026-11-04
updated: 2026-11-04
archived_at: null
---

## Notes

Owner-side editing of a gift (name, link, price, optional image URL) while the
gift is still free. Decision and rationale live in `docs/adr-002-gift-editing.md`;
the PRD now records it as FR-012 and no longer lists editing as a Non-Goal.

Scope delivered:

- client guard in `updateGift` (`src/lib/gifts.ts`) with `GiftNotEditableError`
  and Vitest coverage in `src/lib/gifts.test.ts`,
- RLS repair in `supabase/migrations/20261104120000_gift_editing_guard.sql`
  (`update_gifts` uses both `USING` and `WITH CHECK`),
- pgTAP proof in `supabase/tests/gift_editing_guard.test.sql` (reserved,
  purchased, free-with-reservation and WITH CHECK cases),
- owner UI on the dashboard and shared-list view, with the edit form, gift
  card grid, icon button and theme tokens,
- roadmap S-07 and the milestone marked done; test plan Risk #4 closed.

Out of scope: editing a gift after any reservation (there is no reservation
cancellation in the MVP), status editing, soft-delete/history, and E2E tests.
