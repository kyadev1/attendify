# Phase 11C.1 — development API client preparation

## Decision and scope

Implemented the explicitly permitted **API-client and isolated-tests fallback**. No page operation now uses Express. Negative live authorization checks (organizer ownership, foreign-event denial, restricted-event denial, and RLS isolation) remain deferred, not passed. The previous verified organizer fixture had a student profile; the newer user-reported Organizer A authentication pass does not establish ownership/negative access coverage.

The existing endpoint is `GET /api/events/:id`, not a list endpoint. The safest candidate is one event detail read. Current detail pages use EventsProvider's shared snapshot, which also combines registration counts and attendance. Replacing that snapshot with the single-event response or adding an unconditional second request would change semantics or duplicate reads. No such replacement was made before authorization verification and a scoped page integration are ready.

## Exact files

- Modified `src/services/apiClient.js`: checks stale scope and pre-aborted requests before session work, rejects missing identity/known-expired sessions, refuses redirects, and retains HTTP status even for non-JSON gateway errors. It continues to sanitize error messages and discard account-switched responses.
- Added `src/services/developmentEventApi.js`: environment-gated, read-only single-event adapter; validates ID, requires caller scope checks, validates matching returned ID, and has no fallback/cache/retry/mutation path.
- Added `tests/development-api.test.mjs`: 21 isolated regression tests.
- Added `docs/PHASE11C1.md`: this report and setup guide.

No credentials, environment files, backend implementation, providers, routes, page UI, production services, dependencies, database records, policies, or RPCs were changed. Build artifacts were regenerated.

## Configuration and local running

In the repository-root ignored `.env.local`, optionally set these **public configuration values**, keeping existing Supabase configuration intact:

```dotenv
VITE_API_BASE_URL=http://127.0.0.1:3001
VITE_ENABLE_EXPRESS_EVENT_READ=true
```

No environment file was edited automatically. The flag requires the exact string `true`, Vite `DEV === true`, and `PROD !== true`. Absent/false flags and production mode disable the adapter without requiring a URL or creating a client. Disabled adapter calls reject with `FEATURE_DISABLED`; they do not fall back to Supabase. These settings prepare the adapter only: **setting the flag does not switch existing pages to Express**. Restart Vite after configuration changes. Use a trusted API origin; it receives the user's bearer token. Never place private keys in Vite variables.

Terminal 1:

```powershell
Set-Location 'C:\Users\User\Desktop\attendify\backend'
npm start
```

Terminal 2:

```powershell
Set-Location 'C:\Users\User\Desktop\attendify'
npm run dev
```

Backend `CORS_ORIGINS` must match the actual Vite browser origin exactly (localhost and 127.0.0.1 differ). Use the existing public Supabase project configuration. The frontend still works with the backend stopped.

## Before and after request flow

Existing pages, before and after: React → EventsProvider → existing Supabase services/RPCs. Existing loading/error/retry behavior, cache invalidation, polling, registration, creation and QR check-in remain intact.

Prepared adapter, only when deliberately called in development: `createDevelopmentEventApi({ supabase })` → `getEvent(id, { signal, isCurrent })` → current Supabase session token → Express `/api/events/:id` → verified user-scoped Supabase query. The response remains the raw snake-case API row; a future approved page integration should reuse `mapEvent` and retain existing aggregate semantics rather than inventing counts.

The required `isCurrent` callback must capture account generation plus role and component/request lifetime, matching EventsProvider's existing protections. It is checked before and after awaits. The generic client additionally observes sign-out/account changes and unsubscribes after the request. Same-account token refresh is preserved; roles are not trusted from frontend data for server authorization. Supabase still manages authentication/refresh; a rejected session is surfaced rather than causing automatic logout that could affect a newer account. No tokens are logged or persisted by the adapter.

Each call makes at most one API request. There is no automatic retry, alternate data source, effect-driven double fetch, or cross-account response cache. This is not a global deduplication cache; a future page caller must manage concurrent submissions/request lifetime. Existing pages make no new requests in this phase.

## Verification

| Command | Result |
| --- | --- |
| `node --experimental-vm-modules --test --test-reporter=tap tests/*.test.mjs` | 246 passed, 0 failed/skipped (225 previous + 21 new) |
| `npm.cmd test --prefix backend` | 39 passed, 0 failed/skipped |
| `npm.cmd run lint` | Passed, no errors/warnings |
| `npm.cmd run build` | Passed, no chunk-size warning |

Tests cover authenticated Student requests, absent/expired sessions, API 401/403/404/500/503, non-JSON errors, network errors, account/logout/role-scope changes, stale responses, cancellation, required scope, path safety, disabled defaults, and production exclusion. Existing backend invalid-token tests and frontend Supabase/login/account-isolation tests remain green. Tests are isolated; no live Supabase writes or new live authorization claims. Node's existing experimental VM Modules notice remains test-only.

## Readiness

**Ready as a development-gated client foundation, not as a wired page integration.** Deferred authorization and RLS checks remain blockers to the page switch under the requested fallback. Complete those checks, then approve a narrowly scoped single-event detail integration preserving existing loading/error/retry and shared registration semantics. No Phase 11C production migration or deployment has occurred. Removing/setting the flag false requires no data migration.
