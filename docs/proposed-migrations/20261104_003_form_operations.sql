-- REVIEW DRAFT. No deployment/activation authorized. Execute after 002 only.
BEGIN;
DO $$ BEGIN
 IF current_user <> 'postgres' THEN RAISE EXCEPTION 'Run reviewed staging migrations as postgres.'; END IF;
END $$;
CREATE TABLE attendify_private.form_release(singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton), enabled boolean NOT NULL DEFAULT false);
INSERT INTO attendify_private.form_release(singleton,enabled) VALUES(true,false);
REVOKE ALL ON attendify_private.form_release FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION attendify_private.require_owner(e uuid) RETURNS void
LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF auth.uid() IS NULL OR NOT EXISTS(SELECT 1 FROM public.events ev JOIN public.profiles p ON p.id=auth.uid()
  WHERE ev.id=e AND ev.organizer_id=auth.uid() AND p.role='organizer')
 THEN RAISE EXCEPTION 'Event unavailable.' USING ERRCODE='42501'; END IF;
END $$;
CREATE FUNCTION attendify_private.require_student() RETURNS void
LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF auth.uid() IS NULL OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=auth.uid() AND role='student')
 THEN RAISE EXCEPTION 'Student access required.' USING ERRCODE='42501'; END IF;
END $$;

CREATE FUNCTION public.save_registration_form_draft(p_event_id uuid,p_expected_revision bigint,p_definition jsonb)
RETURNS public.event_registration_forms LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE f public.event_registration_forms;
BEGIN
 PERFORM attendify_private.require_owner(p_event_id);
 PERFORM 1 FROM public.events WHERE id=p_event_id FOR UPDATE;
 PERFORM attendify_private.require_owner(p_event_id);
 PERFORM attendify_private.assert_definition(p_definition);
 INSERT INTO public.event_registration_forms(event_id) VALUES(p_event_id) ON CONFLICT DO NOTHING;
 SELECT * INTO STRICT f FROM public.event_registration_forms WHERE event_id=p_event_id;
 IF p_expected_revision IS DISTINCT FROM f.draft_revision THEN RAISE EXCEPTION 'Draft changed. Reload before saving.' USING ERRCODE='40001'; END IF;
 UPDATE public.event_registration_forms SET draft=p_definition,draft_revision=draft_revision+1,updated_at=now()
 WHERE event_id=p_event_id RETURNING * INTO f;
 RETURN f;
END $$;

CREATE FUNCTION public.get_registration_form_draft(p_event_id uuid) RETURNS public.event_registration_forms
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE f public.event_registration_forms;
BEGIN
 PERFORM attendify_private.require_owner(p_event_id);
 SELECT * INTO f FROM public.event_registration_forms WHERE event_id=p_event_id;
 RETURN f;
END $$;

CREATE FUNCTION public.publish_registration_form(p_event_id uuid,p_expected_revision bigint,p_expected_active uuid)
RETURNS public.registration_form_versions LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE f public.event_registration_forms; v public.registration_form_versions; release_enabled boolean;
BEGIN
 PERFORM attendify_private.require_owner(p_event_id);
 SELECT enabled INTO release_enabled FROM attendify_private.form_release WHERE singleton FOR SHARE;
 IF release_enabled IS DISTINCT FROM true THEN RAISE EXCEPTION 'Form publication is disabled.' USING ERRCODE='55000'; END IF;
 PERFORM 1 FROM public.events WHERE id=p_event_id FOR UPDATE;
 PERFORM attendify_private.require_owner(p_event_id);
 SELECT * INTO f FROM public.event_registration_forms WHERE event_id=p_event_id;
 IF NOT FOUND OR p_expected_revision IS DISTINCT FROM f.draft_revision OR p_expected_active IS DISTINCT FROM f.active_version_id
 THEN RAISE EXCEPTION 'Form changed. Reload before publishing.' USING ERRCODE='40001'; END IF;
 INSERT INTO public.registration_form_versions(event_id,revision,definition)
 SELECT p_event_id,coalesce(max(revision),0)+1,f.draft FROM public.registration_form_versions WHERE event_id=p_event_id
 RETURNING * INTO v;
 UPDATE public.event_registration_forms SET active_version_id=v.id,updated_at=now() WHERE event_id=p_event_id;
 RETURN v;
END $$;

CREATE FUNCTION public.get_registration_form(p_event_id uuid) RETURNS public.registration_form_versions
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v public.registration_form_versions;
BEGIN
 IF auth.uid() IS NULL OR NOT EXISTS(SELECT 1 FROM public.events e JOIN public.profiles p ON p.id=auth.uid()
  WHERE e.id=p_event_id AND ((p.role='student' AND e.status='published') OR (p.role='organizer' AND e.organizer_id=auth.uid())))
 THEN RAISE EXCEPTION 'Event unavailable.' USING ERRCODE='42501'; END IF;
 SELECT v1.* INTO v FROM public.registration_form_versions v1 JOIN public.event_registration_forms f
 ON f.active_version_id=v1.id AND f.event_id=v1.event_id WHERE f.event_id=p_event_id;
 RETURN v;
END $$;

CREATE FUNCTION public.get_registration_answers(p_registration_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE result jsonb;
BEGIN
 IF auth.uid() IS NULL OR NOT EXISTS(SELECT 1 FROM public.registrations r JOIN public.events e ON e.id=r.event_id
 JOIN public.profiles p ON p.id=auth.uid() WHERE r.id=p_registration_id AND
 ((p.role='student' AND r.student_id=auth.uid()) OR (p.role='organizer' AND e.organizer_id=auth.uid())))
 THEN RAISE EXCEPTION 'Registration unavailable.' USING ERRCODE='42501'; END IF;
 SELECT jsonb_build_object('versionId',v.id,'definition',v.definition,'answers',a.answers,'submittedAt',a.submitted_at)
 INTO result FROM public.registration_answer_sets a JOIN public.registration_form_versions v ON v.id=a.version_id
 WHERE a.registration_id=p_registration_id;
 RETURN result;
END $$;

REVOKE ALL ON ALL FUNCTIONS IN SCHEMA attendify_private FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.save_registration_form_draft(uuid,bigint,jsonb),public.get_registration_form_draft(uuid),
 public.publish_registration_form(uuid,bigint,uuid),public.get_registration_form(uuid),public.get_registration_answers(uuid)
 FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.save_registration_form_draft(uuid,bigint,jsonb),public.get_registration_form_draft(uuid),
 public.publish_registration_form(uuid,bigint,uuid),public.get_registration_form(uuid),public.get_registration_answers(uuid) TO authenticated;
COMMIT;

