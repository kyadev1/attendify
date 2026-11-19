# Phase 12B.3F — cloud staging baseline review

Preparation only. The separate `attendify-staging` project's health/empty public schema are **user-reported**, not independently checked through a connection. No staging or production SQL was executed. No environment variables or production code changed.

## Review result and corrections

The generator consumes the pinned original CSV (SHA-256 `09c66eff0a7d5300edb30e25c0357e84d29317de3f349d35f331a70ad600fc75`). Offline parsing checks 644 records and JSON cells. The reconstructed baseline contains four tables/26 columns, 19 constraints, seven constraint-backed indexes, six functions, two application triggers, eight RLS policies and observed explicit ACLs. The 46 exported triggers include internal FK triggers; those must be created by PostgreSQL's constraints, not copied manually.

Corrections made in the generator and generated files:

1. Separate `baseline-cloud-staging.sql` from the local file. Cloud mode has a deliberately invalid acknowledgement placeholder; the local runner keeps its original local acknowledgement.
2. Replace CREATE OR REPLACE with CREATE FUNCTION for baseline installation. Reject any existing public function with the six application names, including overloads, before creating objects. A fresh baseline must not overwrite unrelated routines.
3. Check PG17, postgres execution role, UTF8, function-body checking, auth.users, auth.uid() and the three managed API roles. Stop rather than creating substitute Auth roles/functions or weakening checks.
4. Keep the entire baseline in one transaction. Any collision/dependency error must prevent commit. Existing tables/routines are not dropped or cleared.

Function bodies, signatures, security modes and empty search_path settings remain from evidence; changing CREATE OR REPLACE to CREATE does not change function behavior. All constraints are restored after tables; primary/unique constraints precede FKs. Their seven indexes are not recreated a second time. Tables precede functions using row/composite types; functions precede application triggers; RLS/policies and explicit grants complete before commit. SET LOCAL search_path resolves the exported unqualified FK/policy/trigger references to public. auth.users is supplied by Supabase; the baseline adds only the application's provisioning trigger there.

## Fresh-cloud compatibility and limits

Expected compatible with a fresh **PG17** Supabase project that supplies managed roles/Auth and allows SQL Editor's postgres role to create the app trigger on auth.users. These are preflight requirements, not live verified claims. A project using a different PostgreSQL major version must stop for review (MAINTAIN privilege is used). Do not remove checks to force installation.

The baseline is not a full schema dump: it does not replace managed auth/storage/vault functions, global memberships, project API configuration, extension settings or default privileges. Therefore compare actual installed effective grants before declaring parity. Supabase's managed internal trigger inventory can differ; compare the two application triggers and FK definitions rather than demanding exactly 46 total triggers in a fresh project.

No production project reference, URL, email/password, token, credential or application UUID is used. PostgreSQL object names and auth.uid() are schema dependencies, not production identifiers. No application rows are imported. INSERT statements exist **inside stored function definitions** for future signup/registration/check-in; defining them does not call them. No DROP, TRUNCATE execution, DELETE execution, table-clearing UPDATE or DISABLE ROW LEVEL SECURITY is issued by the installer. REFERENCES ... ON DELETE CASCADE describes existing FK behavior; it does not delete records during installation. REVOKE/GRANT affect only newly created app objects.

## Known risks deliberately retained for parity

The baseline reproduces broad TRUNCATE/REFERENCES/TRIGGER/MAINTAIN grants, the invoker capacity-check trigger and the RLS-filtered delete-empty policy. These are documented weaknesses, **not secure defaults or passed tests**. Restoring them on an empty isolated staging database enables before/after testing. Do not connect the production app, enable public signup campaigns, share staging credentials, add real records or treat this baseline as production-ready. Later scoped hardening requires separate review/execution authorization; it is not silently bundled into this baseline.

The project being under a different account is useful separation but not proof that the active SQL Editor targets it. No SQL database name such as `postgres` reliably identifies the Supabase project. The acknowledgement setting below is only operator confirmation, not automatic project attestation.

## Exact SQL Editor procedure

### 1. Confirm target manually

- Open the distinct staging account/project in a dedicated browser profile or window. Close production SQL Editor tabs to reduce mistakes.
- Confirm project name `attendify-staging` AND its unique project reference in Dashboard URL/settings. Record that nonsecret reference locally; compare it with the production reference locally and ensure they differ. Do not paste passwords or keys.
- Confirm this project's SQL Editor is active and set to its administrative postgres role. A project name can be duplicated; use the reference.
- Stop if project reference/role cannot be confirmed. No agent should connect or run the next steps automatically.

### 2. Run read-only preflight (only after target confirmation)

Open `docs/staging/cloud-preflight.sql`, copy the WHOLE file into a new staging SQL Editor query and run it. Require:

- postgres role, PostgreSQL 17, UTF8, check_function_bodies=on.
- auth.users and auth.uid() present; anon/authenticated/service_role present; anon/authenticated not superuser or BYPASSRLS.
- Zero existing app relations and zero routines with the six app names. Review any existing custom Auth triggers; stop on unexpected ones, especially on_auth_user_created.

“No tables returned” alone does not establish the function/trigger prerequisites. Do not drop an existing object to get past a failed preflight.

### 3. Apply only the reviewed baseline (future explicitly authorized operator)

1. Open `docs/staging/baseline-cloud-staging.sql`. Do NOT use the local `baseline-from-evidence.sql` or append the five form migrations.
2. Copy the entire file into a new query in the SAME staging project.
3. Only after confirming the reference again, change this one line in the SQL Editor copy:

```sql
SET LOCAL attendify.staging_ack = 'CLOUD_STAGING_CONFIRMED';
```

The file on disk intentionally uses `REPLACE_AFTER_STAGING_TARGET_CHECK`. Leaving it unchanged fails safely. No project credentials are required in the SQL.

4. Run the entire script, from BEGIN through COMMIT, with no partial selection. Record success or safe SQLSTATE/message. Do not call register_for_event, check_in_ticket, or sign up users as part of installation.
5. If any error occurs, stop. If SQL Editor reports an aborted transaction, run `ROLLBACK;` in that staging editor/session, then rerun preflight to establish what exists. Do not patch out grants/RLS/guards, drop objects or retry partial selections blindly. A second successful installation is expected to fail its fresh-target checks; this is not an idempotent migration.

### 4. Verify installation without writes

Run the whole `docs/staging/verify-cloud-baseline.sql`. Expect four empty RLS-enabled postgres-owned tables, 19 validated constraints, seven valid PK/unique indexes, six functions, two app triggers, eight policies and observed ACLs. Inspect definitions as well as counts. All custom-form objects should be absent. Profile full_name alone has authenticated column UPDATE permission.

For a more complete comparison, rerun the original `docs/PHASE12B3A_INSPECT_DATABASE.sql` **in staging only** and export sanitized results. Total rows can differ due to managed roles/schema internals; compare the public application objects and effective rights. Do not label legacy TRUNCATE=true a security success.

### 5. Stop

Report the preflight, installation and verification results. Do not apply candidate 001–005, create fixtures, execute mutating tests, publish forms or enable answer submission under this baseline-only procedure. Those remain separately authorized steps. No rollback dropping data is provided; if an installed staging baseline needs removal, verify target and approve a separate reset plan.

## Files and verification performed here

- Updated `docs/staging/build-baseline.mjs` and regenerated local baseline with stronger guards.
- Added `docs/staging/baseline-cloud-staging.sql`.
- Added `docs/staging/cloud-preflight.sql` and `verify-cloud-baseline.sql`.
- Added this report.

Offline generator execution/JavaScript syntax checks are not PostgreSQL compilation. No actual SQL Editor execution, Auth/RLS runtime checks or live tests were performed. Production env files, schema, policies, routines and records were untouched.

## Verdict

**Conditionally ready for controlled cloud-staging baseline execution by an authorized operator**, once the unique target reference and preflight requirements are confirmed and the legacy-parity risks accepted. The assistant has not verified those cloud conditions. This verdict covers only the empty baseline, not registration-form persistence, compilation success, authorization correctness or production readiness.
