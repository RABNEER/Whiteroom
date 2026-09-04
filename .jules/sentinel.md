## 2025-02-24 - Fix Partial Path Traversal in Storage Endpoint
**Vulnerability:** The static file serving endpoint in `apps/api/src/index.ts` and the `uploadToStorage` function in `apps/api/src/lib/storage.ts` used `fullPath.startsWith(normalizedRoot)` to validate paths. This allowed a partial path traversal attack where a directory named, for example, `/app/data-secrets` would falsely pass the check if `normalizedRoot` was `/app/data`.
**Learning:** `startsWith` on strings is insufficient for path boundary validation because it matches string prefixes, not path segments.
**Prevention:** Always append the directory separator (e.g., `path.sep`) to the root path when using `startsWith` for path boundary checks (e.g., `fullPath.startsWith(normalizedRoot + path.sep) && fullPath !== normalizedRoot`).

## 2026-08-26 - [Path Traversal in Chunk Upload API]
**Vulnerability:** A path traversal vulnerability was discovered in the chunk upload API. The `sessionId` parameter, sourced directly from user form data, was passed unsanitized into a `path.join()` call to construct the local storage path for file chunks. A malicious actor could provide a `sessionId` like `../../../tmp` to write files to arbitrary locations on the host system.
**Learning:** We cannot assume IDs or identifiers are inherently safe simply because they are expected to be system-generated UUIDs. When constructing file paths, any part of the path that originates from user input (even indirectly) must be considered tainted and strictly validated.
**Prevention:** Always validate that constructed file paths resolve to the expected base directory. Use `path.normalize()` and ensure the resolved path `startsWith(normalizedRoot + path.sep)` to prevent both absolute path injection and relative path traversal attacks.

## 2023-10-27 - Path Traversal Vulnerability
**Vulnerability:** A path traversal vulnerability existed in `restoreAuthFromDb` where a database-supplied value (`row.key`) was concatenated to `authDir` using `path.join()`. This allowed arbitrary files on the local filesystem to be overwritten if an attacker poisoned the database with paths containing `../`.
**Learning:** Using `path.basename()` or `path.join()` alone does not protect against path traversal when the input path is complex or attacker-controlled.
**Prevention:** Always use `path.resolve()` on both the base directory and the target directory. Verify the resulting file path strictly starts with the base path, including the path separator (`path.sep`).
