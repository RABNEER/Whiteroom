## 2026-06-25 - Parallelizing independent database queries in Drizzle
**Learning:** Sequential, independent database read queries (`count()`, `select()`) cause unnecessary cumulative latency in the Hono API handlers.
**Action:** When multiple unlinked aggregates or data selections are needed, group the promises using `Promise.all()` to take advantage of connection pooling, turning O(n) latency into O(1) connection usage.
