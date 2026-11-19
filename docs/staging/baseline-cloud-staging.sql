-- GENERATED OFFLINE from authoritative metadata; NOT a production dump.
-- STAGING ONLY. Contains NO application rows, credentials or auth account seeds.
-- Restores known legacy weaknesses for faithful before/after staging tests.
-- Never apply to production. Requires clean cloud staging Supabase managed schemas.
BEGIN;
-- Replace only this acknowledgement AFTER verifying the staging project reference in Dashboard.
-- This setting is operator acknowledgement, NOT automatic project identity verification.
SET LOCAL attendify.staging_ack = 'CLOUD_STAGING_CONFIRMED';
SET LOCAL search_path = public, pg_catalog;
DO $$ BEGIN
 IF current_setting('attendify.staging_ack',true) IS DISTINCT FROM 'CLOUD_STAGING_CONFIRMED'
 OR current_user <> 'postgres' OR current_setting('server_version_num')::int / 10000 <> 17
 THEN RAISE EXCEPTION 'Explicit verified PG17 staging target required'; END IF;
 IF current_setting('server_encoding') <> 'UTF8' OR current_setting('check_function_bodies') <> 'on'
 THEN RAISE EXCEPTION 'Require UTF8 and function body checking'; END IF;
 IF to_regclass('auth.users') IS NULL OR to_regprocedure('auth.uid()') IS NULL
 THEN RAISE EXCEPTION 'Use real isolated Supabase Auth schema'; END IF;
 IF (SELECT count(*) FROM pg_roles WHERE rolname IN ('anon','authenticated','service_role')) <> 3
 THEN RAISE EXCEPTION 'Expected managed roles missing'; END IF;
 IF to_regclass('public.events') IS NOT NULL OR to_regclass('public.profiles') IS NOT NULL
 OR to_regclass('public.registrations') IS NOT NULL OR to_regclass('public.attendance') IS NOT NULL
 THEN RAISE EXCEPTION 'Baseline requires empty application schema'; END IF;
 IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='public' AND p.proname IN ('handle_new_user','validate_event_capacity','check_in_ticket','get_attendance_records','get_event_registration_counts','register_for_event'))
 THEN RAISE EXCEPTION 'Existing application routines: stop and review'; END IF;
END $$;

CREATE TABLE public."profiles" (
 "id" uuid NOT NULL,
 "full_name" text DEFAULT ''::text NOT NULL,
 "role" text DEFAULT 'student'::text NOT NULL,
 "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public."profiles" OWNER TO postgres;

CREATE TABLE public."events" (
 "id" uuid DEFAULT gen_random_uuid() NOT NULL,
 "organizer_id" uuid NOT NULL,
 "title" text NOT NULL,
 "category" text NOT NULL,
 "description" text DEFAULT ''::text NOT NULL,
 "venue" text NOT NULL,
 "starts_at" timestamp with time zone NOT NULL,
 "ends_at" timestamp with time zone NOT NULL,
 "capacity" integer NOT NULL,
 "status" text DEFAULT 'draft'::text NOT NULL,
 "image_url" text,
 "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public."events" OWNER TO postgres;

CREATE TABLE public."registrations" (
 "id" uuid DEFAULT gen_random_uuid() NOT NULL,
 "event_id" uuid NOT NULL,
 "student_id" uuid NOT NULL,
 "status" text DEFAULT 'registered'::text NOT NULL,
 "registered_at" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public."registrations" OWNER TO postgres;

CREATE TABLE public."attendance" (
 "id" uuid DEFAULT gen_random_uuid() NOT NULL,
 "registration_id" uuid NOT NULL,
 "event_id" uuid NOT NULL,
 "checked_in_at" timestamp with time zone DEFAULT now() NOT NULL,
 "scanned_by" uuid
);

ALTER TABLE public."attendance" OWNER TO postgres;

ALTER TABLE public."events" ADD CONSTRAINT "events_capacity_check" CHECK (capacity > 0);

ALTER TABLE public."events" ADD CONSTRAINT "events_status_check" CHECK (status = ANY (ARRAY['draft'::text, 'published'::text, 'cancelled'::text]));

ALTER TABLE public."profiles" ADD CONSTRAINT "profiles_role_check" CHECK (role = ANY (ARRAY['student'::text, 'organizer'::text]));

ALTER TABLE public."registrations" ADD CONSTRAINT "registrations_status_check" CHECK (status = ANY (ARRAY['registered'::text, 'cancelled'::text]));

ALTER TABLE public."events" ADD CONSTRAINT "valid_event_dates" CHECK (ends_at > starts_at);

ALTER TABLE public."profiles" ADD CONSTRAINT "valid_profile_full_name" CHECK (char_length(full_name) <= 100);

ALTER TABLE public."attendance" ADD CONSTRAINT "attendance_pkey" PRIMARY KEY (id);

ALTER TABLE public."events" ADD CONSTRAINT "events_pkey" PRIMARY KEY (id);

ALTER TABLE public."profiles" ADD CONSTRAINT "profiles_pkey" PRIMARY KEY (id);

ALTER TABLE public."registrations" ADD CONSTRAINT "registrations_pkey" PRIMARY KEY (id);

ALTER TABLE public."attendance" ADD CONSTRAINT "attendance_registration_id_key" UNIQUE (registration_id);

ALTER TABLE public."registrations" ADD CONSTRAINT "registrations_event_id_student_id_key" UNIQUE (event_id, student_id);

ALTER TABLE public."registrations" ADD CONSTRAINT "registrations_id_event_id_key" UNIQUE (id, event_id);

ALTER TABLE public."attendance" ADD CONSTRAINT "attendance_registration_id_event_id_fkey" FOREIGN KEY (registration_id, event_id) REFERENCES registrations(id, event_id) ON DELETE CASCADE;

ALTER TABLE public."attendance" ADD CONSTRAINT "attendance_scanned_by_fkey" FOREIGN KEY (scanned_by) REFERENCES profiles(id);

ALTER TABLE public."events" ADD CONSTRAINT "events_organizer_id_fkey" FOREIGN KEY (organizer_id) REFERENCES profiles(id);

ALTER TABLE public."profiles" ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public."registrations" ADD CONSTRAINT "registrations_event_id_fkey" FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE;

ALTER TABLE public."registrations" ADD CONSTRAINT "registrations_student_id_fkey" FOREIGN KEY (student_id) REFERENCES profiles(id) ON DELETE CASCADE;

CREATE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  insert into public.profiles (
    id,
    full_name,
    role
  )
  values (
    new.id,
    left(
      trim(coalesce(
        new.raw_user_meta_data ->> 'full_name',
        ''
      )),
      100
    ),
    'student'
  );

  return new;
end;
$function$;

ALTER FUNCTION public.handle_new_user() OWNER TO postgres;

CREATE FUNCTION public.validate_event_capacity()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_registered bigint;
begin
  select count(*)
  into v_registered
  from public.registrations
  where event_id = new.id
    and status = 'registered';

  if new.capacity < v_registered then
    raise exception
      'Capacity cannot be less than existing registrations (%).',
      v_registered;
  end if;

  return new;
end;
$function$;

ALTER FUNCTION public.validate_event_capacity() OWNER TO postgres;

CREATE FUNCTION public.check_in_ticket(p_registration_id uuid, p_event_id uuid, p_student_id uuid)
 RETURNS TABLE(registration_id uuid, event_id uuid, student_id uuid, student_name text, checked_in_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_organizer uuid := auth.uid();
  v_registration public.registrations%ROWTYPE;
  v_student_name text;
  v_checked_at timestamptz;
BEGIN
  IF v_organizer IS NULL THEN
    RAISE EXCEPTION 'Authentication required.';
  END IF;

  -- Only the organizer who owns this published
  -- event can check in students.
  IF NOT EXISTS (
    SELECT 1
    FROM public.events AS e
    JOIN public.profiles AS p
      ON p.id = v_organizer
    WHERE e.id = p_event_id
      AND e.organizer_id = v_organizer
      AND e.status = 'published'
      AND p.role = 'organizer'
  ) THEN
    RAISE EXCEPTION
      'You are not authorized to scan this event.';
  END IF;

  -- Validate the registration and ticket.
  SELECT r.*
  INTO v_registration
  FROM public.registrations AS r
  WHERE r.id = p_registration_id
    AND r.event_id = p_event_id
    AND r.student_id = p_student_id
    AND r.status = 'registered';

  IF NOT FOUND THEN
    RAISE EXCEPTION
      'Invalid or cancelled ticket.';
  END IF;

  SELECT p.full_name
  INTO v_student_name
  FROM public.profiles AS p
  WHERE p.id = v_registration.student_id;

  -- FIX:
  -- Use ON CONFLICT ON CONSTRAINT instead of
  -- ON CONFLICT (registration_id).
  INSERT INTO public.attendance (
    registration_id,
    event_id,
    scanned_by
  )
  VALUES (
    v_registration.id,
    v_registration.event_id,
    v_organizer
  )
  ON CONFLICT ON CONSTRAINT attendance_registration_id_key
  DO NOTHING
  RETURNING public.attendance.checked_in_at
  INTO v_checked_at;

  IF v_checked_at IS NULL THEN
    RAISE EXCEPTION
      'This ticket has already been checked in.';
  END IF;

  RETURN QUERY
  SELECT
    v_registration.id,
    v_registration.event_id,
    v_registration.student_id,
    COALESCE(v_student_name, ''),
    v_checked_at;
END;
$function$;

ALTER FUNCTION public.check_in_ticket(uuid,uuid,uuid) OWNER TO postgres;

CREATE FUNCTION public.get_attendance_records()
 RETURNS TABLE(registration_id uuid, event_id uuid, student_id uuid, student_name text, registered_at timestamp with time zone, checked_in_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select
    r.id,
    r.event_id,
    r.student_id,
    p.full_name,
    r.registered_at,
    a.checked_in_at
  from public.registrations r
  join public.events e
    on e.id = r.event_id
  join public.profiles p
    on p.id = r.student_id
  left join public.attendance a
    on a.registration_id = r.id
  where auth.uid() is not null
    and r.status = 'registered'
    and (
      r.student_id = auth.uid()
      or (
        e.organizer_id = auth.uid()
        and exists (
          select 1
          from public.profiles organizer
          where organizer.id = auth.uid()
            and organizer.role = 'organizer'
        )
      )
    );
$function$;

ALTER FUNCTION public.get_attendance_records() OWNER TO postgres;

CREATE FUNCTION public.get_event_registration_counts()
 RETURNS TABLE(event_id uuid, registration_count bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select e.id, count(r.id)
  from public.events e
  left join public.registrations r
    on r.event_id = e.id
    and r.status = 'registered'
  where auth.uid() is not null
    and (
      e.status = 'published'
      or e.organizer_id = auth.uid()
    )
  group by e.id;
$function$;

ALTER FUNCTION public.get_event_registration_counts() OWNER TO postgres;

CREATE FUNCTION public.register_for_event(p_event_id uuid)
 RETURNS registrations
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
$function$;

ALTER FUNCTION public.register_for_event(uuid) OWNER TO postgres;

CREATE TRIGGER check_event_capacity BEFORE UPDATE OF capacity ON events FOR EACH ROW EXECUTE FUNCTION validate_event_capacity();

CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION handle_new_user();

ALTER TABLE public."events" ENABLE ROW LEVEL SECURITY;

ALTER TABLE public."attendance" ENABLE ROW LEVEL SECURITY;

ALTER TABLE public."profiles" ENABLE ROW LEVEL SECURITY;

ALTER TABLE public."registrations" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Organizers can create own events" ON public."events" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (((organizer_id = ( SELECT auth.uid() AS uid)) AND (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.role = 'organizer'::text))))));

CREATE POLICY "Organizers can delete empty events" ON public."events" AS PERMISSIVE FOR DELETE TO "authenticated" USING (((organizer_id = ( SELECT auth.uid() AS uid)) AND (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.role = 'organizer'::text)))) AND (NOT (EXISTS ( SELECT 1
   FROM registrations
  WHERE (registrations.event_id = events.id))))));

CREATE POLICY "Organizers can update own events" ON public."events" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (((organizer_id = ( SELECT auth.uid() AS uid)) AND (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.role = 'organizer'::text)))))) WITH CHECK (((organizer_id = ( SELECT auth.uid() AS uid)) AND (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.role = 'organizer'::text))))));

CREATE POLICY "Read own attendance" ON public."attendance" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM registrations r
  WHERE ((r.id = attendance.registration_id) AND (r.student_id = ( SELECT auth.uid() AS uid))))));

CREATE POLICY "Read own profile" ON public."profiles" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((id = ( SELECT auth.uid() AS uid)));

CREATE POLICY "Read own registrations" ON public."registrations" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((student_id = ( SELECT auth.uid() AS uid)));

CREATE POLICY "Read published events" ON public."events" AS PERMISSIVE FOR SELECT TO "authenticated" USING (((status = 'published'::text) OR (organizer_id = ( SELECT auth.uid() AS uid))));

CREATE POLICY "Update own full name" ON public."profiles" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ((id = ( SELECT auth.uid() AS uid))) WITH CHECK ((id = ( SELECT auth.uid() AS uid)));

REVOKE ALL ON TABLE public."events" FROM PUBLIC, anon, authenticated, service_role;

GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE public."events" TO "anon";

GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE public."events" TO "authenticated";

GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE public."events" TO "service_role";

REVOKE ALL ON TABLE public."attendance" FROM PUBLIC, anon, authenticated, service_role;

GRANT SELECT, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE public."attendance" TO "anon";

GRANT SELECT, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE public."attendance" TO "authenticated";

GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE public."attendance" TO "service_role";

REVOKE ALL ON TABLE public."profiles" FROM PUBLIC, anon, authenticated, service_role;

GRANT SELECT, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE public."profiles" TO "anon";

GRANT SELECT, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE public."profiles" TO "authenticated";

GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE public."profiles" TO "service_role";

REVOKE ALL ON TABLE public."registrations" FROM PUBLIC, anon, authenticated, service_role;

GRANT SELECT, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE public."registrations" TO "anon";

GRANT SELECT, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE public."registrations" TO "authenticated";

GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE public."registrations" TO "service_role";

REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.handle_new_user() TO PUBLIC;

GRANT EXECUTE ON FUNCTION public.handle_new_user() TO "anon";

GRANT EXECUTE ON FUNCTION public.handle_new_user() TO "authenticated";

GRANT EXECUTE ON FUNCTION public.handle_new_user() TO "service_role";

REVOKE ALL ON FUNCTION public.validate_event_capacity() FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.validate_event_capacity() TO PUBLIC;

GRANT EXECUTE ON FUNCTION public.validate_event_capacity() TO "anon";

GRANT EXECUTE ON FUNCTION public.validate_event_capacity() TO "authenticated";

GRANT EXECUTE ON FUNCTION public.validate_event_capacity() TO "service_role";

REVOKE ALL ON FUNCTION public.check_in_ticket(uuid,uuid,uuid) FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.check_in_ticket(uuid,uuid,uuid) TO "authenticated";

GRANT EXECUTE ON FUNCTION public.check_in_ticket(uuid,uuid,uuid) TO "service_role";

REVOKE ALL ON FUNCTION public.get_attendance_records() FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.get_attendance_records() TO "authenticated";

GRANT EXECUTE ON FUNCTION public.get_attendance_records() TO "service_role";

REVOKE ALL ON FUNCTION public.get_event_registration_counts() FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.get_event_registration_counts() TO "authenticated";

GRANT EXECUTE ON FUNCTION public.get_event_registration_counts() TO "service_role";

REVOKE ALL ON FUNCTION public.register_for_event(uuid) FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.register_for_event(uuid) TO "authenticated";

GRANT EXECUTE ON FUNCTION public.register_for_event(uuid) TO "service_role";

GRANT UPDATE(full_name) ON public.profiles TO authenticated;

-- Managed schemas, global role memberships/default ACLs are not overwritten.
-- Verify target managed-role behavior against evidence separately.
COMMIT;
