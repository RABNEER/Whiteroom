## 2026-08-13 - Prevent SQL Injection with Drizzle ORM
**Vulnerability:** A raw SQL string interpolation in `db.execute()` was used for an IN clause: `DELETE FROM whatsapp_bot_store WHERE key IN (${...})`, potentially leading to SQL Injection even with rudimentary replace.
**Learning:** Drizzle ORM provides a safer way to construct IN clauses without raw SQL.
**Prevention:** Always use Drizzle's parameterized `inArray()` helper (e.g., `db.delete().where(inArray(...))`) to prevent SQL injection vulnerabilities and avoid raw SQL `db.execute()` string manipulation.
