# Database-level RLS verification suite

## Goal
Prove actual Postgres Row-Level-Security enforcement on `tasks`, `vault_notes`, `vault_records`, `vault_files`, and `profiles`/`user_roles` using real authenticated sessions — not just client-side guards. Extends the existing Playwright setup (`tests/offline-shell.spec.ts` pattern); no new framework.

## Environment honesty
- No separate staging backend exists; tests run against this project's dev backend (what the preview uses). The published site's production environment is not touched.
- Three throwaway accounts (`rls-test-a`, `rls-test-b` regular approved users, `rls-test-admin`) are created at suite start and fully deleted at the end, along with every row/file they created. Cleanup runs even on failure, and setup purges any leftover `rls-test-*` accounts from a crashed prior run.

## What gets built

### 1. `rls-test-support` edge function (new, secret-gated)
- Same pattern as existing `seed-admin`: requires an `x-test-secret` header matching a new `RLS_TEST_SUPPORT_SECRET` project secret.
- Hard restriction: only operates on usernames prefixed `rls-test-`; refuses everything else, so it can never provision or delete real accounts.
- Actions: `setup` (purge leftovers, create user A / user B / admin, all approved, return IDs + generated passwords), `cleanup` (delete test rows, storage objects, then the auth users).
- Uses service role internally; never exposes the service key.

### 2. Soft-delete SELECT policy migration (one policy, required for the soft-delete bullet to pass)
- Replace `Approved users can view tasks` with: approved users see rows where `deleted_at IS NULL`, plus their own trashed rows (needed for the Trash view) — admins see everything.
- No other policy or logic changes.

### 3. `tests/rls.spec.ts` — Playwright E2E, API-level via `@supabase/supabase-js`
Seeded data: user A and user B each own a task, note, record, and vault file. Assertions (~30):

**Cross-user isolation (as user B against A's data):**
- Cannot update or delete A's vault note/record/file (RLS error / zero rows)
- Cannot delete A's storage object in `vault-files`
- Can read A's vault rows and task (org-shared by design — documents intent)
- Can update A's task fields but CANNOT soft-delete it (DB trigger blocks)
- Cannot hard-delete any task (DELETE denied for everyone)

**Soft-delete enforcement:**
- A's trashed task is invisible to B at the API level, still visible to A (Trash view) and to admin

**Privilege-escalation (as regular user):**
- Cannot insert/update/delete rows in `user_roles` (self or others)
- Cannot change another user's profile, nor own `status`/`username`/`department` via the lockdown policy
- Cannot approve/decline/lock accounts; a pending user cannot even read tasks

**Admin scope (and its limits):**
- Can read all profiles, update statuses, manage roles, soft-delete/restore any task
- CANNOT hard-delete tasks, and cannot see `profile_recovery` data (no grants)

### 4. Run + verify
- Execute the suite against the live dev backend; report pass/fail per assertion.
- If any assertion beyond the known soft-delete gap fails, that is a real vulnerability finding — report it, fix the policy, re-run.
- Confirm post-run state: zero `rls-test-*` users, rows, or storage objects remain.

## Assumptions (correct me if wrong)
- Shared-read of tasks/vault across approved users is intended and stays.
- The soft-delete SELECT migration (owner/admin can see trashed rows; others cannot) is acceptable — it changes what non-owners can fetch via direct API calls, not what the UI shows.
- The `rls-test-support` function stays deployed (secret-gated, `rls-test-` prefix only) so the suite can be re-run as a regression check.
