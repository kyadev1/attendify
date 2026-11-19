# Phase 12B.3B — authoritative evidence review and migration drafts

## Updated verdict (supersedes the historical review below)

2026-11-04: the fresh `phase12b3a-inspection-original.csv` resolves the malformed-evidence blocker. Independent validation confirms **644 records, 644 valid metadata JSON cells, six functions and 46 triggers**. Every reported total is 644. SHA-256: `09C66EFF0A7D5300EDB30E25C0357E84D29317DE3F349D35F331A70AD600FC75`.

See [current migration review and execution gates](PHASE12B3B_MIGRATION_READINESS.md) for the authoritative findings, delivered SQL files, design decisions, tests and rollback instructions. The old claim below that persistence SQL is withheld no longer applies: five draft migrations are now prepared. They have NOT been executed or certified for production. No live authorization tests passed in this phase.

---

## Historical review of the earlier malformed CSV (retained for provenance)

Date: 2026-11-04. No SQL was executed against Supabase. No production code changed.

## Evidence integrity

The requested `docs/database-evidence/phase12b3a-inspection.json` does not exist in the workspace. The available file is `phase12b3a-inspection.csv` (123471 bytes).

SHA-256: `3A5BB29D9803E9F301FF62211A286C660537526C453128BD0BD3644E5CA30E2B`.

PowerShell `Import-Csv` produces exactly **644 records**, each reporting total_rows=644. Parsing each metadata cell with `ConvertFrom-Json -ErrorAction Stop` succeeds for **593** and fails for **51**:

| Section | Valid | Invalid |
| --- | ---: | ---: |
| 07_triggers | 2 | 44 |
| 08_routines | 0 | 6 |
| 18_other_schema_routine_inventory | 106 | 1 |
| All other sections combined | 485 | 0 |

For example, the routine settings strings contain malformed quote/backslash escaping around the empty search_path. The parsed text also contains doubled newline escapes. No automatic repair has been applied to the source or used to manufacture trusted function definitions. All six routine bodies are readable in the raw text, but their exact structured representation fails validation. Row-count completeness does not establish valid, unaltered metadata.

Captured context reports PostgreSQL 17.11, administrative inspection role postgres, read-only transaction, timestamp 2026-11-04T02:41:57.408671+00:00. These describe the supplied snapshot, not a connection independently established in this review.

## Confirmed from parseable snapshot metadata

- Four public tables: events, profiles, registrations, attendance; RLS enabled, not forced, owned by postgres. Lack of FORCE RLS is not alone a defect; owner/SECURITY DEFINER paths require explicit authorization review.
- `registrations_event_id_student_id_key`: unconditional UNIQUE(event_id, student_id). Cancellation does not remove this uniqueness restriction.
- `registrations_id_event_id_key`: UNIQUE(id,event_id), already suitable for an answer-set composite event relationship; no duplicate unique index is needed.
- `attendance_registration_id_key`: one attendance row per registration. Attendance has a composite FK (registration_id,event_id) referencing registrations(id,event_id), ON DELETE CASCADE.
- Event and student deletion can cascade registrations; registration deletion cascades attendance. New answer-retention behavior must be explicitly reconciled with these existing cascades.
- Events require capacity > 0 and ends_at > starts_at. Statuses are draft/published/cancelled. Registration statuses are registered/cancelled.
- Authenticated effective table INSERT/UPDATE/DELETE on registrations are false. SELECT, TRUNCATE, REFERENCES and TRIGGER are true. Table denial alone must still be considered alongside column grants and indirect function execution.
- Eight public RLS policies are present. Registrations SELECT is own-student only. Event writes require organizer ownership and profile role. Published event reads or owner reads are allowed. Profile policies restrict rows to auth.uid(); the update policy alone does not restrict columns.
- Both anon and authenticated have effective TRUNCATE on all four core tables. Table ACLs also include broad maintenance/reference/trigger rights. This is excessive for ordinary application users. RLS does not constrain TRUNCATE; however, this metadata does not prove that an HTTP/RPC entry point exposes arbitrary TRUNCATE.
- Public default table privileges grant broad rights to anon/authenticated for objects created by postgres and supabase_admin. Default routine privileges are also broad. New tables/functions must explicitly revoke default privileges within their creation transaction before granting intended access. Do not change managed-schema defaults indiscriminately.

## Registration and QR compatibility

The supplied raw routine text is consistent with the user's description: authenticated Student role check, event SELECT FOR UPDATE, published status plus ends_at check, duplicate check, registered-status capacity count, insert returning the registration row. This is a **provisional reading of malformed exported metadata**, not acceptance of exact definitions for migration replacement. All routine overloads/helpers and triggers must be verified from a clean export first.

Source confirms `register_for_event(p_event_id)` is the current frontend write entry point, while Express remains read-only. QR payloads derive ticket reference from the existing registration ID. No answer fields should enter the ticket or existing registration return contract.

The visible raw capacity-trigger text counts registrations as an invoker function. Since organizer SELECT policies do not expose student registrations directly, the trigger's effective visibility needs specific review and an isolated capacity-reduction test. Do not declare the capacity-update invariant verified merely because the trigger exists. Similarly, the event deletion policy tests absence of registrations through RLS-visible rows; test organizer deletion of a populated owned event in staging to rule out invisible-row/cascade behavior. These are important potential consistency risks, not live-tested outcomes.

## Proposed files and limits

Prepared `docs/proposed-migrations/20261104_001_revoke_unneeded_table_privileges.sql`: a narrowly scoped review draft removing TRUNCATE/REFERENCES/TRIGGER/MAINTAIN from ordinary roles on the four existing tables. It does not change CRUD, policies, functions or auth behavior. It is not applied and is not a complete persistence migration.

Prepared `docs/proposed-migrations/verify_table_privileges.sql`: catalog-only assertions for review after a separately approved staging application. It does not attempt a destructive operation.

The following persistence migration files are **not generated yet**, because replacing malformed function definitions would violate the evidence gate:

1. `20261104_002_registration_form_storage.sql`: UUID event root, immutable versions, questions and choices, answer sets linked to the existing (id,event_id) registration key, answers/choice membership, RLS and explicit grants.
2. `20261104_003_registration_form_operations.sql`: owner-only draft CAS and immutable publication, event-row locking shared with registration, safe schema-qualified functions and restricted execute grants.
3. `20261104_004_atomic_registration_answers.sql`: one transaction for registration and version-bound answers; all required fields validated; same registration ID/result; legacy no-form behavior unchanged; all custom-form legacy/direct paths denied or routed through common validation.

These are proposed future filenames, not delivered executable migrations. No placeholder SQL pretends to implement them.

## Minimal persistence design retained

Use the Phase 12B.2 normalized version model and local builder's five types. Drafts are mutable and bounded; published questions/choices are immutable. Derive owner through events and student identity through auth.uid(). No direct answer writes by anon/authenticated. Students read only their own historical answers; organizers only their own event responses. Published visibility does not grant answer visibility.

Serialize publication and registration on the same event before examining the active version; validate expected version and answers before commit. Preserve existing uniqueness including cancelled rows until a separately approved business change. Do not introduce new retry semantics by silently returning a cancelled registration. Return original committed results only under an explicitly tested idempotency contract. Failed answer insertion must roll back registration. Legacy RPC must reject active custom forms or call the same validated implementation; Express validation alone cannot enforce required questions.

## Required staging negative tests (not executed)

Use a disposable database with schema parity and synthetic Student A/B, Organizer A/B fixtures. Never run mutation tests on production, even wrapped in rollback, because triggers/external effects may escape that assumption.

| Scenario | Required assertion |
| --- | --- |
| Anonymous, missing role, wrong role draft/publish/submit | Denied; no data changed |
| Organizer A reads/edits/publishes B's form | Denied; no draft/version disclosure |
| Student reads draft or B's answers | Denied |
| Organizer reads foreign answers | Denied even for a published event |
| Direct table INSERT/UPDATE/UPSERT and legacy RPC with active required form | Cannot create incomplete registration/answer set |
| Missing answer, unknown question/choice, wrong type, oversized input | Whole transaction fails; capacity/count unchanged |
| Two Students race for last seat | Exactly one registration/answer set succeeds |
| Duplicate and retry; cancelled prior registration | Matches reviewed unique/legacy contract; IDs unchanged |
| Publish races registration; stale version submitted | Serialized decision; no mixed-version answers |
| Modify/delete published question or answer version | Denied through ordinary user access |
| Capacity lowered below actual registrations by owner | Rejected irrespective of RLS visibility |
| Owner deletes an event with registrations | Existing intended prohibition enforced; no cascaded data loss |
| Profile role or event ownership reassignment | Denied under ordinary client permissions |
| Privilege hardening | Catalog denies TRUNCATE/TRIGGER/REFERENCES/MAINTAIN; normal event CRUD and approved RPCs still work |
| Regression | Existing no-form registration, QR generation/check-in, duplicate scan, counts and exports unchanged |

## Rollback and execution sequence

1. Obtain a clean export and validate every metadata cell. Resolve custom-schema helpers and exposed API schemas. Review the two RLS-visible-count concerns before persistence implementation.
2. Approve least-privilege changes separately; apply only in authorized staging first. Baseline grants and test existing flows. No automatic live execution is part of this phase.
3. Prepare storage and function migrations only after evidence acceptance; test privilege revocation in the same transaction as creation so broad default grants never expose new data.
4. Run the negative/concurrency suite in staging. Review exact function/grant diffs and all legacy write paths. Keep publishing/student activation disabled until this passes.
5. Only after separate approval consider production migrations and a controlled rollout.

Privilege rollback: do not automatically regrant excessive rights. If a real maintenance dependency needs one, grant that specific right to a dedicated administrative role after review. Ordinary registration/QR flows have no documented need for these rights. Maintain the original catalog export as the baseline; don't generate a blanket insecure down migration.

Persistence rollback after answers exist must retain immutable versions/answers and legacy anti-bypass protection; disable UI/API activation instead of dropping history or restoring a question-bypassing RPC. Before data exists, additive removal is possible only after dependency review and explicit approval.

## Verdict

**BLOCKED for complete persistence migrations; partial privilege-hardening draft ready for review only.** All 644 CSV records exist, but exact routine/trigger evidence is not validly encoded. Live negative authorization/concurrency tests remain unexecuted. No test pass is claimed. No application tests were rerun because no executable application files changed.

Please supply the stated JSON file or a fresh unmodified CSV export, preserving quotes/backslashes. Do not manually replace escape sequences. No secrets, tokens or application rows are needed.
