-- REVIEW DRAFT; NOT EXECUTED. Run only in an approved disposable PG17 staging DB.
-- Proposed design refinement: one validated JSONB snapshot per immutable version,
-- not both normalized questions and duplicate JSON. Requires design approval.
BEGIN;
DO $$ BEGIN
 IF current_user <> 'postgres' THEN RAISE EXCEPTION 'Draft requires reviewed postgres ownership in staging.'; END IF;
END $$;
CREATE SCHEMA attendify_private AUTHORIZATION postgres;
REVOKE ALL ON SCHEMA attendify_private FROM PUBLIC, anon, authenticated, service_role;

-- ECMAScript trim whitespace, including NBSP/BOM; avoids required whitespace-only answers.
CREATE FUNCTION attendify_private.trim_text(t text) RETURNS text
LANGUAGE sql IMMUTABLE STRICT SET search_path='' AS $$
 SELECT btrim(t, U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF');
$$;

CREATE FUNCTION attendify_private.assert_definition(d jsonb) RETURNS void
LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE q jsonb; c jsonb; ids text[] := '{}'; cids text[]; labels text[]; label text;
BEGIN
 -- Separate the type check: SQL boolean expressions do not promise short-circuit evaluation.
 IF d IS NULL OR jsonb_typeof(d) <> 'object' THEN
  RAISE EXCEPTION 'Invalid form definition.' USING ERRCODE='22023';
 END IF;
 IF octet_length(d::text)>65536
    OR d->'schemaVersion' IS DISTINCT FROM '1'::jsonb
    OR jsonb_typeof(d->'questions') IS DISTINCT FROM 'array'
    OR EXISTS(SELECT 1 FROM jsonb_object_keys(d) k WHERE k NOT IN ('schemaVersion','questions'))
 THEN RAISE EXCEPTION 'Invalid form definition.' USING ERRCODE='22023'; END IF;
 IF jsonb_array_length(d->'questions')>20 THEN RAISE EXCEPTION 'Too many questions.' USING ERRCODE='22023'; END IF;
 FOR q IN SELECT value FROM jsonb_array_elements(d->'questions') LOOP
  IF jsonb_typeof(q)<>'object' THEN RAISE EXCEPTION 'Invalid question.' USING ERRCODE='22023'; END IF;
  IF EXISTS(SELECT 1 FROM jsonb_object_keys(q) k WHERE k NOT IN ('id','title','type','required','choices'))
    OR jsonb_typeof(q->'id') IS DISTINCT FROM 'string' OR length(attendify_private.trim_text(q->>'id'))=0 OR length(q->>'id') NOT BETWEEN 1 AND 100
    OR q->>'id' IN ('__proto__','constructor','prototype') OR q->>'id'=ANY(ids)
    OR jsonb_typeof(q->'title') IS DISTINCT FROM 'string' OR length(attendify_private.trim_text(q->>'title'))=0 OR length(q->>'title')>200
    OR coalesce(q->>'type','') NOT IN ('short','paragraph','dropdown','radio','checkbox')
    OR jsonb_typeof(q->'required') IS DISTINCT FROM 'boolean'
    OR jsonb_typeof(q->'choices') IS DISTINCT FROM 'array'
  THEN RAISE EXCEPTION 'Invalid question.' USING ERRCODE='22023'; END IF;
  ids:=array_append(ids,q->>'id'); cids:='{}'; labels:='{}';
  IF (q->>'type' IN ('short','paragraph') AND jsonb_array_length(q->'choices')<>0)
    OR (q->>'type' IN ('dropdown','radio','checkbox') AND jsonb_array_length(q->'choices') NOT BETWEEN 2 AND 20)
  THEN RAISE EXCEPTION 'Invalid choices.' USING ERRCODE='22023'; END IF;
  FOR c IN SELECT value FROM jsonb_array_elements(q->'choices') LOOP
   IF jsonb_typeof(c)<>'object' THEN RAISE EXCEPTION 'Invalid choice.' USING ERRCODE='22023'; END IF;
   IF EXISTS(SELECT 1 FROM jsonb_object_keys(c) k WHERE k NOT IN ('id','label'))
      OR jsonb_typeof(c->'id') IS DISTINCT FROM 'string' OR length(attendify_private.trim_text(c->>'id'))=0 OR length(c->>'id') NOT BETWEEN 1 AND 100
      OR c->>'id' IN ('__proto__','constructor','prototype') OR c->>'id'=ANY(cids)
      OR jsonb_typeof(c->'label') IS DISTINCT FROM 'string' OR length(attendify_private.trim_text(c->>'label'))=0 OR length(c->>'label')>100
   THEN RAISE EXCEPTION 'Invalid choice.' USING ERRCODE='22023'; END IF;
   label:=lower(normalize(attendify_private.trim_text(c->>'label'), NFKC));
   IF label=ANY(labels) THEN RAISE EXCEPTION 'Duplicate choice label.' USING ERRCODE='22023'; END IF;
   labels:=array_append(labels,label); cids:=array_append(cids,c->>'id');
  END LOOP;
 END LOOP;
END $$;

CREATE FUNCTION attendify_private.assert_answers(d jsonb,a jsonb) RETURNS void
LANGUAGE plpgsql SET search_path='' AS $$
DECLARE q jsonb; v jsonb; item jsonb; seen text[]; blank boolean;
BEGIN
 PERFORM attendify_private.assert_definition(d);
 IF a IS NULL OR jsonb_typeof(a)<>'object' OR octet_length(a::text)>65536
 THEN RAISE EXCEPTION 'Invalid answers.' USING ERRCODE='22023'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_object_keys(a) AS keys(question_key) WHERE NOT EXISTS(
   SELECT 1 FROM jsonb_array_elements(d->'questions') AS questions(definition)
   WHERE questions.definition->>'id'=keys.question_key))
 THEN RAISE EXCEPTION 'Unknown question.' USING ERRCODE='22023'; END IF;
 FOR q IN SELECT value FROM jsonb_array_elements(d->'questions') LOOP
  v:=a->(q->>'id');
  blank:=v IS NULL OR (jsonb_typeof(v)='string' AND attendify_private.trim_text(v#>>'{}')='') OR v='[]'::jsonb;
  IF blank THEN
   IF (q->>'required')::boolean THEN RAISE EXCEPTION 'Required answer missing.' USING ERRCODE='22023'; END IF;
   IF v IS NULL THEN CONTINUE; END IF;
  END IF;
  IF q->>'type' IN ('short','paragraph') THEN
   IF jsonb_typeof(v)<>'string' OR length(v#>>'{}')>CASE WHEN q->>'type'='short' THEN 250 ELSE 2000 END
   THEN RAISE EXCEPTION 'Invalid text answer.' USING ERRCODE='22023'; END IF;
  ELSIF q->>'type'='checkbox' THEN
   IF jsonb_typeof(v)<>'array' THEN RAISE EXCEPTION 'Invalid choices.' USING ERRCODE='22023'; END IF;
   IF jsonb_array_length(v)>20 THEN RAISE EXCEPTION 'Too many choices.' USING ERRCODE='22023'; END IF;
   seen:='{}';
   FOR item IN SELECT value FROM jsonb_array_elements(v) LOOP
    IF jsonb_typeof(item)<>'string' OR item#>>'{}'=ANY(seen) OR NOT EXISTS(
      SELECT 1 FROM jsonb_array_elements(q->'choices') c WHERE c->>'id'=item#>>'{}')
    THEN RAISE EXCEPTION 'Invalid selection.' USING ERRCODE='22023'; END IF;
    seen:=array_append(seen,item#>>'{}');
   END LOOP;
  ELSE
   IF jsonb_typeof(v)<>'string' OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(q->'choices') c WHERE c->>'id'=v#>>'{}')
   THEN RAISE EXCEPTION 'Invalid selection.' USING ERRCODE='22023'; END IF;
  END IF;
 END LOOP;
END $$;

CREATE TABLE public.event_registration_forms (
 event_id uuid PRIMARY KEY REFERENCES public.events(id) ON DELETE CASCADE,
 draft jsonb NOT NULL DEFAULT '{"schemaVersion":1,"questions":[]}',
 draft_revision bigint NOT NULL DEFAULT 0 CHECK(draft_revision>=0),
 active_version_id uuid,
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.registration_form_versions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
 revision bigint NOT NULL CHECK(revision>0),
 definition jsonb NOT NULL,
 published_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(event_id,revision), UNIQUE(event_id,id)
);
ALTER TABLE public.event_registration_forms ADD CONSTRAINT form_active_version_event_fk
 FOREIGN KEY(event_id,active_version_id) REFERENCES public.registration_form_versions(event_id,id);
CREATE TABLE public.registration_answer_sets (
 registration_id uuid PRIMARY KEY,
 event_id uuid NOT NULL,
 version_id uuid NOT NULL,
 answers jsonb NOT NULL,
 submitted_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(registration_id,event_id) REFERENCES public.registrations(id,event_id),
 FOREIGN KEY(event_id,version_id) REFERENCES public.registration_form_versions(event_id,id)
);
CREATE INDEX registration_answer_sets_event_idx ON public.registration_answer_sets(event_id);
CREATE INDEX registration_answer_sets_version_idx ON public.registration_answer_sets(version_id);
ALTER TABLE public.event_registration_forms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.registration_form_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.registration_answer_sets ENABLE ROW LEVEL SECURITY;
-- RPC-only access: no policies granting direct access, including drafts/answers.
REVOKE ALL ON public.event_registration_forms,public.registration_form_versions,public.registration_answer_sets
 FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION attendify_private.guard_form_rows() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE d jsonb;
BEGIN
 IF TG_TABLE_NAME='registration_form_versions' THEN
  -- Permit parent-event cascade only; direct version deletion remains forbidden.
  -- Answer FKs still prevent removal of a submitted version.
  IF TG_OP='DELETE' AND NOT EXISTS(SELECT 1 FROM public.events WHERE id=OLD.event_id) THEN RETURN OLD; END IF;
  IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'Published versions are immutable.'; END IF;
  PERFORM attendify_private.assert_definition(NEW.definition);
 ELSIF TG_TABLE_NAME='registration_answer_sets' THEN
  IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'Submitted answers are immutable.'; END IF;
  SELECT definition INTO STRICT d FROM public.registration_form_versions WHERE id=NEW.version_id AND event_id=NEW.event_id;
  PERFORM attendify_private.assert_answers(d,NEW.answers);
 ELSE
  PERFORM attendify_private.assert_definition(NEW.draft);
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER validate_form_draft BEFORE INSERT OR UPDATE ON public.event_registration_forms
 FOR EACH ROW EXECUTE FUNCTION attendify_private.guard_form_rows();
CREATE TRIGGER immutable_form_version BEFORE INSERT OR UPDATE OR DELETE ON public.registration_form_versions
 FOR EACH ROW EXECUTE FUNCTION attendify_private.guard_form_rows();
CREATE TRIGGER immutable_answers BEFORE INSERT OR UPDATE OR DELETE ON public.registration_answer_sets
 FOR EACH ROW EXECUTE FUNCTION attendify_private.guard_form_rows();
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA attendify_private FROM PUBLIC,anon,authenticated,service_role;
COMMIT;

