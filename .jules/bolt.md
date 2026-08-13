## 2024-05-18 - Promise.all Database Parallelization Pattern
**Learning:** Sequential, independent database read queries (like aggregate counts or fetches from different tables) can block the event loop and add significant database latency.
**Action:** Always identify independent database reads (especially in dashboard or billing metric calculation endpoints) and execute them concurrently using `Promise.all()` to take advantage of the database connection pool. This is a recurring anti-pattern that can be fixed easily for a measurable speed boost.

## 2024-05-18 - Testing with Environment Variables
**Learning:** Testing the API sometimes throws `error:1E08010C:DECODER routines::unsupported` related to JWT private keys. This happens because the test suite tries to load keys from the `.env` (or mock environment) and fails to parse placeholder values like `-----BEGIN PRIVATE KEY-----...`.
**Action:** When running tests that parse environment variables using `source .env.test`, completely clear out `JWT_PRIVATE_KEY` and `JWT_PUBLIC_KEY` (e.g. `JWT_PRIVATE_KEY=""`) so the code falls back to its default testing mock implementations instead of crashing the crypto module.