-- Phase 12B.3A: catalog inspection only. Run the WHOLE script.
-- No application rows, application RPC calls, migrations or persistent changes.
-- Review output locally for hardcoded secrets in existing function definitions
-- before sharing. Redact secret VALUES only; preserve authorization logic.
BEGIN TRANSACTION READ ONLY;
SET LOCAL statement_timeout = '30s';

-- One result set: section + JSON metadata. Export every row, without truncation.
WITH relations AS (
  SELECT c.*, n.nspname AS schema_name
  FROM pg_catalog.pg_class c
  JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relkind IN ('r', 'p', 'v', 'm', 'f')
), routines AS (
  SELECT p.*, n.nspname AS schema_name
  FROM pg_catalog.pg_proc p
  JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
  WHERE p.prokind IN ('f', 'p') AND (
    n.nspname = 'public'
    OR p.oid IN (
      SELECT t.tgfoid FROM pg_catalog.pg_trigger t
      JOIN pg_catalog.pg_class c ON c.oid = t.tgrelid
      JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
      WHERE NOT t.tgisinternal
        AND (n.nspname = 'public' OR (n.nspname = 'auth' AND c.relname = 'users'))
    )
  )
), report AS (
  SELECT '01_context' AS section, jsonb_build_object(
    'captured_at', CURRENT_TIMESTAMP, 'database', current_database(),
    'inspection_role', current_user,
    'server_version', current_setting('server_version'),
    'transaction_read_only', current_setting('transaction_read_only')
  ) AS metadata
  UNION ALL
  SELECT '02_schema_inventory', jsonb_build_object(
    'schema', n.nspname, 'owner', pg_get_userbyid(n.nspowner), 'acl', n.nspacl
  ) FROM pg_catalog.pg_namespace n
    WHERE n.nspname NOT LIKE 'pg_%' AND n.nspname <> 'information_schema'
  UNION ALL
  SELECT '03_relations', jsonb_build_object(
    'schema', c.schema_name, 'name', c.relname, 'kind', c.relkind,
    'owner', pg_get_userbyid(c.relowner), 'rls_enabled', c.relrowsecurity,
    'rls_forced', c.relforcerowsecurity, 'acl', c.relacl,
    'options', c.reloptions, 'is_partition', c.relispartition,
    'partition_bound', pg_get_expr(c.relpartbound, c.oid),
    'view_definition', CASE WHEN c.relkind IN ('v','m') THEN pg_get_viewdef(c.oid, true) END
  ) FROM relations c
  UNION ALL
  SELECT '04_columns', jsonb_build_object(
    'table', format('%I.%I', c.schema_name, c.relname), 'position', a.attnum,
    'column', a.attname, 'type', format_type(a.atttypid, a.atttypmod),
    'not_null', a.attnotnull, 'identity', a.attidentity, 'generated', a.attgenerated,
    'default', pg_get_expr(d.adbin, d.adrelid), 'acl', a.attacl
  ) FROM relations c JOIN pg_catalog.pg_attribute a ON a.attrelid = c.oid
    LEFT JOIN pg_catalog.pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
    WHERE a.attnum > 0 AND NOT a.attisdropped
  UNION ALL
  SELECT '05_constraints', jsonb_build_object(
    'table', con.conrelid::regclass::text, 'name', con.conname,
    'kind', con.contype, 'validated', con.convalidated,
    'deferrable', con.condeferrable, 'initially_deferred', con.condeferred,
    'referenced_table', NULLIF(con.confrelid, 0)::regclass::text,
    'definition', pg_get_constraintdef(con.oid, true)
  ) FROM pg_catalog.pg_constraint con
    WHERE con.conrelid IN (SELECT oid FROM relations)
       OR con.confrelid IN (SELECT oid FROM relations)
  UNION ALL
  SELECT '06_indexes', jsonb_build_object(
    'table', i.indrelid::regclass::text, 'index', i.indexrelid::regclass::text,
    'unique', i.indisunique, 'valid', i.indisvalid, 'ready', i.indisready,
    'definition', pg_get_indexdef(i.indexrelid)
  ) FROM pg_catalog.pg_index i WHERE i.indrelid IN (SELECT oid FROM relations)
  UNION ALL
  SELECT '07_triggers', jsonb_build_object(
    'table', t.tgrelid::regclass::text, 'name', t.tgname,
    'enabled', t.tgenabled, 'internal', t.tgisinternal,
    'function', t.tgfoid::regprocedure::text,
    'definition', pg_get_triggerdef(t.oid, true)
  ) FROM pg_catalog.pg_trigger t JOIN pg_catalog.pg_class c ON c.oid = t.tgrelid
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' OR (n.nspname = 'auth' AND c.relname = 'users')
  UNION ALL
  SELECT '08_routines', jsonb_build_object(
    'schema', p.schema_name, 'name', p.proname,
    'signature', p.oid::regprocedure::text,
    'arguments', pg_get_function_arguments(p.oid),
    'result', pg_get_function_result(p.oid),
    'owner', pg_get_userbyid(p.proowner), 'security_definer', p.prosecdef,
    'language', l.lanname, 'settings', p.proconfig,
    'acl', p.proacl, 'definition', pg_get_functiondef(p.oid)
  ) FROM routines p JOIN pg_catalog.pg_language l ON l.oid = p.prolang
  UNION ALL
  SELECT '09_policies', jsonb_build_object(
    'table', pol.polrelid::regclass::text, 'name', pol.polname,
    'command', pol.polcmd, 'permissive', pol.polpermissive,
    'roles', (SELECT jsonb_agg(CASE WHEN r = 0 THEN 'PUBLIC' ELSE pg_get_userbyid(r)::text END)
              FROM unnest(pol.polroles) r),
    'using', pg_get_expr(pol.polqual, pol.polrelid),
    'with_check', pg_get_expr(pol.polwithcheck, pol.polrelid)
  ) FROM pg_catalog.pg_policy pol WHERE pol.polrelid IN (SELECT oid FROM relations)
  UNION ALL
  SELECT '10_rules', jsonb_build_object(
    'table', r.ev_class::regclass::text, 'name', r.rulename,
    'definition', pg_get_ruledef(r.oid, true)
  ) FROM pg_catalog.pg_rewrite r WHERE r.ev_class IN (SELECT oid FROM relations)
  UNION ALL
  SELECT '11_role_flags', jsonb_build_object(
    'role', r.rolname, 'superuser', r.rolsuper, 'bypass_rls', r.rolbypassrls,
    'inherits', r.rolinherit, 'can_login', r.rolcanlogin
  ) FROM pg_catalog.pg_roles r
  UNION ALL
  SELECT '12_memberships', jsonb_build_object(
    'role', pg_get_userbyid(m.roleid), 'member', pg_get_userbyid(m.member),
    'admin_option', m.admin_option
  ) FROM pg_catalog.pg_auth_members m
  UNION ALL
  SELECT '13_effective_table_privileges', jsonb_build_object(
    'role', r.rolname, 'table', format('%I.%I', c.schema_name, c.relname),
    'privilege', v.privilege, 'allowed', has_table_privilege(r.oid, c.oid, v.privilege)
  ) FROM relations c CROSS JOIN pg_catalog.pg_roles r
    CROSS JOIN (VALUES ('SELECT'),('INSERT'),('UPDATE'),('DELETE'),('TRUNCATE'),('REFERENCES'),('TRIGGER')) v(privilege)
    WHERE r.rolname IN ('anon','authenticated','authenticator')
  UNION ALL
  SELECT '14_effective_column_privileges', jsonb_build_object(
    'role', r.rolname, 'table', format('%I.%I', c.schema_name, c.relname),
    'column', a.attname, 'privilege', v.privilege,
    'allowed', has_column_privilege(r.oid, c.oid, a.attnum, v.privilege)
  ) FROM relations c JOIN pg_catalog.pg_attribute a ON a.attrelid = c.oid
    CROSS JOIN pg_catalog.pg_roles r
    CROSS JOIN (VALUES ('SELECT'),('INSERT'),('UPDATE'),('REFERENCES')) v(privilege)
    WHERE a.attnum > 0 AND NOT a.attisdropped AND r.rolname IN ('anon','authenticated')
  UNION ALL
  SELECT '15_effective_execute', jsonb_build_object(
    'role', r.rolname, 'function', p.oid::regprocedure::text,
    'allowed', has_function_privilege(r.oid, p.oid, 'EXECUTE')
  ) FROM routines p CROSS JOIN pg_catalog.pg_roles r
    WHERE r.rolname IN ('anon','authenticated','authenticator')
  UNION ALL
  SELECT '16_default_acls', jsonb_build_object(
    'owner', pg_get_userbyid(d.defaclrole), 'schema', n.nspname,
    'object_kind', d.defaclobjtype, 'acl', d.defaclacl
  ) FROM pg_catalog.pg_default_acl d
    LEFT JOIN pg_catalog.pg_namespace n ON n.oid = d.defaclnamespace
  UNION ALL
  SELECT '17_enums_domains', jsonb_build_object(
    'schema', n.nspname, 'name', t.typname, 'kind', t.typtype,
    'base_type', CASE WHEN t.typtype = 'd' THEN format_type(t.typbasetype,t.typtypmod) END,
    'not_null', t.typnotnull, 'default', t.typdefault,
    'enum_labels', (SELECT jsonb_agg(e.enumlabel ORDER BY e.enumsortorder) FROM pg_catalog.pg_enum e WHERE e.enumtypid = t.oid),
    'domain_constraints', (SELECT jsonb_agg(pg_get_constraintdef(c.oid,true)) FROM pg_catalog.pg_constraint c WHERE c.contypid=t.oid)
  ) FROM pg_catalog.pg_type t JOIN pg_catalog.pg_namespace n ON n.oid=t.typnamespace
    WHERE n.nspname='public' AND t.typtype IN ('e','d')
  UNION ALL
  SELECT '18_other_schema_routine_inventory', jsonb_build_object(
    'schema', n.nspname, 'signature', p.oid::regprocedure::text,
    'security_definer', p.prosecdef
  ) FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname NOT LIKE 'pg_%' AND n.nspname NOT IN ('information_schema','public')
      AND p.prokind IN ('f','p')
  UNION ALL
  SELECT '19_inheritance', jsonb_build_object(
    'child', i.inhrelid::regclass::text, 'parent', i.inhparent::regclass::text
  ) FROM pg_catalog.pg_inherits i
    WHERE i.inhrelid IN (SELECT oid FROM relations) OR i.inhparent IN (SELECT oid FROM relations)
  UNION ALL
  SELECT '20_schema_privileges', jsonb_build_object(
    'schema', n.nspname, 'role', r.rolname,
    'usage', has_schema_privilege(r.oid,n.oid,'USAGE'),
    'create', has_schema_privilege(r.oid,n.oid,'CREATE')
  ) FROM pg_catalog.pg_namespace n CROSS JOIN pg_catalog.pg_roles r
    WHERE n.nspname NOT LIKE 'pg_%' AND n.nspname <> 'information_schema'
      AND r.rolname IN ('anon','authenticated','authenticator')
  UNION ALL
  SELECT '21_sequence_privileges', jsonb_build_object(
    'sequence', c.oid::regclass::text, 'role', r.rolname, 'acl', c.relacl,
    'usage', has_sequence_privilege(r.oid,c.oid,'USAGE'),
    'select', has_sequence_privilege(r.oid,c.oid,'SELECT'),
    'update', has_sequence_privilege(r.oid,c.oid,'UPDATE')
  ) FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
    CROSS JOIN pg_catalog.pg_roles r
    WHERE c.relkind='S' AND n.nspname='public' AND r.rolname IN ('anon','authenticated')
)
SELECT section, metadata, count(*) OVER () AS total_rows
FROM report ORDER BY section, metadata::text;

ROLLBACK;
