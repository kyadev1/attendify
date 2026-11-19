# Attendify — Batch 6 performance and scalability report

Date: 2026-11-03. Scope: frontend performance only; Batches 1–5 preserved.

## 1. Root causes

- App eagerly imported all role pages and the ticket renderer, making their code part of startup. Camera decoding was already dynamically imported and remains so.
- Six production PNG assets totaled approximately 6.03 MB, despite being displayed at substantially smaller sizes.
- Event and student-registration table reads were unpaginated. Server result limits could silently omit records.
- Attendance polling reloaded event metadata on every cycle and organizers fetched a registration table result that their RPC-derived roster already replaced.
- Dashboard joins repeatedly searched arrays. Attendance cells repeatedly constructed date formatters, and the monitor rendered its entire roster.
- Monitor CSV generation used cached rows synchronously, without establishing that the selected event's roster was complete.

These findings came from source inspection, baseline/final builds, and isolated tests. Database function definitions were unavailable; their implementation and production limits are not verified.

## 2. Bundle changes and measurements

React.lazy and accessible Suspense fallbacks now load authentication, student, organizer, attendance, digital-ticket, and scanner features on demand. Existing route guards and URLs remain unchanged. A page error boundary provides a safe reload action for failed chunks and resets when navigating to a different page. Shared framework, Supabase, icons, and UI code are grouped without importing role pages into startup. The camera decoder still loads only when starting the camera.

Measurements are uncompressed decimal bytes from production builds unless stated otherwise:

| Measurement | Before | After |
| --- | ---: | ---: |
| Application entry JavaScript | 617,904 | 26,970 |
| Startup static JavaScript graph, including shared dependencies | 617,904 | 500,439 |
| Login JavaScript, including shared dependencies and login feature | 617,904 | 527,483 |
| All generated JavaScript | 986,644 | 997,726 |
| Production image assets | 6,026,976 | 479,436 |
| Chunk-size warning | Present | Absent |

Startup JavaScript decreased **19.0%**; login's full JavaScript requirement decreased **14.6%**. The 27.0 kB entry is not the entire startup download. Aggregate JavaScript increased about 1.1% with the added safeguards and features; the improvement is deferred loading and caching, not elimination of all code. There are 14 JavaScript chunks. The largest is the approximately 368.75 kB camera decoder; framework is 258.40 kB and Supabase is 214.47 kB. No warning threshold was increased.

Build module inspection identified React/React DOM/router and Supabase as substantial necessary dependencies. No packages were added or removed. No network-speed or browser-interaction improvement is claimed from byte counts alone.

## 3. Image optimization

Existing image content was reused. Category images became quality-90 JPEG derivatives at 1280 px width with preserved aspect ratios. The login background retained its native resolution. The transparent logo became a 256 × 256 PNG. Original files remain unchanged; production imports reference the optimized derivatives.

| Asset | Original bytes | Optimized bytes |
| --- | ---: | ---: |
| Arts | 1,218,368 | 75,110 |
| Career | 1,100,705 | 64,718 |
| Community | 1,093,468 | 83,645 |
| Technology | 1,003,133 | 49,157 |
| Login background | 1,484,039 | 164,199 |
| Logo | 127,263 | 42,607 |

Total reduction: **92.0%**. All six optimized assets were visually inspected. Existing image framing and layout were preserved; explicit logo dimensions and lazy preview loading were added. Actual high-DPI/mobile browser presentation still warrants manual verification. JPEG was produced with an available native encoder; no image dependency was installed.

## 4. Data reads, rendering, and polling

Event and student-registration table reads now use deterministic ascending-ID keyset pagination, requesting up to 500 rows per page. Each page repeats the existing role/account filters. The first page requests an exact count; when count metadata is unavailable, reads continue until an empty page rather than assuming a short page means completion. Results are restored to their existing date order after collection. Invalid ordering, duplicates, incomplete counts, page failures, cancellation, and stale sessions reject the read instead of publishing partial data.

Full refreshes abort superseded reads and retain existing request-version, authentication-generation, and mutation-revision checks. Initial data still commits atomically to preserve Batch 5 loading/error semantics. Organizer reads omit the unused student-registration query. A session-owned event metadata cache lasts at most 60 seconds during background attendance synchronization; manual refresh fetches events, and confirmed mutations invalidate the cache. Logout and unmount clear it.

The existing 15-second polling, visibility/focus/reconnect handling, timeout, retry/backoff, and cleanup remain in place. Attendance and counts are refreshed each cycle. With one-page datasets and exact-count metadata, four steady polls with a warm event cache require approximately 9 organizer reads instead of 16, and 13 student reads instead of 16. Larger datasets require more page requests, and exact counts incur database work. Externally changed event metadata may take up to 60 seconds plus request latency to refresh; attendance retains its 15-second cadence plus latency.

Dashboard joins use maps/sets. Attendance joins and filtering are memoized, date formatters are reused, and the monitor displays 100 records per page. Display pagination does not restrict CSV export.

Illustrative local Node measurements: a 2,000-event/10,000-registration lookup changed from 143.77 ms with repeated search to 1.50 ms with a map; formatting 200 date cells changed from 44.08 ms with repeated formatter construction to 0.36 ms with reuse. These are single-run algorithm checks, not browser benchmarks or promised production timings.

## 5. CSV completeness and database limitations

Export fetches a fresh authorized roster for the selected owned event and compares its size against the existing registration-count RPC. Missing counts, mismatched counts, or duplicate/missing registration identifiers stop the export with an accessible error. No partial file or false success message is produced. Existing event, name/ID, and attendance-status filters apply to the complete verified roster, independently of display pagination.

CSV creation yields between 500-row chunks, preserves full timestamps, quotes/escapes fields, protects against spreadsheet formulas, and retains the download format. Duplicate clicks are blocked. Session changes, unmount, and event changes cancel export; checks also run during CSV generation and before download.

**Remaining database limitations:** SQL definitions and RPC return types were not available. No speculative RPC pagination parameters or direct-table attendance bypass were introduced. `get_attendance_records` and `get_event_registration_counts` remain on their existing contracts. A server-capped roster can therefore make export fail explicitly until an approved, verified paginated RPC is available. Dashboard/monitor completeness above RPC limits remains unverified. The count comparison assumes the existing aggregate's intended semantics; it does not independently audit its SQL or RLS.

Table pagination uses separate HTTP requests, not a transactional snapshot. Concurrent modifications can trigger count mismatch errors requiring retry; some changes before the cursor may only appear on the next refresh. Full authorized datasets are still held in memory for current application semantics. These changes improve current behavior but are not a claim of unlimited scalability.

## 6. Exact files changed

Paths below are relative to the project root. New files are marked “new.”

### Routing and build

- `src/App.jsx` — lazy route elements, loading fallbacks, page boundaries.
- `src/routes/authPages.jsx` — grouped authentication exports (new).
- `src/routes/studentPages.jsx` — grouped student exports (new).
- `src/routes/organizerPages.jsx` — grouped organizer exports (new).
- `src/routes/attendancePages.jsx` — grouped attendance exports (new).
- `src/routes/PageBoundary.jsx` — safe chunk-load error recovery (new).
- `src/styles/globals.css` — route-loading spacing/wrapping.
- `vite.config.js` — measured chunk grouping.

### Data and reporting

- `src/services/readAllPages.js` — guarded keyset pagination (new).
- `src/services/eventService.js` — paginated scoped event reads.
- `src/services/registrationService.js` — paginated scoped student registration reads.
- `src/services/attendanceService.js` — verified export roster read.
- `src/context/EventsProvider.jsx` — request cancellation, scoped metadata cache, redundant-read removal, authorized report loading.
- `src/utils/dashboardData.js` — indexed joins.
- `src/utils/exportAttendance.js` — filtered, chunked, cancellable CSV generation/download.
- `src/pages/organizer/components/AttendanceMonitor.jsx` — fresh verified export, memoized rows, formatter reuse, display pagination.
- `src/pages/organizer/styles/AttendanceMonitor.module.css` — pagination control layout.

### Asset references and derivatives

- `src/authentication/components/AuthLayout.jsx` — optimized logo reference/dimensions.
- `src/authentication/styles/AuthLayout.module.css` — optimized background reference.
- `src/components/Sidebar/components/Sidebar.jsx` — optimized logo reference/dimensions.
- `src/pages/student/components/BrowseEvents.jsx` — optimized category references.
- `src/pages/student/components/DigitalTicket.jsx` — optimized logo reference/dimensions; QR/download logic unchanged.
- `src/pages/organizer/components/MyEvents.jsx` — optimized category references.
- `src/pages/organizer/components/EventManagement.jsx` — optimized category references.
- `src/pages/organizer/components/CreateEventForm.jsx` — optimized category references and lazy preview decoding.
- `src/assets/Arts.jpg` (new).
- `src/assets/Career.jpg` (new).
- `src/assets/Community.jpg` (new).
- `src/assets/Technology.jpg` (new).
- `src/assets/attendify-login-bg.jpg` (new).
- `src/assets/ttendify-logo-optimized.png` (new; follows the existing logo filename spelling).

### Tests and documentation

- `tests/performance.test.mjs` — 34 paging, service, session, polling, rendering, and export tests (new).
- `tests/lazy-routes.test.mjs` — 6 route, guard, boundary, build-graph, and preview tests (new).
- `tests/helpers/renderModule.mjs` — isolated harness support for new imports and lazy components.
- `tests/async-flows.test.mjs` — new service export stub compatibility.
- `tests/session-isolation.test.mjs` — new service export stub compatibility.
- `tests/attendance-sync.test.mjs` — new service export stub compatibility.
- `tests/loading-accessibility.test.mjs` — new service export stub compatibility.
- `docs/BATCH6_PERFORMANCE.md` — this report (new).

Production `dist/` artifacts were regenerated by the build. Dependencies, environment configuration, database schemas, RLS, RPC definitions, and authentication permissions were not changed.

## 7. Verification results

| Command/check | Result |
| --- | --- |
| `node --experimental-vm-modules --test --test-reporter=tap tests/*.test.mjs` | 213 passed, 0 failed, 0 skipped: previous 173 plus 40 new tests |
| `npm.cmd run lint` | Passed; no errors or warnings |
| `npm.cmd run build` | Passed; no chunk-size warning |
| Production build graph inspected without writing output | No role/auth pages, ticket renderer, or camera decoder in initial static graph; all chunks below 500 kB |
| Local production preview requests | SPA HTML served for all 17 tested direct routes |
| Six optimized assets | Visually inspected |

Tests cover page-size boundaries, lower server caps, count inconsistencies, duplicate ordering, rejected pages, scope filters, cancellation/account changes, cache expiry and mutation invalidation, unauthorized export, 5,005-row CSV yielding, escaping/formula protection, monitor pagination, full fresh export, duplicate clicks, failure behavior, route roles, and lazy error recovery. Existing Batch 1–5 assertions remain passing. Node's experimental VM-module notice is a test-runner warning, not a production warning.

Tests use isolated mocks and local build/preview operations; no destructive live database tests were performed. Preview checks establish HTML fallback only, not browser hydration or authenticated navigation.

## 8. Remaining verification and next priorities

1. With separately approved read-only database access, inspect actual RPC definitions, row limits, stable ordering, authorization, and counts before specifying RPC pagination. Do not infer security from UI filters.
2. Manually verify authenticated Student and Organizer navigation, failed chunk recovery, camera permissions/scanning, PNG ticket download, large CSV export, and cross-device attendance with real browser sessions.
3. Verify mobile/high-DPI layouts and production hosting SPA rewrites. Local preview behavior does not establish deployed hosting configuration.
4. Before substantially larger datasets, agree on server-side paging/filtering and aggregate contracts so dashboards need not load every authorized row. Preserve RLS and existing transactional registration/check-in rules.

No backend migration, unrelated audit fix, or additional optimization batch was implemented.

## 9. Verdict

**Batch 6 frontend work is complete and ready for further development with documented database scalability limitations.** Automated verification is green and the original bundle warning is resolved. Large-scale production readiness is not yet established: RPC pagination/completeness, authenticated browser behavior, and deployed hosting still require the checks above.
