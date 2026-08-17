## 2024-05-19 - Concurrent count and select queries using Promise.all in Drizzle ORM
**Learning:** For database pagination where both a total `count()` and paginated `select()` are required, running them sequentially blocks the CPU unnecessarily. Using Drizzle ORM, they can be safely executed concurrently using `Promise.all()`.
**Action:** Always wrap independent read queries (like counting total records and fetching the current page's data) in `Promise.all()` to minimize database roundtrips and lower overall endpoint latency.
