## 2024-06-12 - [SQL Injection via String Interpolation in db.execute]
**Vulnerability:** Raw string interpolation was used to construct an `IN` clause for a `DELETE` SQL query in `apps/api/src/services/whatsapp-bot.ts` via `db.execute()`. Even though it used replacing to try and escape single quotes, this is a dangerous anti-pattern and prone to SQL injection vulnerabilities if user-controlled input manages to bypass the replacement.
**Learning:** Raw SQL strings in Drizzle's `db.execute` should not be built via string interpolation, especially for `IN` clauses containing dynamic arrays.
**Prevention:** Always use parameterized queries or Drizzle ORM's built-in query builder methods such as `.where(inArray(...))` to handle dynamic variables safely and avoid SQL injection vectors.
