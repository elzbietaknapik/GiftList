---
change_id: protected-deletes
title: Protected deletes
status: implemented
created: 2026-11-04
updated: 2026-11-04
archived_at: null
---

## Notes

Owner can delete a list only when no gift on it has a reservation, and delete a gift only when it is free. Implemented as client wrappers over the existing RLS guards plus owner-only UI with an inline two-step confirm. No migrations - `supabase/` stays untouched.
