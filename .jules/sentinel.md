## 2025-02-27 - Fix path traversal vulnerability in static file serving
**Vulnerability:** The `/api/v1/storage/files/*` endpoint used `startsWith()` to check if the requested file path was within the allowed directory. This is vulnerable to path traversal if the requested path starts with the allowed directory's name but continues with other characters (e.g., `startsWith('/app/data')` matches `/app/data-secret/foo.txt`).
**Learning:** `startsWith()` is not sufficient for path traversal checks unless a trailing directory separator is guaranteed, or checked for explicitly.
**Prevention:** Always check if the full path is exactly the normalized root, or if it starts with the normalized root appended with `path.sep`.
