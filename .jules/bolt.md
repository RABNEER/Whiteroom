## 2025-02-23 - Concurrency in aggregate queries
**Learning:** Found sequential independent database aggregate read queries in `apps/api/src/services/admin.ts`.
**Action:** Use `Promise.all` to run these independent queries concurrently.
