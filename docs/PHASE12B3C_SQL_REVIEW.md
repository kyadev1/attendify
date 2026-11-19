# Phase 12B.3C — SQL design review and staging plan

2026-11-04. No database connection, migration, SQL test or deployment was performed. Only proposal SQL, tests and documentation changed. This document supersedes earlier staging-readiness wording where it differs.

## Verdict

**NOT READY for controlled staging execution yet.** The package is prepared for review, but the JSONB storage choice has not been approved, staging identity/baseline/fixtures have not been provided, and explicit staging execution authorization has not been given. Once those gates are satisfied, a disposable staging installation is the appropriate next step to compile and test these drafts. Compilation and runtime validation are goals of that step, not claimed results of this review. Production readiness requires the full matrix below plus retention/validation/integration decisions.

Local verification executed this phase: CSV/JSON parsing passed (644 cells, six functions, 46 triggers); comparison of the copied legacy helper body passed; owner guards and transaction endings present in all five migration files. These are static checks, not SQL compilation. The psql executable was not found; no database tests were attempted. No frontend/backend test suite was rerun because production application code is unchanged.

Files changed: all five `20261104_00*.sql` drafts, `staging_negative_tests.sql`, `verify_form_persistence.sql`, and the prior readiness document's review pointer. Files added: this review and `staging_preflight.sql`. No evidence export or environment file was edited.

## Recommended design (proposal, not approval)

Recommend a hybrid: relational event, version, registration and ownership keys; JSONB draft, immutable published definition and immutable answer document. The existing builder has only five field types and bounded twenty-question forms. A whole-version snapshot preserves historical labels/options/order without expensive reconstruction. Composite foreign keys guarantee event/version/registration association, while the database validators enforce JSON membership and required answers.

| Data | Recommendation | Tradeoff |
| --- | --- | --- |
| Event/registration/version identity | Relational UUIDs, unique keys and FKs | Native integrity; reuse registrations(id,event_id) |
| Mutable organizer draft | Bounded JSONB + revision CAS | Atomic document edits; cannot join individual draft fields directly |
| Published questions/choices | Immutable JSONB snapshot | Good historical fidelity; procedural validation instead of per-choice foreign keys |
| Submitted answers | One immutable JSONB object + version FK | Simple atomic storage/privacy; typed analytics/export requires extraction and deliberate indexing |
| Cross-event question analytics | Later relational projection or normalized version-owned questions if required now | Avoid a second editable source of truth; do not add speculative GIN indexes |

Choose normalized questions/choices/answers instead if near-term requirements include SQL-level choice FKs, reporting across many questions, partial answer correction or individual answer lifecycle controls. That would require revising migrations 002–004, not just adding tables. JSONB is not intrinsically more secure; its correctness depends on the validators and restricted write paths.

Draft and published definitions contain schemaVersion/questions; event identity is the authorized RPC argument. JSONB discards duplicate JSON object keys before validation, so future Express raw request validation should reject duplicate keys if the contract requires that. It must also enforce a transport body limit before JSONB conversion. Database 64 KiB caps apply to canonical JSON text, not HTTP bytes. Unknown fields, duplicate question/choice IDs, duplicate normalized choice labels, wrong types, unknown answers/selections and invalid selection counts are rejected.

SQL string lengths count Unicode code points while JS currently uses UTF-16. Trim whitespace now follows ECMAScript's whitespace list, but locale-sensitive case folding still needs parity tests. Keep a documented code-point contract or change the validator to match JS before UI integration. Optional unanswered choice controls should omit the key; an empty string is not a valid option. These differences must not be concealed by frontend-only checks.

Privacy: ordinary users have no direct table rights; RPCs derive current identity and check current profile role/ownership. Published visibility does not expose answers. Historical answer retrieval includes the original immutable definition. Do not add answers to QR payloads, ordinary event lists, logs, attendance CSVs or shared caches. Decide purpose/consent, authorized staff access, retention duration and controlled erasure before production. Immutable records and restrictive FKs intentionally block deletion of a student/registration with answers; there is no approved erasure procedure yet. Ownership transfer is not introduced; current RLS prevents ordinary owner reassignment.

## Review findings and draft corrections

| Priority | Finding | Change / remaining proof |
| --- | --- | --- |
| High | Missing release row made IF NOT (SELECT enabled...) evaluate NULL and skip denial | 003/004 now require IS DISTINCT FROM true; take FOR SHARE on release row so disabling waits for admitted operations. Missing-row denial tests added |
| High | PL/pgSQL q variable conflicts with q SQL alias in unknown-answer check | 002 uses distinct named columns/aliases; PostgreSQL runtime compilation still required |
| Medium | Identifier length measured trimmed value, allowing oversized stored IDs | 002 bounds raw ID length and separately rejects blank IDs |
| Medium | btrim alone accepted tab/newline-only required text | Private trim_text covers ECMAScript whitespace; staging regression added |
| Medium | Combined object check could evaluate jsonb_object_keys on scalar input | Definition root type is checked in a separate statement; malformed input keeps controlled validation errors |
| High | Trigger's cascade check must not depend on caller RLS visibility | guard_form_rows now narrowly SECURITY DEFINER with empty search_path and explicit private EXECUTE revocation |
| Medium | Only 002 checked migration execution owner | All five files require current_user=postgres; verify existing object owners before replace operations because CREATE OR REPLACE preserves ownership |
| High | Excess TRUNCATE/REFERENCES/TRIGGER/MAINTAIN | 001 retained scoped revokes; verify effective rights, including inheritance, after install |
| High | Capacity edit counts only RLS-visible registrations | 005 definer trigger reads actual registered count; validate concurrent edits in staging |
| High | Delete-empty policy counts only RLS-visible registrations while FKs cascade | 005 definer BEFORE DELETE guard retained; existing policy unchanged; test populated and empty-event deletion |

Security basis: PostgreSQL documents that TRUNCATE/REFERENCES are outside RLS and policy subqueries use the caller's privileges ([RLS documentation](https://www.postgresql.org/docs/17/ddl-rowsecurity.html)). Function replacement retains owner/permissions; definer functions require controlled search paths and explicit execution grants ([CREATE FUNCTION](https://www.postgresql.org/docs/17/sql-createfunction.html)). No arbitrary-SQL HTTP exploit was demonstrated by the excess grants alone.

## SQL/dependency and security assessment

001 revokes only unnecessary core-table rights. 002 creates the private schema, validators, relational keys and immutable JSON tables. 003 creates the disabled release state and scoped form RPCs. 004 creates a private copy of the deployed registration function and wraps legacy/custom submission. 005 repairs the existing integrity-trigger paths. Apply all five while staging application traffic is stopped; do not use an incomplete installation.

The new schema/tables/functions deliberately use CREATE, not IF NOT EXISTS: unexpected existing objects are drift, not success. 001 is repeatable; the full sequence is a one-time versioned installation, not blindly idempotent. Each file commits separately; stop at the first error and inspect completed versions. Record approved hashes and application status in the staging run log. No auto-migration runner or migration tracking framework was added.

All new functions use explicit empty search_path. Ordinary users cannot create in the private schema or call private helpers, even if someone mistakenly exposes that schema through PostgREST; grants must be checked. SECURITY DEFINER is limited to functions that need protected reads/writes and triggers. Trusted auth.uid() still comes from the verified request JWT, not student IDs supplied in the form. Postgres ownership bypasses RLS by design; explicit authorization in each public RPC is therefore mandatory. New table RLS has no permissive policies: access is RPC-only. Default ACL grants are revoked within the creation transaction, before commit. Managed service schemas/defaults are not rewritten.

No new direct registration write rights are granted. Alternative ordinary routes in this repository are the public legacy and new RPCs; the private helper is revoked and schema-denied. The legacy RPC rejects any active form (including empty snapshots), independent of release state. External privileged functions/jobs and API exposed-schema settings still need inventory; no guarantee is made against a database owner deliberately bypassing the contract.

## Preservation assessment

The private registration body remains the exact exported body, except renamed schema/function and qualified return type. It retains Student-only checks, published/unexpired rules, event row lock, registered-seat count, unconditional duplicate check, UUID default and return shape. Cancelled rows still block re-registration; no cancellation API or changed cancellation rule is added. QR/check-in/count functions are not rewritten.

The new path locks release state then event, selects active version, validates answers, and calls the legacy body in the SAME database transaction before inserting its answer set. Failure rolls back registration. Publication follows the same release-before-event order; draft saves lock only event. Administrative release operations must not lock events first. Event updates/deletes acquire event row locks naturally; concurrency still requires multi-session proof. Duplicate retries continue to produce the existing duplicate error; clients must retrieve a confirmed booking after uncertain network results.

Submitted answer/version association has composite FKs. Versions are immutable except deletion as part of an unused parent event cascade. Answer FKs prevent historical deletion; direct answer mutations are denied. Test empty-event deletion with both draft-only and published-but-unsubmitted snapshots, because FK cascade ordering must be exercised on PostgreSQL rather than inferred from review.

## Exact staging execution checklist — instructions only

1. Obtain explicit approval for the candidate design as an experiment and for an isolated target. Use a separate non-production Supabase staging project or isolated Supabase stack matching PostgreSQL 17, UTF8, roles/auth functions/extensions. Do not improvise auth.uid() stubs and call the results live auth verification.
2. Have the administrator restore a sanitized schema-only baseline, including exact functions, triggers, policies, column/table grants and role assumptions. The CSV is evidence, not a restorable database dump. Never copy real students, answers, tokens, vault secrets or production webhooks. Disable external side effects. Create synthetic Student A/B and Organizer A/B accounts in staging only, with independently checked profile roles.
3. Configure a local libpq service named attendify_staging with the reviewed target; use secure local credential storage, not command-line passwords. Confirm its host/project identifier against the approval. The service name alone is not a safety boundary. Record a staging snapshot for reset.
4. In PowerShell, only AFTER authorization, run from the repo root:

```powershell
$env:PGSERVICE = 'attendify_staging'
psql -X -v ON_ERROR_STOP=1 -f docs/proposed-migrations/staging_preflight.sql
```

Require postgres owner, PG17/UTF8, default READ COMMITTED, check_function_bodies=on, baseline definitions/grants matching the evidence and no candidate schema/table collisions. Stop on any drift. This read-only preflight cannot identify production for you.

5. Apply exact files individually, stopping on nonzero exit:

```powershell
$migrationNames = @(
 '20261104_001_revoke_unneeded_table_privileges.sql',
 '20261104_002_form_storage.sql',
 '20261104_003_form_operations.sql',
 '20261104_004_atomic_registration.sql',
 '20261104_005_event_integrity_prerequisite.sql'
)
foreach ($migrationName in $migrationNames) {
 psql -X -v ON_ERROR_STOP=1 -f (Join-Path 'docs/proposed-migrations' $migrationName)
 if ($LASTEXITCODE -ne 0) { throw "Stopped at $migrationName; inspect partial installation" }
}
psql -X -v ON_ERROR_STOP=1 -f docs/proposed-migrations/verify_table_privileges.sql
psql -X -v ON_ERROR_STOP=1 -f docs/proposed-migrations/verify_form_persistence.sql
```

Never use a *.sql glob. Check each verification result, not just process success. Release must remain false, all new direct ordinary-user table rights false, all private helper execute rights false, owners postgres, RLS enabled. Verify constraints/indexes and no unintended grants. Check PostgreSQL logs for compilation errors without recording answers/credentials.

6. CREATE FUNCTION alone may not compile/plan every embedded PL/pgSQL statement. Exercise every branch via the matrix below. `staging_negative_tests.sql` now sets ON_ERROR_STOP itself. Supply the four synthetic profile UUIDs with psql -v student_a=... -v student_b=... -v organizer_a=... -v organizer_b=..., plus -v staging_ack=DISPOSABLE. Its temporary release enable and test records roll back. It does not validate JWTs or PostgREST by itself.
7. Run multi-session tests using separately prepared committed synthetic staging fixtures. Do not reuse the rolled-back IDs from step 6. Use three psql sessions (A/B/operator) and bounded lock/statement timeouts. Record SQLSTATE, final counts and transaction outcomes, not secrets. Reset staging between scenarios.
8. Test caller-scoped real staging JWTs through Supabase and, when corresponding endpoints exist, Express. Do not invent Express form endpoints in this phase. Run the existing frontend/backend suites, lint/build against isolated configuration before integration.
9. Rehearse rollback and retention below, confirm the release state is false and save the sanitized test report. No production execution/activation follows automatically.

## Security/regression matrix (all database scenarios UNEXECUTED)

| Scenario | Procedure and required result |
| --- | --- |
| Roles and ownership | Owner saves/publishes; foreign organizer, Student and anon fail draft writes; wrong owner receives no draft/answers |
| Student privacy | A's registration answers readable by A and owner only; B/foreign organizer denied even on published event |
| All five types | Valid short/paragraph/dropdown/radio/checkbox accepted; required blanks including Unicode whitespace, nulls/wrong types, invalid choices, duplicate selections rejected |
| Limits | 20 vs 21 questions/choices; label/title/answer raw length bounds; oversized JSON and padded oversized IDs; unknown fields; malformed roots; Unicode parity |
| Active version | Stale/null expected version denied; older answers still display original labels; a concurrent publish cannot create mixed-version answers |
| Required bypass | Legacy RPC with active version fails even if release disabled; direct table INSERT/UPDATE/UPSERT and private helper EXECUTE fail; optional/empty published form requires version acknowledgement |
| Release integrity | False AND missing row deny publication/submission; draft save still authorized; disable waits for transactions holding release SHARE lock |
| Capacity | A submits final seat and holds transaction; B blocks on event; commit A -> B full; rollback A -> B succeeds. Exact committed bookings <= capacity |
| Capacity edit | Register two students; owner sets capacity=1 -> reject. Repeat with concurrent last-slot submission/edit and reverse lock acquisition order |
| Duplicate/cancel | Same Student races -> one booking; cancelled existing row still rejects new registration. Existing ID never replaced |
| Atomic rollback | Test-only failing BEFORE INSERT answer trigger raises after helper inserts registration; confirm neither registration nor answer survives. Remove test trigger after scenario |
| Delete | Populated event delete fails without cascades; empty event with draft and empty event with published unused version delete cleanly |
| QR/attendance | Existing registration ID -> same TKT payload; owner scans once; duplicate scan fails; foreign owner/event mismatch fails; old no-form tickets still work |
| No-form compatibility | Student, ongoing, expired, draft, full and duplicate outcomes match baseline; unchanged response fields and counts |
| History/immutability | Direct version/answer edits denied; publish new version leaves prior answers unchanged; student/profile erasure with retained answers fails atomically |
| Defaults/grants | After install no direct access to new tables; no TRUNCATE rights on core/new tables; profile role and event owner modifications denied |
| JWT/API | Missing/invalid/expired staging JWT denied; actual accounts establish claims; SQL SET ROLE is not counted as token verification |

The prepared staging SQL covers a subset (ownership/privacy, required/whitespace, bypass, stale versions, duplicates, capacity reduction, scan duplicate, deletion, missing release row and row counts). The matrix explicitly includes manual/multi-session cases not automated yet. Do not report the entire matrix passed from one script.

## Rollback and remaining gates

Before custom publication/data: restore the captured legacy public function/grants only after confirming no active versions/answers. Remove candidate objects in dependency order without CASCADE, or reset the disposable staging snapshot. Preserve privilege hardening and intended capacity/deletion corrections unless separately reviewed. Separate per-file transactions mean partial installs require inspection; blindly rerunning CREATE files is not recovery.

After answers: keep immutable versions, answer data, FKs and legacy guard; disable candidate publication/submission and restore a compatible client, rather than reinstalling a bypassing RPC. No-form events continue. Rehearse restoration from a staging snapshot and compare registration IDs, answer versions and attendance rows. Production retention/erasure requires an explicit controlled administrative design; no destructive down script is supplied.

Outstanding gates: storage/retention/empty-form compatibility approval; exact staging target and authorization; PostgreSQL compilation/runtime tests; Unicode validation agreement; concurrent and actual-JWT tests; external schema/writer review. No frontend files, database records or live policies changed in this review.
