---
change_id: testing-reservation-lifecycle
title: Reservation lifecycle integrity tests
status: implemented
created: 2026-10-23
updated: 2026-10-30
archived_at: null
---

## Notes

Open a change folder for rollout Phase 1 of context/foundation/test-plan.md: "Reservation lifecycle integrity".
Risks covered: #1 (double reservation), #5 (status "purchased" by a non-reserver). Test types planned: integration (pgTAP).
Risk response intent: #1 — two concurrent reservations of one free gift: exactly one succeeds, the other gets an explicit refusal; #5 — only the reserving gift-giver can set "purchased".
