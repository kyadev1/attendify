# Attendify API — Phase 11A.1

Independent, read-only Express foundation. The frontend does not require this server and no existing service has been migrated.

## Run locally

Use Node 22.12+ (verified with Node 24.14.1). From `backend/`:

1. Run `npm ci`.
2. Copy `.env.example` to `.env` and supply the existing project's public Supabase configuration. Never use a secret/service-role key.
3. Run `npm start`, or `npm run dev` for watch mode.
4. Run `npm test` for isolated tests; no live database access is used.

The frontend continues to run from the repository root with `npm run dev`.

Required variables (values intentionally omitted):

- `SUPABASE_URL`: existing Supabase HTTPS project origin.
- `SUPABASE_PUBLISHABLE_KEY`: existing publishable key or legacy `anon` JWT key. Privileged key formats are rejected.
- `CORS_ORIGINS`: comma-separated exact frontend origins, without trailing slashes or wildcards.
- `HOST`: optional; defaults to loopback `127.0.0.1`.
- `PORT`: optional; defaults to `3001`.

No actual `.env` was created or existing environment file changed. Node loads backend `.env` with its native environment-file support. Configuration errors never print values. Use HTTPS and a trusted API origin outside local development. Never put server secrets into `VITE_*` variables. This phase is not deployed.

## Structure

```text
backend/
  .env.example
  package.json
  package-lock.json
  src/
    app.js          # HTTP configuration, CORS, route mounting
    config/
      env.js        # validated configuration
      supabase.js   # request-scoped public-key clients
    middleware/
      auth.middleware.js   # verified token + database profile
      error.middleware.js  # safe HTTP error responses
    modules/
      events/
        event.routes.js     # endpoint registration
        event.controller.js # HTTP validation and response envelope
        event.service.js    # scoped query and visibility checks
      health/
        health.routes.js    # liveness endpoint
    utils/
      errors.js     # ApiError and database error mapping
    server.js       # listener and bounded graceful shutdown
  tests/api.test.js
```

`app.js` configures Express, CORS, and middleware order. Authentication remains mounted before the events router. The controller passes only the verified account, request-scoped client, and validated identifier to the service; the service has no Express request/response dependency. The service preserves the existing query filters, defensive ownership/status checks, selected columns, and error mapping. The controller returns the same `{ data }` envelope. The health handler is small enough to remain in its router without extra controller/service files.

Dependencies flow from server to app, middleware and routers, then controller to service to shared errors. Configuration and shared errors do not import feature modules; there are no circular local imports.

## Phase 11A.1 refactor report

Previously, `src/` was flat: `app.js`, `auth.js`, `config.js`, `errors.js`, `events.js`, `server.js`, `supabase.js`. It now uses the structure above.

Complete source/test/documentation change list (relative to `backend/`):

| Previous file | New location or change |
| --- | --- |
| `src/config.js` | Moved unchanged to `src/config/env.js` |
| `src/supabase.js` | Moved unchanged to `src/config/supabase.js` |
| `src/auth.js` | Moved to `src/middleware/auth.middleware.js`; error import updated |
| `src/errors.js` | Helpers moved to `src/utils/errors.js`; HTTP handler extracted to `src/middleware/error.middleware.js` |
| `src/events.js` | Replaced by `src/modules/events/event.routes.js`, `event.controller.js`, and `event.service.js` |
| `src/app.js` | Updated imports; health handler extracted to `src/modules/health/health.routes.js` |
| `src/server.js` | Updated configuration import only |
| `tests/api.test.js` | Updated two configuration imports only; assertions unchanged |
| `README.md` | Updated structure, responsibilities, and verification report |

Old flat files were removed, with no compatibility copies or empty placeholders. Package scripts, dependencies, lockfile, `.env.example`, `.gitignore`, frontend source and the shared frontend API client were unchanged. Existing `.gitignore` rules exclude `.env` and `.env.*` while allowing the credential-free `.env.example`. Production build artifacts were regenerated during verification.

Security and contracts: `GET /api/health` and `GET /api/events/:id` retain their authentication requirements, status codes, response bodies, and visibility rules. Supabase token verification, stored-profile roles, user-scoped clients/RLS, CORS, safe error handling, timeouts, and graceful shutdown were retained. No database calls were made against live records; no schema, policy, RPC, role, or QR workflow was changed.

Verification after refactor:

| Command/check | Result |
| --- | --- |
| `npm.cmd test --prefix backend` | 24 passed; 0 failed/skipped |
| `node --experimental-vm-modules --test --test-reporter=tap tests/*.test.mjs` | 213 passed; 0 failed/skipped |
| `npm.cmd run lint` | Passed, including backend; no errors/warnings |
| `npm.cmd run build` | Passed; no chunk-size warning |
| Backend startup and health | Real loopback HTTP listener tested with mocked Supabase; 200 and unchanged body; zero database queries |
| Import review | No references to removed module paths; no circular local dependencies |

The frontend test runner emits its existing experimental VM Modules notice. Route guards and direct-route checks remain covered by the existing frontend suite. Live browser authentication, deployed RLS/profile-role integrity, and production behavior remain unverified as documented below; this structural refactor does not resolve those limitations.

Verdict: **PASS — ready for future modules at the architecture level.** Production security verification remains a separate prerequisite before deployment. No new feature or deployment was introduced.

## HTTP contract

- `GET /api/health`: unauthenticated liveness, `{ "data": { "status": "ok" } }`. Does not assert database readiness or connectivity.
- `GET /api/events/:id`: requires `Authorization: Bearer <Supabase access token>`. Returns `{ "data": <event row> }` with exactly the columns selected by the current frontend event service: `id, organizer_id, title, category, description, venue, starts_at, ends_at, capacity, status, image_url`. Raw snake-case representation is intentional; no guessed registration counts or computed availability fields.
- Errors: `{ "error": { "code": "...", "message": "..." } }`. Missing/invalid token: 401; unsupported role/RLS permission denial: 403; unavailable or non-owned event: 404; invalid input: 400; upstream outage: 503. Unauthorized event existence is not disclosed.

Only reads are supported. IDs are bounded opaque alphanumeric/hyphen/underscore values because the SQL ID type is unavailable. Database ID cast errors become 400. Query parameters are rejected, including attempts to supply account or role. Missing/foreign records have the same response. CORS permits only configured origins, GET preflight, and Authorization/Content-Type headers. Requests without Origin are allowed but still authenticate; CORS is not authorization. Responses use no-store; no user data or tokens are logged. Upstream calls have a 10-second bound. SIGINT/SIGTERM stop accepting requests, close idle connections, and allow up to 15 seconds before closing remaining connections.

## Authentication and authorization

Each request creates a new public-key Supabase client with that request's bearer token. `auth.getUser(token)` verifies identity with Supabase Auth. The role comes from the authenticated user's `profiles` row, not request metadata, a supplied user ID, or a locally decoded JWT. Allowed roles are the existing `student` and `organizer` only.

Students may read published events, consistent with `EventRegistration.jsx`; expired published events remain viewable as details. Organizers may read only their own events, including drafts, consistent with EventsProvider. Both query filters and a defensive result check enforce these rules. The user token is forwarded to PostgREST so existing RLS still applies. No service-role client, admin API, direct PostgreSQL credentials, or mutation endpoint exists.

Actual SQL/RLS/profile-role write permissions are unavailable in the repository. In particular, the server cannot establish from source whether users can improperly edit their stored role. Verify deployed policies before exposing the API publicly. This implementation does not claim to repair or independently prove existing policies. Supabase access-token revocation/expiry semantics remain unchanged; a server request is not a substitute for a global session-revocation system.

## Existing architecture preserved

`src/services/supabase.js` is the active browser client. `supabaseClient.js` and the older `*Api.js` files are placeholders. AuthContext retains sign-up, sign-in, session restoration, token lifecycle and sign-out. Its account generation and EventsProvider's owner/version/revision guards, request cancellation, 60-second metadata cache, and attendance polling are unchanged.

Existing service contracts remain untouched:

- `register_for_event({ p_event_id })` → registration row mapped by `mapRegistration`.
- `check_in_ticket({ p_registration_id, p_event_id, p_student_id })` → array whose first row confirms attendance.
- `get_event_registration_counts()` → rows containing `event_id, registration_count`.
- `get_attendance_records()` → rows containing registration, event, student, and timestamp fields mapped by the attendance service.

No SQL migrations, RPC definitions, RLS policy definitions, constraints or indexes were present to verify. No tables, policies, RPCs, or live records were created or modified.

Supabase Auth should remain directly integrated with the browser. Future Express endpoints can centralize authorized reads and orchestration, while transactional registration and check-in remain in the existing PostgreSQL RPCs. Do not migrate mutations until their actual SQL/security contracts are reviewed.

## Opt-in frontend client

`src/services/apiClient.js` exports `createApiClient({ supabase, baseUrl })`. Pass the existing browser Supabase instance and an explicitly trusted API origin. Call `get('/api/events/<id>', { signal, isCurrent })`; when integrating with AuthContext, pass its captured-generation check as `isCurrent`.

The helper reads the current session token per request; the backend, not browser session data, verifies it. It does not store tokens, send cookies, or implement authentication. It normalizes failures, times out requests, supports cancellation, rejects arbitrary request URLs, unsubscribes its auth listener, and discards results when account identity changes. Same-account token refresh remains valid. No singleton or environment variable is required until an endpoint is deliberately adopted. An optional future `VITE_API_BASE_URL` would be a public trusted origin, not a credential.

## Verification and limitations

Phase 11A adds 24 isolated backend/client tests covering real local HTTP startup/health, role/ownership/visibility, missing/invalid tokens, errors, CORS, independent identities, forbidden privileged-key configuration, and frontend session behavior. Database calls are mocked. Existing frontend suite: 213 passing, including guard/direct-route and SPA fallback checks. ESLint passes; production build passes without the previous chunk warning. Dependency installation audit reported zero vulnerabilities at installation time; this is not a security guarantee.

Changed existing files: `.gitignore` (exclude environment secrets) and `eslint.config.js` (Node globals for backend). New files: all backend files listed above and `src/services/apiClient.js`. Root dependencies, existing pages/providers/services, routes, and database operations were not changed. Build artifacts were regenerated by verification.

Live authenticated browser/API integration, deployed RLS visibility and role integrity, production hosting/TLS, cross-device behavior, and deployment-scale rate limiting remain unverified/out of scope. The health test is not a live Supabase probe. Before public deployment, verify database policies and add operational rate limits, monitoring, and hosting configuration appropriate to the environment.

Recommended next step: approve read-only verification of deployed schema/RLS and a small opt-in event-details integration with account-generation guards. Do not migrate event creation, registration, or attendance yet.

References: [Supabase user verification](https://supabase.com/docs/reference/javascript/auth-getuser), [Supabase user-scoped RLS context](https://supabase.com/docs/guides/functions/auth-legacy-jwt), [Express 5 async error handling](https://expressjs.com/en/5x/guide/error-handling/).
