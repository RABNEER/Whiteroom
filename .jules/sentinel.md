## 2024-05-18 - [Fix Partial Path Traversal]
**Vulnerability:** Found a partial path traversal vulnerability in `apps/api/src/index.ts` where `fullPath.startsWith(normalizedRoot)` was used without enforcing a directory boundary.
**Learning:** Using `startsWith` for path verification without appending a path separator allows access to directories with the same prefix (e.g., if root is `/var/www/uploads`, an attacker can access `/var/www/uploads_secret`).
**Prevention:** Always append `path.sep` to the base directory path before performing `startsWith` validation to ensure strict directory boundaries.
