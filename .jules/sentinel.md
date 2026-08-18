## $(date +%Y-%m-%d) - Prevent Partial Path Traversal Vulnerability
**Vulnerability:** Static file serving directory bound check in `index.ts` and `storage.ts` used `fullPath.startsWith(normalizedRoot)`, which allows partial matches (e.g., if root is `/uploads`, it allowed accessing `/uploads-secret/data.txt` which resolves to `true`).
**Learning:** `String.prototype.startsWith()` checks for string prefixes without contextual understanding of path separators.
**Prevention:** Ensure the prefix path ends with a directory separator `path.sep` before checking. Alternatively, use strict structural comparisons like checking if `path.relative()` starts with `..`.
