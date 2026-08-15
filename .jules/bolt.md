## 2024-05-18 - Drizzle ORM Multiple Counts
**Learning:** Found multiple instances where independent count queries on different tables (or the same table with different conditions) were executed sequentially in `apps/api`. While connection pooling is active, waiting for one round trip to finish before starting the next adds unnecessary latency.
**Action:** When aggregating multiple independent metrics (like dashboard stats or platform totals), always wrap the Drizzle `db.select({ value: count() })` queries in a `Promise.all()` to execute them concurrently.
