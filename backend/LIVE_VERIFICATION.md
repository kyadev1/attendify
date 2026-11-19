# Phase 11B.2 ? local authorization verification

## Fresh sessions without manual JWT copying (recommended)

The script is local-only. Production authentication and all API contracts are unchanged. Application-table operations are SELECT/GET only: no event, profile, registration, attendance, RPC, or policy writes.

**Opting into --sign-in is not strictly read-only at the Auth level:** it creates Supabase Auth sessions and may update sign-in metadata/audit records. Use existing designated test accounts only. Depending on deployed single-session settings, signing in may affect another session of the same test account. No account creation, password reset, refresh, or global sign-out occurs. Access tokens live only in process memory; refresh tokens are discarded, no session is persisted. Sessions may remain valid until normal expiry; no sign-out is performed to avoid affecting other sessions.

In Windows PowerShell:

```powershell
Set-Location 'C:\Users\User\Desktop\attendify\backend'
notepad .env.verification.local
```

Enter credentials privately in that ignored file (never in shell commands/history or chat). The existing .gitignore excludes it. Do not commit, screenshot, sync, or share it. This is a plaintext local credential-file option, not encrypted storage: restrict access to your Windows user, avoid shared folders/backups, and remove credentials after use. Existing backend .env supplies the public Supabase configuration; do not put privileged keys in either file.

```dotenv
VERIFY_STUDENT_EMAIL=
VERIFY_STUDENT_PASSWORD=
VERIFY_ORGANIZER_EMAIL=
VERIFY_ORGANIZER_PASSWORD=
VERIFY_OTHER_ORGANIZER_EMAIL=
VERIFY_OTHER_ORGANIZER_PASSWORD=
VERIFY_PUBLISHED_EVENT_ID=
VERIFY_OWNED_EVENT_ID=
VERIFY_FOREIGN_EVENT_ID=
VERIFY_HIDDEN_EVENT_ID=
```

Use quoted dotenv values when needed for spaces or # characters. Do not alter your password to fit the file syntax. Keep the backend running on 127.0.0.1:3001 and run:

```powershell
node --env-file=.env --env-file=.env.verification.local scripts/verify-live.js --sign-in
```

The flag explicitly opts in to password sign-in immediately before verification. Old VERIFY_*_TOKEN values are ignored in this mode; missing credentials never fall back to stale tokens. There are no automatic login retries, avoiding repeated bad-password submissions. Missing Organizer B credentials block only dependent cases.

Each fresh access token is independently checked with Supabase Auth, followed by a SELECT of its matching database profile. The required roles are student, organizer, organizer; all three verified user IDs must be distinct. Decoding token expiry/format is only a diagnostic precheck, never a substitute for server verification.

Existing event fixtures must be real:

- Published event: readable by the Student and status published.
- Owned event: owned by Organizer A.
- Foreign event: independently witnessed by Organizer B as its owner, distinct from A.
- Hidden event: an existing non-published event owned by A.

No events are invented, created, or modified to satisfy fixtures. Missing, unreadable, or incorrectly owned fixtures remain UNVERIFIED and no dependent event API check runs. The script never prints identities, event content, credentials, session objects, tokens, API keys, or raw remote error messages.

## Optional existing-session mode

Without --sign-in, the prior VERIFY_STUDENT_TOKEN, VERIFY_ORGANIZER_TOKEN and VERIFY_OTHER_ORGANIZER_TOKEN variables are still supported. This mode never logs in. It now reports MALFORMED_TOKEN and EXPIRED_TOKEN separately. Fresh sign-in is preferred to repeated browser copying.

## Diagnostics and status meaning

PASS, FAIL, and UNVERIFIED are the only result statuses. API status/body mismatches are FAIL; unavailable account/event prerequisites are UNVERIFIED. Exit 1 means failed checks; exit 2 means incomplete verification; exit 0 means all attempted required checks passed. The invalid-token probe covers rejected-token handling; no naturally expired session is manufactured or claimed verified.

Safe fixed diagnostic codes distinguish malformed/expired token, rejected identity, invalid credentials, unconfirmed email, timeout, transport failure, upstream outage, rate limiting, missing profile, profile read failure, role mismatch, and duplicate identity. Unknown errors stay REQUEST_FAILED rather than guessing their root cause. No raw upstream error is printed. If a fixture expires during a run, rerun with --sign-in; no token refresh or authentication bypass is used.

## Expected contracts

The implemented route is **`GET /api/events/:id`**, not an event-list endpoint.

| Case | Expected result |
| --- | --- |
| Health | 200, `data.status: ok` |
| Missing or invalid token | 401, `UNAUTHORIZED`, no event data |
| Student / permitted published event | 200, matching ID, status and owner |
| Organizer / own event | 200, matching ID, status and owner |
| Organizer / another organizer's event | 404, exact generic NOT_FOUND response, no event data |
| Student / known non-published event | 404, exact generic NOT_FOUND response, no event data |

An explicit database permission failure can produce 403 under the existing error mapper. The scripted event-visibility cases expect the normal filtered-query 404 contract. A 403 is reported for investigation rather than silently counted as proof of the intended row filtering. Unexpected failures are reported without raw upstream messages; investigate privately without logging tokens.

## RLS interpretation

Code review establishes that each request forwards its verified user's bearer token through a separate public-key Supabase client. The trusted identity is obtained with `auth.getUser(token)`; role is loaded from the matching `profiles` row, not client-provided claims/role fields. Organizer ownership and Student published visibility are enforced in both query filters and defensive result checks. No privileged client was introduced.

API denial alone cannot prove RLS denies the same row: the Express query also filters it out. The script separately attempts a minimal direct SELECT for known forbidden fixtures under that same user's token, without app visibility filters, and reports only whether the row is visible. Direct visibility may be intentional (for example, broader published-event access) and requires policy review before declaring a security defect. A hidden known row is evidence for that account/fixture only, not proof of every deployed policy. Role write protection, SQL definitions, grants, and other tables remain unverified; no writes may be used to probe them in this phase.

## Phase 11B.2 implementation results

Local diagnostic precheck confirmed EXPIRED_TOKEN for Student, MALFORMED_TOKEN for Organizer A, and no Organizer B token. These are local format/expiry findings, not signature-verification results. None of the three fresh-sign-in credential pairs is configured. The previous broad failure messages obscured these different causes.

Files changed: `scripts/verify-live.js`, this guide. Files added: `scripts/verification-accounts.js`, `tests/verification-workflow.test.js`. Production source, credentials/configuration files, dependencies, and database definitions were unchanged.

`npm.cmd test --prefix backend`: **39 passed, 0 failed, 0 skipped** (24 existing plus 15 focused tooling tests). `npm.cmd run lint`: **passed**. Tests mock Auth and database operations; they do not create live sessions. No live password sign-in was attempted because designated credentials were unavailable. The frontend suite/build were not rerun for this tooling-only change; prior 213-test/build results below are historical.

Verified by isolated tests: opt-in fresh sign-in request, token handling without persistence, role verification, duplicate identity exclusion, expired/malformed diagnostics, missing credentials, upstream/transport errors and safe output. Live positive and negative event authorization and deployed RLS remain blocked pending valid accounts and real fixtures. No live success is claimed from mock tests.

## Historical Phase 11B results (not new live evidence)

- Running local health endpoint: **HTTP 200**.
- Missing token: **HTTP 401**.
- Intentionally invalid token: **HTTP 401**.
- Real Student and Organizer positive/negative event cases: **NOT VERIFIED — designated tokens and event IDs unavailable under the documented verification variables**.
- Event ownership isolation and live RLS row visibility: **NOT VERIFIED** pending those fixtures.
- Expired genuine token: **NOT VERIFIED**; safely rejected invalid token tested instead.
- One restricted-network run returned **503 UNAVAILABLE** for the invalid token, and a direct Supabase fetch failed at the transport layer. With approved network access, the direct Auth endpoint rejected the intentionally invalid token with HTTP 403 and the backend correctly normalized it to HTTP 401. The final script rerun reported zero failed checks and 11 unverified fixture-dependent checks. Transport availability was demonstrated to affect this check; the precise original DNS/TLS/network cause was not established. No application authorization defect was confirmed.

Regression verification executed after adding the workflow:

| Command | Result |
| --- | --- |
| `npm.cmd test --prefix backend` | 24 passed, 0 failed, 0 skipped |
| `node --experimental-vm-modules --test --test-reporter=tap tests/*.test.mjs` | 213 passed, 0 failed, 0 skipped |
| `npm.cmd run lint` | Passed; no errors or warnings |
| `npm.cmd run build` | Passed; no chunk-size warning |

The frontend test runner retains its experimental VM Modules notice. No assertions or production source were changed. The local verification script was run using only the existing backend configuration; the ignored fixture file was not created because designated fixtures were unavailable. Production build artifacts were regenerated by the build.

No backend implementation or frontend services were changed. Files added: `backend/scripts/verify-live.js` and this guide. Existing automated regression tests are retained; no new tests are needed for an unverified application defect. Live SQL/RLS/grants are unavailable from the repository and were not inferred.

Readiness: **foundation available, but live authorization verification is incomplete**. Do not claim live integration readiness from mock tests alone. Run this workflow with designated existing fixtures and review any discrepancies before approving gradual frontend API integration. No migration or deployment is included.
