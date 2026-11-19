# Phase 12B.3D — isolated staging preparation

Date: 2026-11-04. **Preparation only. No services started, packages installed, database connected, migrations applied, accounts created or release controls enabled.** Production files/configuration are unchanged.

## Selected environment

Recommend **Local Supabase**, in a new unlinked `.staging.local` directory, with its own Docker volumes and PostgreSQL 17. It avoids hosted project credentials and supplies real Auth/PostgREST/managed roles rather than mocked auth.uid(). Supabase documents project-local CLI installation, local `init`/`start` and a container runtime requirement on Windows ([official instructions](https://supabase.com/docs/guides/local-development/cli/getting-started)).

A separate hosted staging project is a fallback if Docker cannot be installed. It requires a separately approved project identifier, credentials, cost and target review. Do not substitute the production project or a linked production checkout. No hosted project was created or accessed here.

Observed prerequisites:

| Item | Result |
| --- | --- |
| Node | v24.14.1 available |
| npm | available |
| Docker CLI / Desktop | not on PATH; standard Desktop installation paths absent |
| Supabase CLI | not on PATH or in root node_modules |
| psql | not on PATH; container psql can be used later |
| Supabase config | no root supabase/config.toml |

Configuration review: frontend reads VITE_SUPABASE_URL/VITE_SUPABASE_PUBLISHABLE_KEY; backend reads SUPABASE_URL/SUPABASE_PUBLISHABLE_KEY and requires HTTPS. No environment values were printed or changed. `.gitignore` already ignores `*.local`, `.env` and `.env.*`. Existing production URL/key files must never be copied into staging. Backend HTTPS-only validation means the usual local HTTP Supabase endpoint cannot currently be used by Express unchanged. That is a later integration blocker, not permission to weaken the validator. Database/Auth/PostgREST staging can proceed separately.

## Gates before any setup/execution

1. Approve the JSONB design as a staging candidate; retention/Unicode/empty-version decisions in Phase 12B.3C remain open for production.
2. Authorize installing Docker Desktop with Linux containers/WSL2 and local CLI dependencies. Follow Docker's Windows requirements; confirm virtualization, resources and corporate installation policy. No installation is performed by this task.
3. Authorize creating/starting the isolated local stack. This initializes local managed schemas even though it does not apply Attendify migrations.
4. Verify the exact local Docker endpoint/container and approve baseline/migration execution separately. Until then stop after preparation. A container name or a service name alone is not proof of isolation.

## Exact local setup instructions (future authorized operator)

From a fresh PowerShell window, after Docker installation and approval:

```powershell
Set-Location C:\Users\User\Desktop\attendify
$repoPath = (Get-Location).Path
$stagePath = Join-Path $repoPath '.staging.local'
if (Test-Path $stagePath) { throw 'Existing staging directory: inspect rather than overwrite' }
New-Item -ItemType Directory -Path $stagePath
Set-Location $stagePath
npm.cmd init -y
npm.cmd install --save-dev --save-exact supabase
if ($LASTEXITCODE -ne 0) { throw 'CLI installation failed' }
npx.cmd --no-install supabase --version
npx.cmd --no-install supabase init
```

The install resolves and pins a CLI version in this separate package/lockfile; record that version for reproducibility. It does not change Attendify's package files. Do not use global npm installation. Do not run `supabase login`, `link`, `db pull`, `db push`, `--linked` or supply a hosted `--db-url`.

Inspect only the newly generated `.staging.local/supabase/config.toml`. Edit existing keys rather than duplicating TOML sections:

```toml
project_id = "attendify-form-staging"
# In existing [db]:
major_version = 17
port = 55322
shadow_port = 55320
# In existing [api]:
port = 55321
# In existing [studio]:
port = 55323
```

Keep normal local Auth enabled and all SMTP/external OAuth/webhooks/Edge Functions disabled or unconfigured. No production secrets, remote storage or production callback URLs. API schemas must not include attendify_private. Keep schema migration/seed directories empty: the review files live under docs, so startup must not auto-apply them. Inspect other generated service ports for conflicts. Supabase's [configuration reference](https://supabase.com/docs/guides/local-development/cli/config) documents project_id and database version/port settings; use the installed CLI's generated schema if it differs and stop rather than guess.

Before starting, inspect Docker locally:

```powershell
if ($env:DOCKER_HOST -or $env:DOCKER_CONTEXT) { throw 'Unexpected Docker override; review before continuing' }
docker context show
docker context inspect --format '{{.Endpoints.docker.Host}}'
docker info --format '{{.OSType}}'
```

Require a local Docker Desktop named-pipe endpoint (not tcp/ssh/remote) and linux containers. Confirm the selected context in Desktop. Resolve any ambiguity before starting. Also confirm the staging config has no remote project link or production env references. After startup authorization:

```powershell
npx.cmd --no-install supabase start
```

This downloads/starts local containers. CLI output may include local keys; keep it local, do not paste status output/session objects into chat. Inspect published ports and firewall rules: local addresses in a browser do not guarantee Docker ports are not bound to all interfaces. Require loopback-only bindings or a verified firewall blocking LAN/public access before using synthetic auth. Do not expose Studio or database ports through a tunnel.

## Isolation verification — mandatory before each SQL session

```powershell
$stageContainer = 'supabase_db_attendify-form-staging'
docker ps --filter "name=^/$stageContainer$" --format '{{.Names}} {{.Image}} {{.Ports}}'
docker inspect --format '{{.Name}} {{.Config.Image}}' $stageContainer
docker inspect --format '{{json .Mounts}}' $stageContainer
docker port $stageContainer
```

Review identity, local image, new staging-only mounts/volumes, database port 55322 and project/container labels without printing `.Config.Env` (contains credentials). If the CLI uses a different name, stop and reconcile it with the new config and local Docker inventory; do not select the first database container. No production directory/volume or remote Docker endpoint may be used.

Use psql INSIDE this verified local container over its Unix socket, never a host connection string. Check:

```powershell
docker exec -u postgres $stageContainer psql -X -U postgres -d postgres -h /var/run/postgresql -v ON_ERROR_STOP=1 -c "SELECT current_database(),current_user,version(),inet_server_addr();"
```

Require postgres/PG17 and a socket connection (inet_server_addr NULL). Review that there are no Attendify public tables before baseline installation and no real auth users. The socket does not prove the Docker daemon is local; both checks are necessary. Record the verified Docker context endpoint, container ID, image/version, staging directory, ports and approval in a local run log, without passwords/keys. **No target has been verified here because the tools are not installed.**

## Sanitized baseline prepared

Files added:

- `docs/staging/build-baseline.mjs`: offline generator with the authoritative CSV SHA-256 pinned; parses all 644 JSON cells.
- `docs/staging/baseline-from-evidence.sql`: generated review draft recreating four application tables, 19 constraints/seven supporting indexes, six functions, two application triggers, eight policies, explicit table/function/column grants. Zero application rows or auth-account seeds.

Generator executed locally successfully; **SQL was not executed or compiled**. Run again offline with `node docs/staging/build-baseline.mjs` if needed. It fails if the evidence hash changes. Review generated SQL before execution. It intentionally recreates the legacy excessive privileges and invoker-trigger behavior to test their corrections; never install it on production.

This is a reconstructed APPLICATION baseline, not a full pg_dump. Local Supabase provides auth/storage/other managed schemas and roles. Managed default ACLs, global memberships, extension settings and other-schema function bodies are NOT overwritten. Compare effective privileges and auth behavior with the original evidence before declaring parity. Baseline refuses existing app tables, non-postgres role, non-PG17, missing auth.users or missing staging acknowledgement.

No synthetic credentials are embedded. After separately authorized baseline application, create four synthetic accounts through LOCAL Studio/Auth only, e.g. student-a@example.test, student-b@example.test, organizer-a@example.test and organizer-b@example.test. Use unique local passwords kept off chat/logs. The provisioning trigger defaults all to student; promote exactly the two verified synthetic organizer UUIDs through the local administrative connection after approval, and verify all four profiles. Never reuse production users or UUIDs. Schema-only reconstruction needs no production connection.

## Safe future SQL commands — DO NOT RUN without target approval

After target verification and explicit authorization, this PowerShell helper copies a reviewed file into the fixed local container and executes container psql without a host URL. Run only in the reviewed local Docker context. Do not use this as an automatic runner.

```powershell
function Invoke-ReviewedStagingSql([string]$SqlPath, [string[]]$Variables = @()) {
 if ($env:DOCKER_HOST -or $env:DOCKER_CONTEXT) { throw 'Docker override detected' }
 $contextEndpoint = docker context inspect --format '{{.Endpoints.docker.Host}}'
 if ($LASTEXITCODE -ne 0 -or $contextEndpoint -notmatch '^npipe://') { throw 'Local Desktop endpoint not confirmed' }
 $sqlFile = (Resolve-Path -LiteralPath $SqlPath).Path
 docker cp $sqlFile "${stageContainer}:/tmp/attendify-reviewed.sql"
 if ($LASTEXITCODE -ne 0) { throw 'Copy failed' }
 docker exec -u postgres $stageContainer psql -X -U postgres -d postgres -h /var/run/postgresql -v ON_ERROR_STOP=1 @Variables -c "SET attendify.staging_ack='LOCAL_DISPOSABLE';" -f /tmp/attendify-reviewed.sql
 if ($LASTEXITCODE -ne 0) { throw 'SQL failed; stop and inspect partial installation' }
}
Invoke-ReviewedStagingSql "$repoPath/docs/staging/baseline-from-evidence.sql"
Invoke-ReviewedStagingSql "$repoPath/docs/proposed-migrations/staging_preflight.sql"
```

Inspect baseline parity with the supplied catalog inspection queries. Require check_function_bodies=on, UTF8, READ COMMITTED, expected public schema objects/grants and no candidate schema collisions. The baseline must contain no students/registrations/events. Create synthetic fixtures only after this check.

After separate candidate migration authorization, with local app traffic stopped, use EXACT order:

```powershell
$migrationNames = @(
 '20261104_001_revoke_unneeded_table_privileges.sql',
 '20261104_002_form_storage.sql',
 '20261104_003_form_operations.sql',
 '20261104_004_atomic_registration.sql',
 '20261104_005_event_integrity_prerequisite.sql'
)
foreach ($name in $migrationNames) {
 Invoke-ReviewedStagingSql (Join-Path "$repoPath/docs/proposed-migrations" $name)
}
Invoke-ReviewedStagingSql "$repoPath/docs/proposed-migrations/verify_table_privileges.sql"
Invoke-ReviewedStagingSql "$repoPath/docs/proposed-migrations/verify_form_persistence.sql"
```

Never use `*.sql` or `db reset` to run this folder; it contains tests that write fixtures. Files commit separately; a later failure does not revert earlier files. Record each file hash and successful commit. Stop on first error; do not blindly rerun. Require release.enabled=false and no unintended grants. No publication/submission activation is authorized in this phase.

## Test plan and acceptance criteria

The SQL matrix and manual concurrency procedures in `PHASE12B3C_SQL_REVIEW.md` remain required. Every test below is **NOT RUN**. Installing CREATE FUNCTION alone is not full PL/pgSQL branch compilation.

| Test group | Acceptance |
| --- | --- |
| Baseline parity/compilation | All reconstructed tables/constraints/functions/policies match evidence; migrations compile with function-body checks on; all RPC branches exercised without ambiguity/type errors |
| Authorization/RLS | A/B student and organizer identities distinct; anon/wrong role/foreign owner denied; profiles.role immutable by ordinary client; own full_name still editable |
| Privacy | Only submitting student and owning organizer can read answers; published events do not expose drafts/answers; private helpers and tables inaccessible directly |
| Required questions | Missing/blank/wrong type/unknown choices/oversized input fail; legacy RPC and direct table writes cannot bypass active forms |
| Atomicity | A test-only staging answer-insert failure after registration insert leaves neither registration nor answers/count increment |
| Capacity/concurrency | Separate A/B sessions race for last seat: one commit; B waits on event lock; rollback A lets B succeed; capacity edits below real count rejected |
| Version concurrency | Draft CAS rejects stale revisions; publish/submit share event lock; old-version submissions fail; historical answers remain bound to old definition |
| Duplicate/cancellation | Same student produces one registration; cancelled row still prevents re-registration; unchanged UUID/reference |
| QR/attendance | New and legacy ticket IDs scan correctly, mismatched event/foreign organizer/duplicate scans fail; attendance/count RPC results unchanged |
| Rollback/retention | Unused form event deletion works; populated deletion fails; submitted history cannot be silently erased; rollback never restores legacy question bypass |
| Disabled state | false/missing release row denies publication/submission; absence of config never permits operations |

Future staging-only test command (requires separate authorization to temporarily exercise custom publication/submission **inside the rollback test transaction**, never production):

```powershell
# Set these variables to the four verified synthetic local profile UUIDs first.
Invoke-ReviewedStagingSql "$repoPath/docs/proposed-migrations/staging_negative_tests.sql" @(
 '-v','staging_ack=DISPOSABLE',
 '-v',"student_a=$studentA",'-v',"student_b=$studentB",
 '-v',"organizer_a=$organizerA",'-v',"organizer_b=$organizerB"
)
Invoke-ReviewedStagingSql "$repoPath/docs/proposed-migrations/verify_form_persistence.sql"
```

This script temporarily enables local release within its transaction and rolls back. **Do not run it under preparation-only authorization.** Its SET ROLE tests are not JWT verification. Use actual local Auth/PostgREST tokens for separate API denial tests, never print them. Express form endpoints do not yet exist and Express's HTTPS requirement blocks default local HTTP; report those integration tests blocked rather than claiming coverage.

For concurrency, open two container psql terminals with the same verified target and committed synthetic fixtures. A holds BEGIN after final-slot registration; B attempts registration; A COMMIT -> B full. Repeat A ROLLBACK -> B success. Use bounded lock/statement timeouts, reverse ordering for capacity edits and publication, and inspect committed rows from a third local session. These scenarios require separately authorized staging-only fixtures/release, not the rolled-back test's IDs.

Before integration, run existing frontend/backend suites and lint/build using isolated configuration. Do not launch the existing production-configured dev app to test local data. A future separate frontend checkout/config must use only local public credentials; no env files are changed here.

## Rollback and blockers

Record a clean isolated staging snapshot/volume baseline before installation. Before custom data, disposable reset/recreation is preferable to guessed DOWN SQL; verify exact local directory and volumes before any deletion. No destructive reset command is supplied. After answers, retain immutable history and legacy anti-bypass guard; disable local release through an approved operation and restore a compatible client. Never restore a question-bypassing RPC or drop answer history as routine rollback. Test restrictive erasure FK behavior; production retention policy is unresolved.

Current blockers: Docker/CLI not installed; no running/verified target; candidate design and staged execution approvals pending; reconstructed baseline uncompiled and managed-schema parity unverified; synthetic fixtures absent; Unicode/retention decisions pending; Express local HTTPS integration unresolved. No environment is claimed ready/running.

**Production untouched:** no production connection, secrets displayed, account writes, environment changes, schema/RLS/RPC modifications, migration execution or release activation. Only offline preparation artifacts were added.
