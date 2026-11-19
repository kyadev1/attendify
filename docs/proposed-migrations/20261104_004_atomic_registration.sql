-- REVIEW DRAFT. Baseline registration body copied from authoritative CSV.
-- Private helper retains deployed capacity, duplicate and error behavior.
BEGIN;
DO $$ BEGIN
 IF current_user <> 'postgres' THEN RAISE EXCEPTION 'Run reviewed staging migrations as postgres.'; END IF;
END $$;
CREATE OR REPLACE FUNCTION attendify_private.register_legacy(p_event_id uuid)
 RETURNS public.registrations
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_user_id uuid := auth.uid();
  v_event public.events%rowtype;
  v_count integer;
  v_registration public.registrations%rowtype;
begin
  if v_user_id is null then
    raise exception 'You must be logged in.';
  end if;

  if not exists (
    select 1
    from public.profiles
    where id = v_user_id
      and role = 'student'
  ) then
    raise exception 'Student access required.';
  end if;

  -- Lock event row to serialize registrations
  -- and prevent simultaneous overbooking.
  select *
  into v_event
  from public.events
  where id = p_event_id
  for update;

  if not found then
    raise exception 'Event not found.';
  end if;

  if v_event.status <> 'published'
     or v_event.ends_at <= now() then
    raise exception 'Registration is closed.';
  end if;

  if exists (
    select 1
    from public.registrations
    where event_id = p_event_id
      and student_id = v_user_id
  ) then
    raise exception 'You are already registered.';
  end if;

  select count(*)
  into v_count
  from public.registrations
  where event_id = p_event_id
    and status = 'registered';

  if v_count >= v_event.capacity then
    raise exception 'This event is full.';
  end if;

  insert into public.registrations (
    event_id,
    student_id,
    status
  )
  values (
    p_event_id,
    v_user_id,
    'registered'
  )
  returning * into v_registration;

  return v_registration;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.register_for_event(p_event_id uuid) RETURNS public.registrations
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 PERFORM attendify_private.require_student();
 PERFORM 1 FROM public.events WHERE id=p_event_id FOR UPDATE;
 -- Never conditional on release flag: disabling the UI must not enable bypass.
 IF EXISTS(SELECT 1 FROM public.event_registration_forms f WHERE f.event_id=p_event_id AND f.active_version_id IS NOT NULL)
 THEN RAISE EXCEPTION 'Use the event registration form.' USING ERRCODE='22023'; END IF;
 RETURN attendify_private.register_legacy(p_event_id);
END $$;

CREATE FUNCTION public.register_for_event_with_answers(p_event_id uuid,p_version_id uuid,p_answers jsonb)
RETURNS public.registrations LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v public.registration_form_versions; b public.registrations; release_enabled boolean;
BEGIN
 PERFORM attendify_private.require_student();
 SELECT enabled INTO release_enabled FROM attendify_private.form_release WHERE singleton FOR SHARE;
 IF release_enabled IS DISTINCT FROM true THEN RAISE EXCEPTION 'Form submissions are disabled.' USING ERRCODE='55000'; END IF;
 PERFORM 1 FROM public.events WHERE id=p_event_id FOR UPDATE;
 SELECT v1.* INTO v FROM public.registration_form_versions v1 JOIN public.event_registration_forms f
 ON f.active_version_id=v1.id AND f.event_id=v1.event_id WHERE f.event_id=p_event_id;
 IF v.id IS NULL OR p_version_id IS DISTINCT FROM v.id THEN RAISE EXCEPTION 'Form changed. Reload before registering.' USING ERRCODE='40001'; END IF;
 PERFORM attendify_private.assert_answers(v.definition,p_answers);
 -- Both inserts execute in this transaction; an answer failure rolls back booking.
 b:=attendify_private.register_legacy(p_event_id);
 INSERT INTO public.registration_answer_sets(registration_id,event_id,version_id,answers)
 VALUES(b.id,p_event_id,v.id,p_answers);
 RETURN b;
END $$;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA attendify_private FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.register_for_event_with_answers(uuid,uuid,jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.register_for_event_with_answers(uuid,uuid,jsonb) TO authenticated;
-- Preserve legacy service_role grant; ordinary requests remain caller-scoped.
REVOKE ALL ON FUNCTION public.register_for_event(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.register_for_event(uuid) TO authenticated,service_role;
COMMIT;

