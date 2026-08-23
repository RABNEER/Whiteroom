## 2025-02-24 - Fix Partial Path Traversal in Storage Endpoint
**Vulnerability:** The static file serving endpoint in `apps/api/src/index.ts` and the `uploadToStorage` function in `apps/api/src/lib/storage.ts` used `fullPath.startsWith(normalizedRoot)` to validate paths. This allowed a partial path traversal attack where a directory named, for example, `/app/data-secrets` would falsely pass the check if `normalizedRoot` was `/app/data`.
**Learning:** `startsWith` on strings is insufficient for path boundary validation because it matches string prefixes, not path segments.
**Prevention:** Always append the directory separator (e.g., `path.sep`) to the root path when using `startsWith` for path boundary checks (e.g., `fullPath.startsWith(normalizedRoot + path.sep) && fullPath !== normalizedRoot`).
## 2025-05-18 - [Fix Insecure CORS Configuration]
**Vulnerability:** Found a CORS misconfiguration where `hono/cors` was allowing any origin because it returned `origin` by default in production.
**Learning:** Returning `origin` to a CORS config callback implicitly allows it.
**Prevention:** In a `hono/cors` configuration with dynamic origins, always return `""` or throw an error for unmatched origins to properly block them in production.
