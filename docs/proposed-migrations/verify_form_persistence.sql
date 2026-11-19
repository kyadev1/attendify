-- READ ONLY. Execute only AFTER separately approved staging installation.
BEGIN TRANSACTION READ ONLY;
SELECT c.relname,c.relrowsecurity,pg_get_userbyid(c.relowner) AS owner,c.relacl
FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' AND c.relname IN ('event_registration_forms','registration_form_versions','registration_answer_sets');
SELECT r.rolname,c.relname,p.privilege,has_table_privilege(r.oid,c.oid,p.privilege) AS allowed
FROM pg_catalog.pg_roles r CROSS JOIN pg_catalog.pg_class c
JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
CROSS JOIN (VALUES ('SELECT'),('INSERT'),('UPDATE'),('DELETE'),('TRUNCATE'),('REFERENCES'),('TRIGGER'),('MAINTAIN')) p(privilege)
WHERE r.rolname IN ('anon','authenticated') AND n.nspname='public'
 AND c.relname IN ('event_registration_forms','registration_form_versions','registration_answer_sets');
-- Expect all allowed=false; reads/writes must pass through scoped RPCs.
SELECT p.oid::regprocedure,p.prosecdef,p.proconfig,pg_get_userbyid(p.proowner) AS owner,p.proacl
FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='attendify_private' OR (n.nspname='public' AND p.proname IN
 ('register_for_event','register_for_event_with_answers','save_registration_form_draft',
 'get_registration_form_draft','publish_registration_form','get_registration_form','get_registration_answers'));
SELECT r.rolname,p.oid::regprocedure,has_function_privilege(r.oid,p.oid,'EXECUTE') AS allowed
FROM pg_catalog.pg_roles r CROSS JOIN pg_catalog.pg_proc p
JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='attendify_private' AND r.rolname IN ('anon','authenticated');
-- Expect all allowed=false, regardless of private schema not being exposed.
SELECT enabled FROM attendify_private.form_release; -- expect false pre-activation
SELECT conname,pg_get_constraintdef(oid) FROM pg_catalog.pg_constraint
WHERE conrelid IN ('public.registration_answer_sets'::regclass,'public.event_registration_forms'::regclass);
SELECT tgname,tgenabled,pg_get_triggerdef(oid) FROM pg_catalog.pg_trigger
WHERE NOT tgisinternal AND tgrelid IN ('public.events'::regclass,'public.registration_form_versions'::regclass,'public.registration_answer_sets'::regclass);
ROLLBACK;
