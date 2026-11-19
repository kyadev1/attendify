# Phase 12A — campus custom registration form foundation

## Status and scope

**Working local prototype, not production custom registration.** Attendify is not renamed. The campus-only, free-registration, Student/Organizer scope is unchanged. No database migrations, writes, policies, RPC changes, production Express endpoints, or deployment are included.

## Architecture inspected

- `CreateEditEvent.jsx` selects only an event owned by the current Organizer and preserves loading/error/retry behavior. `CreateEventForm.jsx` delegates through EventsProvider; `normalizeEvent` validates required fields, capacity and Manila schedules. `saveEvent` checks role/ownership and normalizes before eventService inserts/updates.
- `EventRegistration.jsx` displays published events, checks the current student booking, and calls `registerEvent`. `registrationService.registerForEvent` calls `register_for_event({ p_event_id })` and maps the confirmed registration. No custom answers currently exist in this contract.
- Frontend availability and duplicate-button checks improve UX, but cannot enforce concurrency. Capacity/duplicate integrity relies on the existing database RPC and constraints. Their SQL, indexes, locks and RLS definitions are **not available in this repository**; do not claim them independently verified.
- Ticket data is based on the confirmed registration ID. `ticketPayload` includes studentId, eventId and a TKT-prefixed registration reference. DigitalTicket restricts its lookup to the current student's registered booking. The scanner uses `check_in_ticket` with registration/event/student IDs. No form answers belong in the QR payload.
- `get_event_registration_counts` and `get_attendance_records` supply aggregates and authorized attendance. Their existing contracts remain unchanged.
- EventsProvider uses account generation, owner scope, read versions, mutation revisions, abort signals and scoped caches. These remain unchanged. AuthContext role loading and first-attempt login safeguards remain unchanged.
- Express currently exposes health and a user-scoped single-event read. It verifies Supabase identity and profile role, then filters by organizer ownership or published status. The prepared development API adapter remains disconnected from production pages. Deferred Phase 11B negative authorization/RLS checks have not been declared passed.
- Existing safe error mapping and CSS tokens are retained. The prototype uses local field-specific validation messages and no remote errors or services.

## Run the isolated prototype

In the root ignored `.env.local`, add this public configuration flag manually, preserving existing Supabase settings:

```dotenv
VITE_ENABLE_FORM_BUILDER_PROTOTYPE=true
```

Restart `npm run dev`, sign in with an existing authorized Organizer, and open `/organizer/form-builder-preview`. There is no new sidebar link. The backend is not needed for the builder; existing authentication still uses Supabase. The route exists only when Vite DEV is true, PROD is false, and the exact flag string is `true`. Production builds exclude the module even if the flag is set.

The prototype uses the visibly local `local-preview-event` identifier, not a real persisted event. No event is created or selected. The reusable component accepts an eventId prop, but is not integrated with real event forms. A future host must key drafts by event and account generation. The current wrapper keys by account generation, ID and role; navigating away, reloading or switching accounts discards local drafts and preview answers. No localStorage, persistence callback, API client, export or save button is used.

Features: add/edit/remove questions; required/optional; add/edit/remove choices; move up/down buttons; live student preview; local answer validation; clear preview answers; empty form; explicit non-persistence messaging. All sample answers are user-entered fictional text, not loaded student data. Edits clear preview answers to avoid stale answers against changed definitions. Single-answer Multiple Choice uses radio buttons; Checkbox allows multiple selections. Native controls provide keyboard interaction; errors have associated IDs, fieldsets/legends, focusable feedback and live status. Removal returns focus to the Questions heading. Responsive two-column layout stacks below 768px.

## Local definition contract

```json
{
  "schemaVersion": 1,
  "eventId": "local-preview-event",
  "questions": [
    {
      "id": "stable-question-id",
      "title": "Which workshop interests you?",
      "type": "dropdown",
      "required": true,
      "choices": [
        { "id": "stable-choice-a", "label": "Design" },
        { "id": "stable-choice-b", "label": "Programming" }
      ]
    }
  ]
}
```

Array order is canonical; stable question and choice IDs do not change during reordering. Choice IDs, not labels or array indexes, are answer values. Text answers are strings; dropdown/radio answers are one choice ID; checkbox answers are a unique array of choice IDs. Answers are keyed by question ID. `schemaVersion` describes the JSON structure, not a published form revision. Published revision IDs are proposed separately below.

Validation limits: 20 questions; 2–20 options for choice fields; question titles 1–200 characters; choice labels 1–100; short answers at most 250; paragraph answers at most 2,000. Empty forms are valid and mean normal registration. Optional missing answers are allowed. Blank required answers, invalid types/shapes, unsupported field types, duplicate IDs, unknown question/choice IDs, duplicate selections, and excess lengths/counts are rejected. Duplicate choice labels are compared after trim, Unicode NFKC normalization and case folding; normal human text otherwise has no arbitrary character regex. Prototype length limits count JavaScript UTF-16 units; Phase 12B must explicitly align server/client length semantics.

React renders labels/titles as text. No HTML rendering, executable content, URL/file-upload field, or rich-text parsing is supported. Server-side validation remains mandatory in Phase 12B; client validation is not a trust boundary. Do not collect passwords, government identifiers, medical information, or account details already available from profiles. Future answer displays/CSV exports must preserve text escaping and spreadsheet-formula protection.

## Proposed schema — documentation only

Final column types/FKs depend on inspection of the deployed schema. The names below are proposals, not existing tables or executed SQL.

| Proposed relation | Purpose and constraints |
| --- | --- |
| `event_registration_forms` | One form per existing event (`event_id` unique FK); active published version pointer; draft revision/optimistic-concurrency token. Owning organizer derived by joining events, not trusting a submitted organizer ID. |
| `registration_form_versions` | Immutable published snapshots with form/event relationship, revision number unique per form, schema version, creation/publication metadata. Include an explicit empty revision for disabling questions on future registrations. |
| `registration_form_questions` | Version FK, stable question key, position, type, title, required flag; unique (version, question key) and (version, position). Bounds/type constraints plus server semantic validation. |
| `registration_form_choices` | Version/question relationship, stable choice key, label, position; unique choice keys and ordering per question. Enforce that choices belong to that version's question. |
| `registration_answer_sets` | Unique FK to existing registration plus version FK. Bind event of registration to event of version using composite constraints or transactional validation; never accept another student's registration. |
| `registration_answers` | Answer-set FK and version/question key; one typed answer per question (bounded text or choice ID list). Composite validation prevents answering a question/choice from a different version. |

Alternative: immutable version JSONB snapshots with validated bounded answers JSONB reduce table joins. Choose one representation after schema review, not both as competing sources of truth. Normalized rows offer stronger FK constraints for choice membership; JSONB requires stricter transactional validation. Drafts may be mutable but never mutate a version referenced by registrations. Editing/publishing creates a new immutable revision, including when wording, type or choices change. Prior answer sets reference their original version and remain readable under the same ownership/privacy restrictions. Keep versions referenced by registrations; do not cascade-delete historical answers when removing a draft question. Define campus retention/deletion policy before persistence.

Suggested access policy intent (must be implemented and verified later):

- Organizer may manage forms only for events they own, checked server-side and by RLS.
- Student may read only the active form for an event available for registration; never other students' answers.
- Student may read their own submitted answers through their own registration. Editing submitted answers is out of initial scope.
- Organizer may read answers only for registrations in their own events. No broad profiles/answers export access.
- Shared caches, telemetry and logs must not contain private answers. Readiness requires tests that bypass Express and exercise user-scoped SELECT/RPC access directly.

## Proposed future Express contracts — not implemented

| Endpoint | Intent |
| --- | --- |
| `GET /api/events/:id/registration-form` | Authorized active form/version; no answer data. No custom questions returns an explicit empty definition/version. |
| `PUT /api/events/:id/registration-form/draft` | Owning organizer only; bounded definition and expected draft revision; 409 on stale edits. |
| `POST /api/events/:id/registration-form/publish` | Owner only; validated expected draft revision, new immutable version activated transactionally. |
| `POST /api/events/:id/registrations` | Verified student, expected form version and answers; transaction returns the existing registration response contract only after commit. |
| `GET /api/registrations/:id/answers` | Own student registration or owning event organizer; original version and answers. |

Supabase Auth remains the identity provider. Express verifies identity, loads trusted profile role and ownership, and calls user-scoped queries/RPCs. Never accept student/organizer IDs or roles as authorization proof. Keep public-key + bearer context and RLS; no ordinary service-role bypass. Use 401/403 or generic unavailable 404 consistently, 422 field-validation errors without SQL/answer leakage, and 409 stale-version/conflict responses. Bound total request body size (proposed 64 KiB) as well as per-field limits; enforce same allowed types and choice membership on the server.

## Phase 12B atomic registration plan and risks

1. Inspect actual deployed registration schema, unique constraints, capacity locks, RPC ownership/search_path/grants and RLS. Resolve the outstanding Phase 11B authorization fixtures. Do not infer SQL implementation from passing frontend tests.
2. Approve the schema design, privacy/retention rules, migration/rollback and server validation. Add migrations only in a separately approved phase and verify in an isolated database first.
3. Extend the existing registration transaction or provide a reviewed wrapper/internal shared implementation that preserves its capacity and duplicate rules. Within the same transaction: resolve authenticated student, verify event availability, lock/check active form version, validate answers, enforce capacity and uniqueness, insert registration and answer set, then return the existing registration shape. Any answer failure rolls back registration and capacity changes. Do not chain separate browser registration and answer writes.
4. Crucially, the existing `register_for_event(p_event_id)` entry point must not bypass mandatory questions once active forms are enabled. It must either participate in the same validation for empty forms or reject registrations requiring answers. Review grants/all alternative write paths. Do not enable forms while the legacy path can omit required answers.
5. On form version changing during student entry, reject with a clear 409 and require review of the new version; never silently interpret answers against another version. Avoid publishing/registration races with transactional locking or an equivalent verified mechanism.
6. Preserve duplicate/idempotency semantics for network retries, without overwriting a committed answer set. Verify simultaneous registrations, full-event behavior, direct-RPC bypass attempts, cross-account access, malformed answers, stale forms, and rollback. Existing registration/ticket IDs and QR payload remain unchanged.
7. Integrate student questions only after persistence and authorization are verified. Generate/display the existing ticket only after the atomic registration succeeds. Keep no-form events working with current behavior. No paid/public/off-campus scope is added.

## Files and verification

Added:

- `src/features/registrationForms/model.js`
- `src/features/registrationForms/components/RegistrationFormBuilder.jsx`
- `src/features/registrationForms/components/FormBuilderPrototype.jsx`
- `src/features/registrationForms/styles/RegistrationFormBuilder.module.css`
- `tests/form-builder.test.mjs`
- `docs/PHASE12A_FORM_BUILDER.md`

Modified:

- `src/App.jsx`: conditional lazy development route under existing Organizer guard only.
- `tests/helpers/renderModule.mjs`: optional import-meta injection for testing actual development/production route conditions.

No dependency or environment file changes. Existing production registration, event services, QR, attendance, AuthContext, EventsProvider and backend files are untouched. The focused tests exercise pure validation/editor actions and actual JSX handlers, labels/feedback, feature gating and exclusion from a real production build.

| Verification command | Result |
| --- | --- |
| `node --experimental-vm-modules --test --test-reporter=tap tests/*.test.mjs` | 271 passed, 0 failed, 0 skipped; includes 25 new builder tests |
| `npm.cmd test --prefix backend` | 39 passed, 0 failed, 0 skipped |
| `npm.cmd run lint` | Passed; no errors/warnings |
| `npm.cmd run build` | Passed; no chunk-size warning |

Node emits the existing experimental VM Modules test-runner notice. No live database tests were performed. Browser screen-reader interaction, focus after removal/reordering, mobile and high-zoom presentation remain manual checks; isolated JSX tests do not establish full browser accessibility.

Not implemented: persisted drafts/published forms, server validation, answer storage, ownership RLS for proposed tables, real student submission, atomic registration integration, or private answer reporting. Phase 12A is complete as a local foundation only; custom registration is not fully implemented or production-ready.
