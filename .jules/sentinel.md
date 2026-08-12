## 2026-08-22 - [SQL Injection Fix]
**Vulnerability:** A SQL injection vulnerability was found in `apps/api/src/services/whatsapp-bot.ts` where a raw SQL `DELETE` query was being executed using `db.execute()` with string concatenation inside an `IN` clause to remove junk cache entries from the `whatsapp_bot_store` table.
**Learning:** Even internal cache cleanup tasks must use secure database interaction methods to prevent potential exploitation if the data sources (like file paths or keys) become user-controllable.
**Prevention:** Avoid raw SQL string interpolation for `IN` clauses. Always use Drizzle's parameterized `inArray()` helper combined with `db.delete()` to ensure values are properly escaped by the underlying driver.
