# Phase 12B.3A — deployed database evidence collection

Date: 2026-11-04 (Asia/Manila). No live database inspected in this phase yet. No application code or database objects changed. The companion SQL is inspection material, not a migration.

## Safe SQL Editor procedure

1. Open the existing Attendify Supabase project. Confirm the project identity locally; do not send credentials. Open SQL Editor and a new query.
2. Copy the entire contents of `docs/PHASE12B3A_INSPECT_DATABASE.sql`. Execute as the project's authorized administrative inspection role. Do not switch into a student session or call any application RPC.
3. Run the whole script, including `BEGIN TRANSACTION READ ONLY` and `ROLLBACK`. Only system catalogs and built-in metadata functions are read. `SET LOCAL` changes only this transaction's timeout. No table contents, passwords, tokens, or authentication sessions are queried.
4. Export the result set as CSV/JSON. There are two metadata columns plus `total_rows`. Ensure exported row count matches `total_rows`; SQL Editor result limits may truncate a large report. If necessary, rerun the whole script with the final SELECT filtered to individual sections, e.g. `FROM report WHERE section = '08_routines' ORDER BY section, metadata::text;`, retaining the transaction wrapper. Do not accept an incomplete export as complete evidence.
5. Review locally before sharing: existing function bodies/defaults/settings might themselves contain hardcoded secrets. Redact secret values only and note redactions. Keep signatures, checks, SQL operations, ownership, policies and grants intact. Do not attach `.env` files, application rows, session objects or keys.
6. Share the sanitized catalog output for inspection. Also provide only the **names** of the exposed Data API schemas and extra search-path schemas from project API settings; do not share keys or connection strings. These settings are not reliably established by this catalog snapshot.
7. If permission/timeout errors occur, retain the error code and safe message. Run `ROLLBACK;` if the editor reports an aborted transaction. Do not grant permissions, disable RLS, or change timeouts globally to make the audit pass.

The SQL has been reviewed as catalog-only but **has not been executed or syntax-validated against your PostgreSQL server**. Report a query error rather than substituting write-capable commands. An administrative SQL Editor read does not demonstrate student/organizer RLS behavior.

## What the output establishes

Sections 03–07 cover public relations, column types/defaults, inbound and outbound constraints, indexes and triggers (including internal constraint triggers). Section 08 returns every public function/procedure overload, plus custom trigger functions on public relations and `auth.users`. It includes full definitions, return types, security mode, owner, settings and ACLs. Sections 09–16 cover policies, rewrite/view paths, role flags/membership, effective privileges and default grants. The remaining sections cover enums/domains, other-schema routine inventory, inheritance and schema/sequence privileges.

Inspect all four RPCs: `register_for_event`, `get_event_registration_counts`, `check_in_ticket`, `get_attendance_records`. Inspect helper calls recursively, including registration writes reached through other functions. Do not infer safety from a function name or a text search alone.

Scope is intentionally public application objects plus profile-provisioning triggers. Other schemas are inventoried, not fully exported. If a function, policy, default, view, partition or trigger references an application object outside public, obtain that object's definitions and privileges too. Dynamic SQL and external services cannot be exhaustively discovered by catalog dependencies. Do not claim all write paths are enumerated until these references and the exposed-schema settings are resolved.

For a discovered helper, this read-only query retrieves its overloads without executing them. Replace the two literals with the exact schema/name from the report:

```sql
BEGIN TRANSACTION READ ONLY;
SELECT n.nspname, p.oid::regprocedure AS signature,
       pg_get_userbyid(p.proowner) AS owner,
       p.prosecdef AS security_definer, p.proconfig, p.proacl,
       pg_get_functiondef(p.oid) AS definition
FROM pg_catalog.pg_proc p
JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'REPLACE_SCHEMA'
  AND p.proname = 'REPLACE_FUNCTION'
  AND p.prokind IN ('f','p');
ROLLBACK;
```

## Source-verified findings

- `src/services/registrationService.js:45`: the sole frontend registration mutation discovered calls `register_for_event` with only `p_event_id`. It expects an object containing `id,event_id,student_id,status,registered_at`. No answers/version contract exists.
- The same service reads `public.registrations` and registered counts. Client-side status filters do not establish database constraints or capacity semantics.
- `src/services/attendanceService.js`: check-in accepts registration/event/student IDs; records and counts are read through RPCs. Actual attendance relations and enforcement remain unknown until definitions arrive.
- `src/utils/ticketData.js`: QR references the existing registration ID (`TKT-` + uppercase ID), student ID and event ID. Preserving these IDs and response fields avoids changing the QR payload.
- `backend/src/app.js`: existing Express backend supports reads; it rejects write methods. Registration does not currently traverse Express.
- No application SQL migrations/deployed definition exports were found in the repository. Phase 12B.2 was reviewed. No deployed contract or negative RLS test is newly verified here.

## Exact missing definitions and bypass checklist

| Missing evidence | Decision it blocks |
| --- | --- |
| All registration RPC overloads, helper bodies, owners, settings, execution privileges | Atomic extension point, trusted identity and legacy compatibility |
| Events/registrations/profiles/actual attendance DDL, status types, keys, defaults, FKs/cascades, unique and partial indexes | Correct keys, duplicate/cancellation semantics, retained ticket/attendance relationships |
| Capacity and registration triggers, enable modes, trigger functions, event capacity-update rules | Last-slot serialization, consistent lock order, capacity edits versus concurrent registrations |
| Registration count and check-in definitions | Which statuses consume seats; duplicate scan and registration consistency |
| RLS flags/policies and table/column/schema/function grants; profile/ownership write protections | Direct REST inserts/updates, role escalation, owner changes and answer privacy |
| Views/rules/INSTEAD OF triggers, inherited/partitioned tables, custom-schema helpers and exposed schemas | Indirect write entry points and security-definer/view bypasses |
| External Edge Functions, scheduled jobs or other clients that write registrations, if any | Write paths outside this repository/catalog logic |

**Confirmed entry point:** legacy `register_for_event(p_event_id)`. **Potential, not confirmed, bypasses:** other RPC overloads/wrappers, direct INSERT or UPSERT, UPDATE restoring a cancelled status or changing event/student association, writable views, trigger-generated rows, custom-schema routines, external jobs. DELETE/re-registration can also alter uniqueness/capacity semantics. Review each permitted entry point; do not revoke working privileges speculatively.

SQL catalog evidence can prove definitions and permissions at capture time, but not runtime concurrency or all effective RLS outcomes. Negative account isolation and concurrent mutation tests belong in an authorized isolated staging database, not this read-only production inspection. Missing tests remain unverified.

## Atomic persistence compatibility decision

Feasibility is conditional on deployed definitions, not confirmed yet. The minimal safe extension must use one database transaction for the existing registration operation plus immutable-version answer persistence. An answer-validation failure must roll back the registration and any counter changes. It must retain the existing registration primary key, return shape, attendance relationships and ticket format.

Reuse the verified capacity/duplicate enforcement rather than introducing competing counters. Review event/form locks and publication/capacity-edit lock order before implementation. Validate required fields, allowed choices, identity, role, event eligibility and expected active version inside the database transaction. A committed retry must retain the original answer version; it must not create a second registration or overwrite answers.

An Express-only validator is insufficient while direct Supabase registration remains callable. All eligible write paths must share enforcement or deny custom-form registrations. Legacy no-form events retain existing behavior. The precise wrapper/internal-function approach cannot be selected until function bodies, grants and triggers have been inspected. Do not assume calling the old RPC from a new function is safe without inspecting its lock and security context.

## Minimal Phase 12B.3B sequence

1. Inspect sanitized output; resolve non-public helper references, overloads and all write paths. Record an evidence matrix and exact deployed baseline. Stop if truncated or incomplete.
2. Finalize only the necessary contract choices: key types, capacity statuses, retry behavior, version conflicts, ownership/privacy and legacy no-form compatibility. Keep the Phase 12B.2 design; no broad redesign.
3. Prepare additive staging migrations for draft/form versions/questions/choices/answer relationships, bounded validation, RLS and least-privilege grants. No retroactive answer backfill. Review cascade/deletion behavior.
4. Prepare atomic draft/publish and registration-plus-answer functions using inspected enforcement, with anti-bypass protection on legacy and indirect entry points before forms can be active. Preserve registration result and QR identity contracts.
5. In explicitly authorized staging, test transaction rollback, last-slot concurrency, duplicates/retries, version publication races, direct-write denial and Student/Organizer isolation. Production metadata inspection does not substitute for these tests.
6. Add narrowly scoped user-token Express handlers and isolated tests; keep activation off. Integrate organizer draft save first, then publishing and student submission together only after security gates pass. Event creation and draft save must report partial failures honestly.
7. Run existing regression suites and verify registration, QR/check-in/counts and account isolation. Review migration and rollback artifacts before any production execution or activation.

Rollback before use: disable feature and leave compatible additive schema unless removal is separately approved. After answers exist: retain history and anti-bypass enforcement; never restore a legacy path that silently ignores required questions. No-form registrations should continue unchanged. Production deployment/SQL execution requires separate authorization.

## Verdict and next input

**Evidence collection prepared; persistence implementation blocked pending deployed output review.** No current deployed vulnerability is asserted. No database connection, sign-in, application RPC, live test or migration was run. No production files were changed. Automated suites were not rerun for documentation/catalog-query additions; historical test totals are not new verification.

Next input: sanitized full catalog result plus exposed-schema names. No password, service-role key, JWT or user record is needed. After inspection, report whether the capacity, duplicate, legacy-write and RLS gates are satisfied before authorizing Phase 12B.3B persistence work.
