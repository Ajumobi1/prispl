# Test coverage: auth flows + admin / Vault / soft-delete

Yes — the full scope fits in one session. It stays inside the two setups already in the repo (Vitest for logic, Playwright for the one browser spec), adds no new framework, and needs no schema or product changes.

## Approach

All new tests are **Vitest unit/contract tests** against the client API layer (`src/lib/*.ts`), with the backend client mocked via a small shared fake. That is where every security-relevant decision the browser makes actually lives: credential handling, account-status gating, admin guards, Vault ownership, soft-delete vs. permanent delete, trash filtering.

Edge-function behaviour (password reset, security question, rate limiting) is covered by asserting the **client-side contract** — what the app sends, and how it handles generic-error and 429 responses — rather than by hitting the live deployed functions. Live calls would mutate real accounts and real rate-limit counters, and would be flaky in CI.

## New files

```text
src/test/mocks/backend.ts        shared fake backend client + helpers
src/lib/authApi.test.ts          login, registration, approval states, admin guards
src/lib/recovery.test.ts         password reset + security question contracts
src/lib/api.test.ts              soft-delete / restore / trash isolation
src/lib/vaultApi.test.ts         Vault notes, records, files, ownership
```

## Coverage

**Auth**
- Login success returns username / full name / resolved role (admin vs user).
- Wrong credentials throw the single generic "Invalid username or password" message (no enumeration).
- Pending, declined and locked accounts each throw their specific message **and** are signed out again — the session must not survive a non-approved status.
- A valid auth user with no profile row is also signed out with the generic message.
- Registration: username normalisation, the 3-32 char charset rule, the 8-char password minimum, duplicate-username rejection, sign-out immediately after signup, and the security-answer call being routed to the backend function rather than written from the client.

**Password reset / security question**
- Happy path sends normalised username + answer + new password.
- Short password is rejected before any network call.
- A 403 generic-invalid response surfaces the same message for "wrong answer" and "no such user".
- A 429 surfaces a retry-after message and does not retry automatically.
- Security question fetch never reveals whether a username exists.

**Account Admin**
- approve / decline / lock / unlock each write the expected status.
- Every one of the four throws "Admin access required" for a non-admin session, and for a signed-out session.
- An admin cannot decline or lock their own account.
- User listing resolves roles correctly and is admin-gated.

**Vault**
- Create note / record / file stamps the current user as owner; anonymous creation is rejected.
- Listing is scoped and ordered as the UI expects; collection and tag filters narrow correctly.
- Update and delete paths surface backend permission errors as thrown errors rather than silent no-ops (the not-my-row case).

**Soft-delete / Trash**
- Delete sets `deleted_at` + `deleted_by`; it never issues a row delete.
- The normal task list filters to `deleted_at is null`; the trash list filters to the inverse — a trashed task cannot leak into the board.
- Restore clears both fields.
- Permanent delete issues a real delete and only from the trash path.

## Technical notes

- The fake backend is a chainable query-builder stub that records the calls made (`from`, `select`, `eq`, `is`, `not`, `update`, `insert`, `delete`, `order`) and returns queued results, so tests assert both the outcome and the exact query shape — that is what proves "delete didn't leak into the normal view".
- `src/integrations/supabase/client` is mocked with `vi.mock`; no network, no credentials, no live data touched.
- Runs under the existing `vitest.config.ts` / `src/test/setup.ts`; `npm test` picks them up with no config change.
- Existing tests (`task-types.test.ts`, `exports.test.ts`, the Playwright offline spec) are left untouched.

## Out of scope

Database-level RLS enforcement cannot be proven from the browser test layer — that needs two real accounts and live sessions. The tests above assert the client-side guards and query shapes; the policies themselves stay verified by the security scanner. Flagging so it is not mistaken for full end-to-end coverage.
