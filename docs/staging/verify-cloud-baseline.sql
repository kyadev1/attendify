-- READ ONLY. Run after baseline commit in the SAME manually verified staging project.
BEGIN TRANSACTION READ ONLY;
SET LOCAL search_path=public,pg_catalog;
SELECT c.relname,c.relrowsecurity,c.relforcerowsecurity,pg_get_userbyid(c.relowner) AS owner
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' AND c.relname IN ('profiles','events','registrations','attendance');
-- Four tables, RLS true, forced false, owner postgres.
SELECT 'profiles' AS relation,count(*) AS rows FROM public.profiles
UNION ALL SELECT 'events',count(*) FROM public.events
UNION ALL SELECT 'registrations',count(*) FROM public.registrations
UNION ALL SELECT 'attendance',count(*) FROM public.attendance;
-- All zero before synthetic account creation. No record contents are selected.
SELECT conrelid::regclass AS relation,conname,convalidated,pg_get_constraintdef(oid,true) AS definition
FROM pg_constraint WHERE conrelid IN ('public.profiles'::regclass,'public.events'::regclass,
 'public.registrations'::regclass,'public.attendance'::regclass) ORDER BY conname;
-- 19 constraints; inspect definitions, not just count.
SELECT indrelid::regclass AS relation,indexrelid::regclass AS index,indisvalid,pg_get_indexdef(indexrelid)
FROM pg_index WHERE indrelid IN ('public.profiles'::regclass,'public.events'::regclass,
 'public.registrations'::regclass,'public.attendance'::regclass);
-- Seven PK/unique indexes; constraints created these, no duplicate standalone indexes.
SELECT p.oid::regprocedure AS signature,p.prosecdef,p.proconfig,p.proacl,
 pg_get_userbyid(p.proowner) AS owner,pg_get_functiondef(p.oid) AS definition
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.proname IN ('handle_new_user','validate_event_capacity',
 'check_in_ticket','get_attendance_records','get_event_registration_counts','register_for_event');
-- Six; compare complete definitions to authoritative export (line endings may differ).
SELECT tgrelid::regclass AS relation,tgname,tgenabled,pg_get_triggerdef(oid,true)
FROM pg_trigger WHERE NOT tgisinternal AND tgname IN ('check_event_capacity','on_auth_user_created');
-- Two application triggers. Internal FK trigger counts depend on managed Auth schema too.
SELECT tablename,policyname,permissive,roles,cmd,qual,with_check
FROM pg_policies WHERE schemaname='public' AND tablename IN ('profiles','events','registrations','attendance');
-- Eight policies.
SELECT r.rolname,c.relname,v.privilege,has_table_privilege(r.oid,c.oid,v.privilege) AS allowed
FROM pg_roles r CROSS JOIN pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
CROSS JOIN (VALUES ('SELECT'),('INSERT'),('UPDATE'),('DELETE'),('TRUNCATE'),('TRIGGER'),('REFERENCES'),('MAINTAIN')) v(privilege)
WHERE r.rolname IN ('anon','authenticated') AND n.nspname='public'
AND c.relname IN ('profiles','events','registrations','attendance');
-- Legacy parity: TRUNCATE true is a KNOWN RISK, not a security PASS.
SELECT a.attname,has_column_privilege('authenticated','public.profiles',a.attname,'UPDATE') AS update_allowed
FROM pg_attribute a WHERE a.attrelid='public.profiles'::regclass AND a.attnum>0 AND NOT a.attisdropped;
-- Only full_name true.
SELECT to_regnamespace('attendify_private') AS candidate_schema,
 to_regclass('public.event_registration_forms') AS forms,
 to_regclass('public.registration_form_versions') AS versions,
 to_regclass('public.registration_answer_sets') AS answers;
-- All NULL. Baseline does not install or activate custom forms.
ROLLBACK;
