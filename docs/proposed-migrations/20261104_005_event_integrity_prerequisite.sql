-- REVIEW DRAFT: independently approve these existing-contract corrections.
-- Trigger queries must see all registrations, not only organizer-visible rows.
BEGIN;
DO $$ BEGIN
 IF current_user <> 'postgres' THEN RAISE EXCEPTION 'Run reviewed staging migrations as postgres.'; END IF;
END $$;
CREATE OR REPLACE FUNCTION public.validate_event_capacity() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_registered bigint;
BEGIN
 SELECT count(*) INTO v_registered FROM public.registrations WHERE event_id=NEW.id AND status='registered';
 IF NEW.capacity<v_registered THEN
  RAISE EXCEPTION 'Capacity cannot be less than existing registrations (%).',v_registered;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.validate_event_capacity() FROM PUBLIC,anon,authenticated;
CREATE FUNCTION attendify_private.prevent_populated_event_delete() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM public.registrations WHERE event_id=OLD.id) THEN
  RAISE EXCEPTION 'Events with registrations cannot be deleted.';
 END IF;
 RETURN OLD;
END $$;
REVOKE ALL ON FUNCTION attendify_private.prevent_populated_event_delete() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER protect_populated_event_delete BEFORE DELETE ON public.events
 FOR EACH ROW EXECUTE FUNCTION attendify_private.prevent_populated_event_delete();
COMMIT;

