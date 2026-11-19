-- READ ONLY. Run only after manually verifying the staging project in Dashboard.
BEGIN TRANSACTION READ ONLY;
SELECT current_database(), current_user, current_setting('server_version') AS postgres_version,
 current_setting('server_encoding') AS encoding,
 current_setting('check_function_bodies') AS check_function_bodies;
-- Require postgres / PG17 / UTF8 / on. Database name 'postgres' does NOT identify project.
SELECT rolname,rolsuper,rolbypassrls FROM pg_catalog.pg_roles
WHERE rolname IN ('postgres','anon','authenticated','service_role');
SELECT to_regclass('auth.users') AS auth_users,to_regprocedure('auth.uid()') AS auth_uid;
SELECT c.relname,c.relkind FROM pg_catalog.pg_class c
JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' AND c.relname IN ('profiles','events','registrations','attendance');
-- Expect zero rows, not merely zero records inside existing tables.
SELECT p.oid::regprocedure FROM pg_catalog.pg_proc p
JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.proname IN ('handle_new_user','validate_event_capacity',
 'check_in_ticket','get_attendance_records','get_event_registration_counts','register_for_event');
-- Expect zero rows. Existing routines may indicate an unexpected target or partial setup.
SELECT tgname,pg_get_triggerdef(oid) FROM pg_catalog.pg_trigger
WHERE tgrelid=to_regclass('auth.users') AND NOT tgisinternal;
-- Review any existing Auth application trigger before baseline; do not drop it.
ROLLBACK;
