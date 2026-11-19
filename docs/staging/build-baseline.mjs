// Offline reconstruction ONLY. No database/network libraries or execution.
import { readFileSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
const args = process.argv.slice(2)
if (args.some(arg => arg !== '--cloud') || args.length > 1) throw Error('Use no argument (local) or --cloud')
const cloud = args.includes('--cloud')
const source = new URL('../database-evidence/phase12b3a-inspection-original.csv', import.meta.url)
const bytes = readFileSync(source)
const digest = createHash('sha256').update(bytes).digest('hex')
if (digest !== '09c66eff0a7d5300edb30e25c0357e84d29317de3f349d35f331a70ad600fc75') throw Error('Evidence hash changed; review before rebuilding')
const csv = bytes.toString('utf8').replace(/^\uFEFF/, '')
const rows = []; let row = [], field = '', quoted = false
for (let i = 0; i < csv.length; i++) {
  const ch = csv[i]
  if (ch === '"') {
    if (quoted && csv[i + 1] === '"') { field += '"'; i++ } else quoted = !quoted
  } else if (ch === ',' && !quoted) { row.push(field); field = '' }
  else if ((ch === '\n' || ch === '\r') && !quoted) {
    if (ch === '\r' && csv[i + 1] === '\n') i++
    row.push(field); if (row.some(Boolean)) rows.push(row); row = []; field = ''
  } else field += ch
}
if (quoted) throw Error('Unterminated CSV field')
if (field || row.length) { row.push(field); rows.push(row) }
if (rows.shift().join(',') !== 'section,metadata,total_rows' || rows.length !== 644) throw Error('Invalid evidence shape')
const parsed = rows.map(([section, metadata, total]) => {
  if (total !== '644') throw Error('Invalid reported total')
  return { section, ...JSON.parse(metadata) }
})
const group = section => parsed.filter(r => r.section === section)
const qi = s => '"' + s.replaceAll('"', '""') + '"'
const relation = s => 'public.' + qi(s.replace(/^public\./, ''))
const role = s => s === 'PUBLIC' ? 'PUBLIC' : qi(s)
const sql = [`-- GENERATED OFFLINE from authoritative metadata; NOT a production dump.
-- STAGING ONLY. Contains NO application rows, credentials or auth account seeds.
-- Restores known legacy weaknesses for faithful before/after staging tests.
-- Never apply to production. Requires clean ${cloud ? 'cloud staging' : 'local'} Supabase managed schemas.
BEGIN;
${cloud ? "-- Replace only this acknowledgement AFTER verifying the staging project reference in Dashboard.\n-- This setting is operator acknowledgement, NOT automatic project identity verification.\nSET LOCAL attendify.staging_ack = 'REPLACE_AFTER_STAGING_TARGET_CHECK';" : ''}
SET LOCAL search_path = public, pg_catalog;
DO $$ BEGIN
 IF current_setting('attendify.staging_ack',true) IS DISTINCT FROM '${cloud ? 'CLOUD_STAGING_CONFIRMED' : 'LOCAL_DISPOSABLE'}'
 OR current_user <> 'postgres' OR current_setting('server_version_num')::int / 10000 <> 17
 THEN RAISE EXCEPTION 'Explicit verified PG17 staging target required'; END IF;
 IF current_setting('server_encoding') <> 'UTF8' OR current_setting('check_function_bodies') <> 'on'
 THEN RAISE EXCEPTION 'Require UTF8 and function body checking'; END IF;
 IF to_regclass('auth.users') IS NULL OR to_regprocedure('auth.uid()') IS NULL
 THEN RAISE EXCEPTION 'Use real isolated Supabase Auth schema'; END IF;
 IF (SELECT count(*) FROM pg_roles WHERE rolname IN ('anon','authenticated','service_role')) <> 3
 THEN RAISE EXCEPTION 'Expected managed roles missing'; END IF;
 IF to_regclass('public.events') IS NOT NULL OR to_regclass('public.profiles') IS NOT NULL
 OR to_regclass('public.registrations') IS NOT NULL OR to_regclass('public.attendance') IS NOT NULL
 THEN RAISE EXCEPTION 'Baseline requires empty application schema'; END IF;
 IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='public' AND p.proname IN ('handle_new_user','validate_event_capacity','check_in_ticket','get_attendance_records','get_event_registration_counts','register_for_event'))
 THEN RAISE EXCEPTION 'Existing application routines: stop and review'; END IF;
END $$;`]
const tables = ['profiles', 'events', 'registrations', 'attendance']
for (const name of tables) {
  const cols = group('04_columns').filter(c => c.table === `public.${name}`).sort((a,b) => a.position-b.position)
  if (!cols.length || cols.some(c => c.identity || c.generated)) throw Error('Unsupported/missing columns')
  sql.push(`CREATE TABLE ${relation(name)} (\n${cols.map(c => ` ${qi(c.column)} ${c.type}${c.default === null ? '' : ` DEFAULT ${c.default}`}${c.not_null ? ' NOT NULL' : ''}`).join(',\n')}\n);`)
  sql.push(`ALTER TABLE ${relation(name)} OWNER TO postgres;`)
}
const constraints = group('05_constraints').sort((a,b) => Number(a.kind === 'f') - Number(b.kind === 'f'))
for (const c of constraints) sql.push(`ALTER TABLE ${relation(c.table)} ADD CONSTRAINT ${qi(c.name)} ${c.definition};`)
const indexed = new Set(constraints.filter(c => ['p','u'].includes(c.kind)).map(c => c.name))
for (const idx of group('06_indexes')) if (!indexed.has(idx.index.replace(/^public\./,''))) sql.push(idx.definition + ';')
const routines = group('08_routines')
if (routines.length !== 6) throw Error('Unexpected routines')
for (const f of routines) {
  // A baseline must not overwrite a pre-existing function in a supposedly fresh target.
  sql.push(f.definition.trim().replace(/^CREATE OR REPLACE FUNCTION /, 'CREATE FUNCTION ') + ';')
  sql.push(`ALTER FUNCTION public.${f.signature} OWNER TO postgres;`)
}
for (const t of group('07_triggers').filter(t => !t.internal)) {
  if (t.enabled !== 'O') throw Error('Nonstandard trigger state')
  sql.push(t.definition + ';')
}
for (const t of group('03_relations')) {
  if (!tables.includes(t.name) || t.kind !== 'r' || !t.rls_enabled || t.rls_forced) throw Error('Unexpected relation')
  sql.push(`ALTER TABLE ${relation(t.name)} ENABLE ROW LEVEL SECURITY;`)
}
for (const p of group('09_policies')) {
  const cmd = {r:'SELECT',a:'INSERT',w:'UPDATE',d:'DELETE','*':'ALL'}[p.command]
  if (!cmd) throw Error('Unknown policy command')
  sql.push(`CREATE POLICY ${qi(p.name)} ON ${relation(p.table)} AS ${p.permissive ? 'PERMISSIVE':'RESTRICTIVE'} FOR ${cmd} TO ${p.roles.map(role).join(',')}${p.using ? ` USING (${p.using})`:''}${p.with_check ? ` WITH CHECK (${p.with_check})`:''};`)
}
const rights = {a:'INSERT',r:'SELECT',w:'UPDATE',d:'DELETE',D:'TRUNCATE',x:'REFERENCES',t:'TRIGGER',m:'MAINTAIN',X:'EXECUTE'}
function acl(entries, object) {
  sql.push(`REVOKE ALL ON ${object} FROM PUBLIC, anon, authenticated, service_role;`)
  for (const entry of entries || []) {
    const match = /^([^=]*)=([^/]*)\/([^/]+)$/.exec(entry)
    if (!match || match[2].includes('*')) throw Error('ACL requires manual review')
    const [,who, permissions] = match
    if (who === 'postgres') continue // object owner rights
    if (!['','anon','authenticated','service_role'].includes(who)) throw Error('Unexpected grantee')
    const names = [...permissions].map(p => { if (!rights[p]) throw Error('Unknown privilege'); return rights[p] })
    if (names.length) sql.push(`GRANT ${names.join(', ')} ON ${object} TO ${role(who || 'PUBLIC')};`)
  }
}
for (const t of group('03_relations')) acl(t.acl, `TABLE ${relation(t.name)}`)
for (const f of routines) acl(f.acl, `FUNCTION public.${f.signature}`)
// The only explicit column grant in this fingerprinted snapshot.
const columnGrants = group('04_columns').filter(c => c.acl)
if (columnGrants.length !== 1 || columnGrants[0].table !== 'public.profiles' || columnGrants[0].column !== 'full_name' || columnGrants[0].acl.join() !== 'authenticated=w/postgres') throw Error('Column grants changed')
sql.push('GRANT UPDATE(full_name) ON public.profiles TO authenticated;')
sql.push(`-- Managed schemas, global role memberships/default ACLs are not overwritten.
-- Verify target managed-role behavior against evidence separately.
COMMIT;`)
writeFileSync(new URL(cloud ? './baseline-cloud-staging.sql' : './baseline-from-evidence.sql', import.meta.url), sql.join('\n\n') + '\n')
console.log('Prepared baseline SQL offline: 644 valid metadata rows; 4 tables, 19 constraints, 6 functions, 2 application triggers. No SQL executed.')
