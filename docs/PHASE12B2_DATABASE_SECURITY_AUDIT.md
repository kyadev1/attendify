# Phase 12B.2 — registration form database and security audit

Date: 2026-11-04 (Asia/Manila). **Audit and implementation plan only.** No production code, database records, schema, grants, RLS, triggers, or RPCs were changed. No live sign-in, SQL, or database request was executed. This document is the only file added.

## 1. Verified current architecture

“Verified” below means inspected source behavior, not independently verified deployed SQL enforcement.

| Area / source | Observed contract |
| --- | --- |
| `src/services/eventService.js` | Events select `id, organizer_id, title, category, description, venue, starts_at, ends_at, capacity, status, image_url`. Creation supplies the current organizer ID and `status: published`; edit changes event details, not ownership. Reads use keyset paging and optional organizer scope. Exact SQL column types, defaults and constraints are unknown. |
| `src/context/EventsProvider.jsx:339` | `saveEvent` requires organizer role and ownership of edited events, normalizes details, waits for persistence and checks session scope before updating local state. These client checks are not a database security boundary. |
| `src/pages/organizer/components/CreateEventForm.jsx:91` | Existing event fields alone go to `saveEvent`. The development-only questions section at line 475 is outside the event form. It has no persistence callback; its questions/answers never enter this payload. |
| `src/pages/student/components/EventRegistration.jsx` | Finds published events and the current student's registration, tracks event time, disables inappropriate registration actions, awaits `registerEvent`, and shows success only after resolution. UI conditions cannot prevent concurrent or direct API requests. |
| `src/context/EventsProvider.jsx:441` | Requires student role; calls the registration service; accepts the confirmed booking once, updates counts and then refreshes them. Owner/generation and read/mutation revisions prevent late results from updating another account. |
| `src/services/registrationService.js` | `register_for_event({p_event_id})` is expected to return one registration object. Mapper consumes `id,event_id,student_id,status,registered_at`. List reads select those fields, filter `status=registered` and current student. No answers/version argument exists. |
| `src/services/registrationService.js` | `get_event_registration_counts()` returns rows with `event_id,registration_count`. UI available slots are capacity minus these counts, clamped to zero. Actual counting and cancellation semantics are unverified. |
| `src/utils/ticketData.js` | Ticket reference is `TKT-` plus the uppercase registration ID. Payload contains studentId, eventId, ticketId. Scanner parser expects UUID-shaped student/event/registration IDs. This expectation does not independently establish SQL types. |
| `src/pages/student/components/DigitalTicket.jsx` | Ticket lookup requires the current student's registered booking. Existing QR renderer and PNG download use the existing booking; no new ticket or answer persistence is involved. |
| `src/services/attendanceService.js` | `check_in_ticket({p_registration_id,p_event_id,p_student_id})` expects an array with a confirmation row. `get_attendance_records()` maps registration_id, event_id, student_id, student_name, registered_at, checked_in_at. The underlying attendance table name/DDL is not established by these RPC results. |
| `backend/src/app.js` | Only health and authenticated `/api/events/:id` are exposed. Write methods are rejected; CORS preflight permits GET. There is no JSON write-body parser or form endpoint to reuse unchanged. |
| `backend/src/middleware/auth.middleware.js` | Verifies token with `auth.getUser`, reads matching `profiles(id,role)`, and permits existing student/organizer roles. Integrity of profile-role writes is a separate deployed-policy question. |
| `backend/src/config/supabase.js` | Per-request public-key Supabase client forwards the user's bearer token, disables persisted sessions/automatic refresh, and bounds upstream fetch time. No ordinary service-role client. |
| `backend/src/modules/events/event.service.js` | Organizer queries are owner-filtered; Student queries are published-filtered. Defensive checks repeat the conditions. Foreign/unavailable records produce generic 404; database permission errors map to 403. This does not prove direct RLS has identical visibility. |

The prepared frontend Express adapter remains opt-in and disconnected from real page data. Actual event registration still goes directly to Supabase. No custom registration persistence exists. Form builder model limits are 20 questions, 2–20 choices for choice types, title 200, choice label 100, short answer 250 and paragraph answer 2,000 characters. Definition schemaVersion is 1; question array order is canonical, and stable choice IDs carry answer values.

## 2. Missing deployed evidence — implementation gates

Repository inventory found no application SQL migration files or deployed schema/function/policy exports. Obtain a **schema-only, credential-free** export or approved read-only catalog inspection before drafting executable migrations. Do not request table dumps containing student answers or personal data.

Required evidence:

1. DDL, types, nullability, defaults, PK/FK/unique/check constraints and indexes for events, registrations, profiles and the actual attendance relations. Include cascade behavior and allowed statuses.
2. Exact definitions/signatures/overloads/return types for all four RPCs listed above; owners, SECURITY INVOKER/DEFINER, configured search_path, grants, PUBLIC/anon/authenticated execution permissions, and any helper functions they call.
3. All INSERT/UPDATE/DELETE triggers and trigger functions on related tables, including auth-user/profile provisioning and ownership changes.
4. RLS enabled/forced flags, policy expressions and command/role coverage, table/column grants, exposed views and functions, and bypass paths. Especially verify that ordinary users cannot assign/change their profile role or event ownership.
5. Registration transaction implementation: capacity lock scope, what counts toward capacity, unique active registration semantics, handling of cancelled/deleted/re-registered bookings, schedule checks, and retries. A client count followed by INSERT is not sufficient evidence of serialization.
6. Ownership transfer rules, retention/deletion requirements, timestamp/timezone behavior, PostgREST response limits and errors. Determine whether “published” means visible, accepting registration, or both; current frontend also checks time.
7. Live authorized Student, two distinct Organizers, known owned/foreign/non-published events, and direct-token negative SELECT/RPC evidence. Historical positive Student access and mocked tests do not satisfy these checks. Deferred Phase 11B scenarios remain deferred.

**No confirmed deployed database vulnerability is asserted.** These are unverified security dependencies and activation blockers.

## 3. Proposed schema and relationships

Recommendation: normalized immutable published versions, a bounded mutable JSON draft, and typed answer rows. This is a proposed design, not a description of existing relations. Referenced ID types must match verified deployed keys; choose new ID generation only after reviewing existing conventions.

| Proposed relation | Fields and relationships | Required invariants |
| --- | --- | --- |
| `event_registration_forms` | `event_id` PK/FK to events; nullable active_version_id; draft_definition JSONB; draft_revision integer; timestamps | One root per event; active version must belong to same event; draft_revision changes atomically on each accepted edit. Owner derived from events, not a writable duplicate organizer_id. |
| `registration_form_versions` | `id` PK; event_id FK; revision; schema_version; published_at; created_by from verified identity | Unique(event_id,revision); unique(event_id,id) for composite references; published rows immutable. No-form state may use an explicit immutable empty version after first activation. |
| `registration_form_questions` | version_id, question_key, position, title, type, required | PK(version_id,question_key); unique(version_id,position); allowed types only; bounded nonblank title; unique contiguous order validated transactionally. |
| `registration_form_choices` | version_id, question_key, choice_key, position, label | Composite FK to question; PK(version_id,question_key,choice_key); unique position per question; bounded labels and canonical duplicate-label checks. Text fields cannot have choices. |
| `registration_answer_sets` | registration_id unique/PK FK; event_id; version_id; submitted_at | Composite relationship ensures registration and version refer to same event. If existing registrations lack a suitable composite unique key, approve adding one or enforce the equivalent in the restricted atomic function; do not pretend an unverified FK is already available. |
| `registration_answers` | registration_id, version_id, question_key, nullable text_value | One row per answered question; FK to same answer-set version and question. No text for choice types; bounded text for text types. Required completeness checked before commit. |
| `registration_answer_choices` | registration_id, version_id, question_key, choice_key | Composite FK to answer row and same-version choice; unique selection prevents duplicates. Exactly one selection for dropdown/radio; bounded selections for checkbox, validated transactionally. |

Draft JSON mirrors the existing builder contract, but the server derives event association from the authorized route. Publishing validates and transforms it into normalized snapshot rows in one transaction. Reconstruct published JSON for the student; do not maintain a separately editable published JSON copy as a second source of truth.

Stable question/choice keys are identities **within a version**. Renames, deletions, type changes and reorderings produce new versions. Answer reads join the submitted version, never the latest version. No-form legacy registrations retain no answer set; do not fabricate historical answers or attach a newly published form retroactively. New optional forms still record the submitted version even if every answer is omitted.

Proposed supporting indexes: owner lookup on events if absent; versions(event_id,revision); questions(version_id,position); choices(version_id,question_key,position); answer-set event/registration access; registration student/event ownership joins. Review actual plans and existing indexes before adding duplicates.

## 4. Authorization and privacy design

| Principal/action | Proposed authorization |
| --- | --- |
| Anonymous | No draft, answer or registration mutation access. Campus access remains authenticated. |
| Student reads active form | Verified student; event is available under established visibility rules. Fetching questions does not reserve capacity. No draft access. |
| Student reads submitted form/answers | Registration belongs to auth.uid(); original referenced version is readable even if no longer active. Other students' answers are never returned. |
| Student submits | Derive identity from auth.uid(), not request student_id; validate event, active version and answers in the registration transaction. No arbitrary direct answer-table writes. |
| Organizer manages drafts/publishing | Trusted organizer role and current event ownership checked in Express and the database transaction/RLS. No role/owner supplied by payload is authoritative. |
| Organizer reads answers | Only registrations for their own event. Include historical version labels, not just latest choices. Cross-organizer private answers denied. |

Establish ownership-transfer policy before activation: either disallow transfer after registrations or explicitly approve whether a new owner inherits answer access. Current source offers no transfer flow; do not introduce one implicitly. Do not assume an event's public visibility makes its answers public.

Use caller-scoped Supabase context throughout. Prefer security-invoker functions where effective with existing RLS. If a narrowly scoped database SECURITY DEFINER function is required for atomic write access, review its owner, fully qualified names, safe search_path, auth.uid()/role/ownership checks, and execute grants; never confuse this with permission to use a service-role client. No unreviewed direct write grants may bypass validation. RLS must cover child-table access through parent relationships without recursive policy loops.

Answers must not enter QR payloads, ordinary event-list responses, attendance CSVs, logs, analytics, or shared caches. Do not duplicate student ID/verified email in questions. Define consent notice, purpose, access, retention and deletion with the school before storing responses. Escape rendered text and apply formula protection if a future answer export is separately approved.

## 5. Proposed API contracts — none activated

All responses follow existing `{data: ...}` / `{error: {code,message}}` conventions; new field errors should use bounded field identifiers and safe messages, never echo raw answers or SQL.

| Endpoint | Request / result | Key safeguards |
| --- | --- | --- |
| `GET /api/events/:id/registration-form/draft` | draft definition, draft revision, current published version reference | Owner only; no answers. |
| `PUT /api/events/:id/registration-form/draft` | definition + expected draft revision; returns new revision | Owner; compare-and-swap; 409 on concurrent edit. Initial creation uses explicit expected absence/zero revision. |
| `POST /api/events/:id/registration-form/publish` | expected draft revision + expected active version | Owner; validate full definition; transactional immutable version creation and pointer update. |
| `GET /api/events/:id/registration-form` | active version ID/revision and questions; explicit empty result for no form | Student event visibility; historical answers not included. Owner preview uses draft endpoint. |
| `POST /api/events/:id/registrations` | expectedFormVersionId (nullable only for no-form state), answers keyed by question ID, proposed idempotency key | Student identity derived server-side; one atomic RPC. Returns existing registration fields only after commit. |
| `GET /api/registrations/:id/answers` | submitted version and answers | Own student registration or event owner; generic unavailable response otherwise. |

400 malformed request, 401 invalid/missing session, 403 forbidden role/action, generic 404 unavailable resource, 409 stale version/edit/capacity/duplicate conflict as agreed against existing RPC semantics, 422 valid JSON with invalid fields, 503 upstream unavailable. Preserve existing legacy errors until an explicit compatibility mapping is approved; these are proposed new API codes, not verified deployed SQL codes.

Express currently blocks write methods globally and lacks a body parser. Phase 12B.3 must add bounded JSON parsing and narrowly allow intended methods/CORS preflights only for new endpoints; do not remove restrictions indiscriminately. Proposed request cap 64 KiB plus current per-field limits. Validate allowed keys and finite types, Unicode/length semantics, required answers, option membership and unknown IDs on both server and database. Reuse a pure schema module if practical, but do not treat the permissive local prototype parser as a production validator without review. Define UTF-16 versus Unicode-code-point length consistently.

Retries must preserve account generation, role, event/version scope and abort lifetimes. Never fall back to direct registration after an Express denial or validation error. Require a fresh definition after version conflict and let the student review before resubmitting.

## 6. Registration integrity — transaction boundary

Required operation is one PostgreSQL transaction, not two Express/Supabase HTTP writes:

1. Validate authenticated student and campus role from trusted data.
2. Acquire the existing verified event/capacity lock and the form-state lock in a documented consistent order shared with publication. Do not invent the lock strategy until the current RPC is inspected.
3. For a committed retry, identify the original registration/idempotency result first according to reviewed rules. Return the same registration/answer version; never overwrite answers. Reusing a key with different normalized content is a conflict. A committed retry must not fail solely because a newer form was published afterward.
4. For a new registration, validate event status/time and active form version, including null-to-first-version and empty-version transitions under the lock. Refuse stale versions before inserting anything.
5. Validate every required answer and allowed choice against that immutable version; reject unknown questions and oversized bodies. Resolve student/event IDs from trusted context.
6. Preserve the existing capacity enforcement and duplicate-registration semantics. Database uniqueness plus transaction serialization must prevent simultaneous requests from overbooking or issuing duplicate bookings; inspect cancellation/re-registration semantics before choosing a unique index.
7. Insert registration, version-bound answer set and answer rows in the same transaction. Any failure rolls everything back, including any capacity/counter change. Return the existing registration shape after successful commit. Existing ticket generation follows unchanged.

**Legacy bypass gate:** `register_for_event(p_event_id)` and every direct table/RPC/view write path must be reviewed. Once a custom version is active, the legacy endpoint must route through the same validated implementation or reject with a clear form-required response. For existing no-form events preserve current behavior. Prefer rejecting legacy calls for all active nonempty custom forms, even all-optional forms, so explicit version acknowledgement is consistent. Product approval is required for the exact compatibility policy.

Do not allow the new API to register first and save answers afterward. Do not trust frontend `slotsRemaining`, disable buttons, client ownership checks, or feature flags as security enforcement. Do not append answer contents to registration/ticket return values consumed by unrelated dashboards.

## 7. Incremental migration and rollback

### Rollout stages (future approval required)

1. Collect/read-review deployed DDL/security metadata and record a schema baseline; secure backups and test restore. No credential-bearing export in the repository.
2. In an isolated staging database, add proposed relations/constraints/indexes, RLS and least-privilege grants with feature disabled. No historical answer backfill; maintain existing events/registrations untouched.
3. Add reviewed transactional draft/publish and registration functions, including legacy anti-bypass protections. Verify all failure paths and concurrency before any event can activate a form.
4. Add Express modules and contract tests; retain user-scoped clients. Deploy disabled only after separate authorization. Database deployment is a separate privileged administrative operation, not an ordinary request path.
5. Enable owner-only draft save/reload on designated staging events first. Draft persistence does not imply active student questions. Only after tests pass enable publication and student submission together for a controlled campus pilot.
6. Monitor aggregate failures/latency without answer content. Expand after live negative authorization checks and rollback rehearsal; do not infer rollout readiness from frontend tests.

### Rollback rules

- Before any submitted answers: disable new UI/API flags; keep compatible additive tables/functions in place. Drop staging-only additions only after dependency checks and explicit approval.
- After answers exist: **do not drop version/answer tables, cascade-delete history, or restore an old RPC that bypasses required answers**. Roll back UI/API deployment while retaining security-compatible database functions and immutable historical data.
- If the old client cannot submit required answers, temporarily block new registrations for affected events through an approved server-side compatibility gate; do not silently accept incomplete submissions. Unaffected no-form events continue normally. If owners are allowed to remove future requirements, publish an explicit new empty version after review, not a destructive rollback.
- Preserve existing registration IDs and attendance/ticket relationships. Restoring a whole database backup can lose later registrations/attendance and is not the default feature rollback. Reconcile any approved disaster recovery separately.

## 8. Exact Phase 12B.3 work sequence and acceptance gates

1. **Evidence gate:** obtain items in section 2, resolve unknown ID/status/role/ownership semantics, and validate at least two organizer fixtures plus students. Stop executable schema work if unavailable.
2. **Design approval:** finalize this normalized contract, retention/ownership transfer rules, version conflicts, no-form compatibility and idempotency behavior. Document actual names/types after evidence; no speculative production SQL.
3. **Shared validation:** extract/review portable pure contract validation with strict keys/body bounds; test every current field type, Unicode, duplicated/missing options, answer types and unknown IDs. Keep React and SQL semantic tests aligned.
4. **Staging migrations:** create versioned SQL files with additive schema, constraints/indexes, RLS, grants and reversible pre-data steps. Review delete/cascade behavior and schema-qualified functions. No production execution until independently approved.
5. **Database transactions:** implement draft CAS, publication and atomic registration/answers with legacy-path protection. Add database tests using non-production fixtures, including simultaneous last-slot registrations and mid-transaction answer failure.
6. **Express modules:** add registrationForms routes/controllers/services under the existing architecture. Verify role/ownership before writes and in database enforcement. Add bounded parsing/CORS methods and safe conflict/validation mappings; no service-role client.
7. **Organizer draft integration:** replace local-only question state persistence only after API tests pass; keep event detail save distinct and clearly report partial failure if event creation succeeds but draft save fails. Forms cannot be saved for an unsaved event ID. Do not automatically publish new questions during ordinary Event Details save.
8. **Student integration:** read active version; keep answers scoped to account/event/version; submit via one atomic endpoint. Clear private drafts on account change; preserve input on recoverable errors and require review on version change. Existing QR appears only after the confirmed booking.
9. **Security/regression gate:** verify Student A cannot read B's answers, Organizer A cannot manage/read B's forms/answers, missing/invalid sessions deny, stale roles deny, draft questions cannot be read by students, direct Supabase/RPC bypass attempts fail, and known foreign/non-published rows are handled correctly. Record Express and direct-RLS evidence separately.
10. **Compatibility/rollout gate:** verify legacy no-form registration, full events, duplicate clicks/retries, schedules, failed save retention, historical versions, ownership rules, QR scanning, dashboards/counts/exports and account isolation. Run all frontend/backend suites, lint/build and live browser checks; rehearse both pre-data and post-data rollback before separately approved activation.

Do not bundle implementation approval with deployment approval. Phase 12B.3 may prepare reviewed migrations/tests without executing production SQL; the rollout must state its permitted environment explicitly.

## 9. Risks, blockers and verdict

| Priority | Risk / blocker | Evidence and required action |
| --- | --- | --- |
| Blocking | Unknown transaction/unique/capacity enforcement | RPC implementation absent. Inspect SQL before extending registration. |
| Blocking | Legacy/direct write bypass of future required answers | Current client sends only p_event_id. Gate every registration entry point before activation. This is a future integration risk, not evidence of a current custom-answer vulnerability. |
| Blocking | Deployed RLS and profile-role integrity unverified | App filters cannot prove policy behavior. Obtain policies/grants and negative live fixtures. |
| High | Registration committed without answers | Prevent with one transaction and tested rollback; no sequential API writes. |
| High | Historical answers reinterpreted/deleted | Immutable versions, composite membership constraints, restricted deletes and retention policy. |
| High | Form publication races and unsafe rollback | Serialize active-version checks; retain anti-bypass protections during rollback. |
| Medium | Event creation/draft persistence partial success | Separate clear operations; event remains saved if draft fails, with retry against real event ID; no fake combined success. |
| Medium | Sensitive response leakage or unbounded input | Purpose-limited questions, bounded strict server/database validation, no logging/QR inclusion, scoped caches. |

**Readiness verdict: CONDITIONAL / NOT READY FOR PRODUCTION PERSISTENCE.** Architecture planning is ready; executable database design and activation are blocked by missing deployed definitions and negative authorization evidence. The local prototype remains safe to use as a prototype. No reason was found to replace existing working registration or QR functionality.

This was a read-only source audit. Regression commands were not rerun because no executable files changed. Latest recorded prior verification: 279 frontend tests and 39 backend/tooling tests passed, clean ESLint and successful production build; these are historical results, not fresh evidence of database correctness. Stop here pending approval and the required deployed metadata.
