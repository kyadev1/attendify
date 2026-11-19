-- REVIEW DRAFT ONLY. Not executed. PostgreSQL 17 (snapshot: 17.11).
-- Apply in separately authorized staging first; inspect dependency failures.
-- No CRUD, RLS, RPC or data changes. No blanket default-ACL changes.
BEGIN;
DO $$ BEGIN
 IF current_user <> 'postgres' THEN RAISE EXCEPTION 'Run reviewed staging migrations as postgres.'; END IF;
END $$;
REVOKE TRUNCATE, REFERENCES, TRIGGER, MAINTAIN
ON TABLE public.events, public.profiles, public.registrations, public.attendance
FROM PUBLIC, anon, authenticated;
-- Verify effective rights afterwards: inherited grants can remain effective.
COMMIT;

