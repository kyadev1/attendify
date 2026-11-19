-- READ ONLY; does not verify that the host is staging. Operator must verify endpoint.
BEGIN TRANSACTION READ ONLY;
SELECT current_database(),current_user,current_setting('server_version'),
 current_setting('server_encoding'),current_setting('transaction_isolation'),
 current_setting('check_function_bodies');
-- Require PG17, UTF8, postgres, read committed and check_function_bodies=on.
SELECT n.nspname,c.relname,c.relrowsecurity,pg_get_userbyid(c.relowner) AS owner
FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' AND c.relname IN ('profiles','events','registrations','attendance');
SELECT p.oid::regprocedure,pg_get_userbyid(p.proowner) AS owner,p.prosecdef,p.proconfig,p.proacl,
 pg_get_functiondef(p.oid) AS definition
FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.proname IN ('register_for_event','validate_event_capacity','check_in_ticket','get_attendance_records','get_event_registration_counts','handle_new_user');
-- Compare all six with the authoritative snapshot; stop on unexplained drift.
SELECT to_regnamespace('attendify_private') AS private_schema,
 to_regclass('public.event_registration_forms') AS forms,
 to_regclass('public.registration_form_versions') AS versions,
 to_regclass('public.registration_answer_sets') AS answers;
-- All NULL on clean installation. Do not rerun partial installs blindly.
SELECT conname,pg_get_constraintdef(oid) FROM pg_catalog.pg_constraint
WHERE conrelid='public.registrations'::regclass OR conrelid='public.attendance'::regclass;
ROLLBACK;
