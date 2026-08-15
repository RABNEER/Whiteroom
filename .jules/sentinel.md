## 2026-08-15 - [SQL Injection in DB Execute]
**Vulnerability:** Found SQL Injection vulnerability using string interpolation with db.execute for an IN clause (whatsapp-bot.ts).\n**Learning:** Raw db.execute should be avoided for variable data queries in Drizzle.\n**Prevention:** Used Drizzle ORM's inArray to natively escape variables safely.
