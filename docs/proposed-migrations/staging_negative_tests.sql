-- STAGING ONLY: MUTATING TESTS, NEVER RUN AGAINST LIVE SUPABASE.
-- Not executed by this task. Requires psql, migrations 001-005, postgres owner,
-- existing synthetic profiles student_a, student_b, organizer_a, organizer_b.
-- psql -X -v ON_ERROR_STOP=1 -v staging_ack=DISPOSABLE 
--   -v student_a=<uuid> -v student_b=<uuid> -v organizer_a=<uuid>
--   -v organizer_b=<uuid> -f staging_negative_tests.sql <staging connection>
-- No credentials belong in this file or reports.
\set ON_ERROR_STOP on
\if :{?staging_ack}
 SELECT :'staging_ack' = 'DISPOSABLE' AS acknowledged \gset
\else
 \echo 'Missing staging acknowledgement'
 \quit
\endif
\if :acknowledged
\else
 \echo 'Refusing non-staging invocation'
 \quit
\endif
BEGIN;
SELECT set_config('test.student_a', :'student_a', true),set_config('test.student_b', :'student_b', true),
 set_config('test.organizer_a', :'organizer_a', true),set_config('test.organizer_b', :'organizer_b', true);
DO $$ BEGIN
 IF (SELECT count(DISTINCT x) FROM unnest(ARRAY[current_setting('test.student_a'),current_setting('test.student_b'),current_setting('test.organizer_a'),current_setting('test.organizer_b')]) x)<>4
 THEN RAISE EXCEPTION 'Distinct fixtures required'; END IF;
 IF (SELECT count(*) FROM public.profiles WHERE id IN (current_setting('test.student_a')::uuid,current_setting('test.student_b')::uuid) AND role='student')<>2
 OR (SELECT count(*) FROM public.profiles WHERE id IN (current_setting('test.organizer_a')::uuid,current_setting('test.organizer_b')::uuid) AND role='organizer')<>2
 THEN RAISE EXCEPTION 'Wrong fixture roles'; END IF;
END $$;
INSERT INTO public.events(organizer_id,title,category,description,venue,starts_at,ends_at,capacity,status)
VALUES(:'organizer_a','Isolated form test','Technology','','Test',now()+interval '1 day',now()+interval '2 days',2,'published')
RETURNING id AS event_id \gset
SELECT set_config('test.event', :'event_id', true);
UPDATE attendify_private.form_release SET enabled=true WHERE singleton;
CREATE FUNCTION pg_temp.expect_error(statement text, expected text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE caught boolean:=false;
BEGIN
 BEGIN EXECUTE statement; EXCEPTION WHEN OTHERS THEN
  IF SQLSTATE<>expected THEN RAISE; END IF; caught:=true;
 END;
 IF NOT caught THEN RAISE EXCEPTION 'Expected SQLSTATE %, operation succeeded',expected; END IF;
END $$;
GRANT EXECUTE ON FUNCTION pg_temp.expect_error(text,text) TO authenticated,anon;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub',current_setting('test.organizer_a'),true);
SELECT public.save_registration_form_draft(current_setting('test.event')::uuid,0,
 '{"schemaVersion":1,"questions":[{"id":"q1","title":"Program","type":"short","required":true,"choices":[]}]}');
SELECT public.publish_registration_form(current_setting('test.event')::uuid,1,NULL);
SELECT set_config('test.version',(public.get_registration_form(current_setting('test.event')::uuid)).id::text,true);
-- Wrong owner and student draft access.
SELECT set_config('request.jwt.claim.sub',current_setting('test.organizer_b'),true);
SELECT pg_temp.expect_error(format('SELECT public.get_registration_form_draft(%L::uuid)',current_setting('test.event')),'42501');
SELECT pg_temp.expect_error(format('SELECT public.publish_registration_form(%L::uuid,1,NULL)',current_setting('test.event')),'42501');
SELECT set_config('request.jwt.claim.sub',current_setting('test.student_a'),true);
SELECT pg_temp.expect_error(format('SELECT public.get_registration_form_draft(%L::uuid)',current_setting('test.event')),'42501');
SELECT pg_temp.expect_error(format('SELECT public.register_for_event(%L::uuid)',current_setting('test.event')),'22023');
SELECT pg_temp.expect_error(format('SELECT public.register_for_event_with_answers(%L::uuid,%L::uuid,''{}'')',current_setting('test.event'),current_setting('test.version')),'22023');
SELECT pg_temp.expect_error(format('SELECT public.register_for_event_with_answers(%L::uuid,%L::uuid,%L::jsonb)',current_setting('test.event'),current_setting('test.version'),jsonb_build_object('q1',E'\t\n')::text),'22023');
SELECT pg_temp.expect_error(format('INSERT INTO public.registrations(event_id,student_id) VALUES(%L::uuid,%L::uuid)',current_setting('test.event'),current_setting('test.student_a')),'42501');
SELECT pg_temp.expect_error('UPDATE public.registration_form_versions SET definition=''{}''','42501');
SELECT pg_temp.expect_error('SELECT * FROM public.registration_answer_sets','42501');
SELECT pg_temp.expect_error(format('SELECT public.register_for_event_with_answers(%L::uuid,NULL,''{"q1":"CS"}'')',current_setting('test.event')),'40001');
SELECT public.register_for_event_with_answers(current_setting('test.event')::uuid,current_setting('test.version')::uuid,'{"q1":"CS"}');
SELECT set_config('test.booking',(SELECT id::text FROM public.registrations WHERE event_id=current_setting('test.event')::uuid),true);
SELECT public.get_registration_answers(current_setting('test.booking')::uuid);
SELECT pg_temp.expect_error(format('SELECT public.register_for_event_with_answers(%L::uuid,%L::uuid,''{"q1":"CS"}'')',current_setting('test.event'),current_setting('test.version')),'P0001');
SELECT set_config('request.jwt.claim.sub',current_setting('test.student_b'),true);
SELECT pg_temp.expect_error(format('SELECT public.get_registration_answers(%L::uuid)',current_setting('test.booking')),'42501');
SELECT public.register_for_event_with_answers(current_setting('test.event')::uuid,current_setting('test.version')::uuid,'{"q1":"IT"}');
SELECT set_config('request.jwt.claim.sub',current_setting('test.organizer_b'),true);
SELECT pg_temp.expect_error(format('SELECT public.get_registration_answers(%L::uuid)',current_setting('test.booking')),'42501');
SELECT set_config('request.jwt.claim.sub',current_setting('test.organizer_a'),true);
SELECT public.get_registration_answers(current_setting('test.booking')::uuid);
SELECT pg_temp.expect_error(format('UPDATE public.events SET capacity=1 WHERE id=%L::uuid',current_setting('test.event')),'P0001');
SELECT * FROM public.check_in_ticket(current_setting('test.booking')::uuid,current_setting('test.event')::uuid,current_setting('test.student_a')::uuid);
SELECT pg_temp.expect_error(format('SELECT public.check_in_ticket(%L::uuid,%L::uuid,%L::uuid)',current_setting('test.booking'),current_setting('test.event'),current_setting('test.student_a')),'P0001');
SELECT pg_temp.expect_error(format('DELETE FROM public.events WHERE id=%L::uuid',current_setting('test.event')),'P0001');
-- RLS may instead filter out DELETE after future policy changes: adapt assertion then.
SET LOCAL ROLE anon;
SELECT pg_temp.expect_error(format('SELECT public.get_registration_form(%L::uuid)',current_setting('test.event')),'42501');
RESET ROLE;
DO $$ BEGIN
 IF (SELECT count(*) FROM public.registrations WHERE event_id=current_setting('test.event')::uuid)<>2
 OR (SELECT count(*) FROM public.registration_answer_sets WHERE event_id=current_setting('test.event')::uuid)<>2
 THEN RAISE EXCEPTION 'Atomicity/count failure'; END IF;
END $$;
-- Missing release configuration must fail closed, not bypass the disabled state.
DELETE FROM attendify_private.form_release;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub',current_setting('test.organizer_a'),true);
SELECT pg_temp.expect_error(format('SELECT public.publish_registration_form(%L::uuid,1,%L::uuid)',current_setting('test.event'),current_setting('test.version')),'55000');
SELECT set_config('request.jwt.claim.sub',current_setting('test.student_a'),true);
SELECT pg_temp.expect_error(format('SELECT public.register_for_event_with_answers(%L::uuid,%L::uuid,''{"q1":"CS"}'')',current_setting('test.event'),current_setting('test.version')),'55000');
RESET ROLE;
ROLLBACK;
\echo 'Staging assertions completed; fixture transaction rolled back'
