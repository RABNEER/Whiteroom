<!-- SPECKIT START -->
For additional context about technologies to be used, project structure,
shell commands, and other important information, read the current plan:
`specs/001-auth-multitenancy/plan.md`
<!-- SPECKIT END -->

<!-- CONSTITUTION -->
Before writing any code, read `.specify/memory/constitution.md` for
non-negotiable principles, locked technology stack, and forbidden patterns.
<!-- /CONSTITUTION -->

<!-- WHATSAPP AUTH RULES -->
# WhatsApp Bot Auth Rules (CRITICAL - DO NOT BREAK)
When modifying `apps/api/src/services/whatsapp-bot.ts` or auth routes:
1. **Lazy Initialization**: NEVER auto-initialize Chromium at top-level import. Use `initWhatsAppBot()`.
2. **PostgreSQL Session Persistence**: Session files in `.wwebjs_auth` MUST sync to/from PostgreSQL `whatsapp_bot_store` (`saveAuthToDb` & `restoreAuthFromDb`).
3. **Multi-Device (@lid + @c.us)**: Messages from both `@c.us` AND `@lid` JIDs MUST be processed. NEVER reject `@lid` JIDs.
4. **Container Low-Memory Flags**: Chromium MUST keep `--single-process`, `--disable-gpu`, `--disable-dev-shm-usage`, and `--js-flags=--max-old-space-size=256`.
5. **Periodic & Shutdown Sync**: Session MUST sync on `authenticated`, `ready`, 15s delayed post-auth, 2min periodic, and `SIGTERM`/`SIGINT`.
<!-- /WHATSAPP AUTH RULES -->
