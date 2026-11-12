-- ActivityTrack secure baseline additions for project xcntwkimnwhedfmqhtcj.
-- Run all existing migrations in timestamp order, then this migration.
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- Add fields required by current frontend and authenticated Edge Functions.
ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS api_key_hash text,
  ADD COLUMN IF NOT EXISTS screenshot_enabled boolean NOT NULL DEFAULT false;
ALTER TABLE public.activity_logs
  ADD COLUMN IF NOT EXISTS window_title text;
ALTER TABLE public.screenshots
  ADD COLUMN IF NOT EXISTS image_path text;

-- Keep existing API-key format (UUID) for compatibility with Employee UI/Agent,
-- but store a SHA-256 digest for Edge Function token lookup.
UPDATE public.employees
SET api_key_hash = encode(extensions.digest(convert_to(api_key::text, 'UTF8'), 'sha256'), 'hex')
WHERE api_key_hash IS NULL;

CREATE OR REPLACE FUNCTION public.sync_employee_api_key_hash()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.api_key_hash := encode(extensions.digest(convert_to(NEW.api_key::text, 'UTF8'), 'sha256'), 'hex');
  ELSIF NEW.api_key IS DISTINCT FROM OLD.api_key OR NEW.api_key_hash IS NULL THEN
    NEW.api_key_hash := encode(extensions.digest(convert_to(NEW.api_key::text, 'UTF8'), 'sha256'), 'hex');
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS employees_sync_api_key_hash ON public.employees;
CREATE TRIGGER employees_sync_api_key_hash
BEFORE INSERT OR UPDATE OF api_key ON public.employees
FOR EACH ROW EXECUTE FUNCTION public.sync_employee_api_key_hash();

-- Attendance table used by the ActivityTrack data model.
CREATE TABLE IF NOT EXISTS public.clock_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  clock_in timestamptz NOT NULL DEFAULT now(),
  clock_out timestamptz,
  date date NOT NULL DEFAULT CURRENT_DATE,
  total_seconds integer
);
CREATE INDEX IF NOT EXISTS clock_records_employee_date_idx
  ON public.clock_records(employee_id, date DESC);

-- Ensure the signup trigger creates a non-privileged profile.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles(user_id, email, full_name, role)
  VALUES (NEW.id, COALESCE(NEW.email, ''), COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email), 'pending')
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.activitytrack_is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.user_id = (SELECT auth.uid()) AND p.role = 'admin'
  );
$$;

-- Remove every old policy on protected application tables, including self-promotion paths.
DO $$
DECLARE p record;
BEGIN
  FOR p IN
    SELECT schemaname, tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN ('employees','activity_logs','screenshots','profiles','agent_requests','clock_records')
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I', p.policyname, p.schemaname, p.tablename);
  END LOOP;
END $$;

ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.screenshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clock_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY profiles_read_self_or_admin ON public.profiles
  FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()) OR public.activitytrack_is_admin());
CREATE POLICY profiles_admin_update ON public.profiles
  FOR UPDATE TO authenticated
  USING (public.activitytrack_is_admin())
  WITH CHECK (public.activitytrack_is_admin());

CREATE POLICY employees_admin_all ON public.employees
  FOR ALL TO authenticated
  USING (public.activitytrack_is_admin())
  WITH CHECK (public.activitytrack_is_admin());
CREATE POLICY activity_logs_admin_read ON public.activity_logs
  FOR SELECT TO authenticated
  USING (public.activitytrack_is_admin());
CREATE POLICY screenshots_admin_read ON public.screenshots
  FOR SELECT TO authenticated
  USING (public.activitytrack_is_admin());
CREATE POLICY agent_requests_admin_all ON public.agent_requests
  FOR ALL TO authenticated
  USING (public.activitytrack_is_admin())
  WITH CHECK (public.activitytrack_is_admin());
CREATE POLICY clock_records_admin_all ON public.clock_records
  FOR ALL TO authenticated
  USING (public.activitytrack_is_admin())
  WITH CHECK (public.activitytrack_is_admin());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.employees TO authenticated;
GRANT SELECT ON public.activity_logs, public.screenshots TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.agent_requests, public.clock_records TO authenticated;
GRANT SELECT ON public.profiles TO authenticated;
REVOKE ALL ON public.employees, public.activity_logs, public.screenshots,
  public.profiles, public.agent_requests, public.clock_records FROM anon;
GRANT ALL ON public.employees, public.activity_logs, public.screenshots,
  public.agent_requests, public.clock_records TO service_role;

-- Private screenshot storage and admin-only signed URL access.
UPDATE storage.buckets SET public = false WHERE id = 'screenshots';
DO $$
DECLARE p record;
BEGIN
  FOR p IN
    SELECT policyname FROM pg_policies
    WHERE schemaname='storage' AND tablename='objects'
      AND ('anon' = ANY(roles) OR policyname ILIKE '%screenshot%')
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON storage.objects', p.policyname);
  END LOOP;
END $$;
CREATE POLICY screenshots_admin_select ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id='screenshots' AND public.activitytrack_is_admin());

-- Ensure the clock table is available to Realtime.
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.clock_records;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

REVOKE ALL ON FUNCTION public.activitytrack_is_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.activitytrack_is_admin() TO authenticated;
REVOKE ALL ON FUNCTION public.sync_employee_api_key_hash() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;


CREATE OR REPLACE FUNCTION public.get_activity_stats(
  p_employee_id uuid DEFAULT NULL,
  p_start_date timestamptz DEFAULT NULL,
  p_end_date timestamptz DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE result json;
BEGIN
  IF NOT public.activitytrack_is_admin() THEN
    RAISE EXCEPTION 'Admin access required' USING ERRCODE = '42501';
  END IF;

  SELECT json_build_object(
    'working_seconds', COALESCE(SUM(CASE WHEN
      (al.app_name ILIKE '%photoshop%' OR al.app_name ILIKE '%.psd%' OR al.app_name ILIKE '%.psb%') OR
      (al.app_name ILIKE '%indesign%' OR al.app_name ILIKE '%.indd%') OR
      (al.app_name ILIKE '%illustrator%' OR al.app_name ILIKE '%.ai%')
    THEN al.duration_seconds ELSE 0 END), 0),
    'idle_seconds', COALESCE(SUM(CASE WHEN NOT (
      (al.app_name ILIKE '%photoshop%' OR al.app_name ILIKE '%.psd%' OR al.app_name ILIKE '%.psb%') OR
      (al.app_name ILIKE '%indesign%' OR al.app_name ILIKE '%.indd%') OR
      (al.app_name ILIKE '%illustrator%' OR al.app_name ILIKE '%.ai%')
    ) THEN al.duration_seconds ELSE 0 END), 0),
    'app_usage', COALESCE((
      SELECT json_object_agg(app_name, total_seconds)
      FROM (
        SELECT al2.app_name, SUM(al2.duration_seconds) AS total_seconds
        FROM public.activity_logs al2
        WHERE (p_employee_id IS NULL OR al2.employee_id = p_employee_id)
          AND (p_start_date IS NULL OR al2.created_at >= p_start_date)
          AND (p_end_date IS NULL OR al2.created_at <= p_end_date)
        GROUP BY al2.app_name
      ) sub
    ), '{}'::json),
    'daily_breakdown', COALESCE((
      SELECT json_agg(row_to_json(daily) ORDER BY daily.date)
      FROM (
        SELECT (al3.created_at AT TIME ZONE 'UTC')::date AS date,
          SUM(CASE WHEN
            (al3.app_name ILIKE '%photoshop%' OR al3.app_name ILIKE '%.psd%' OR al3.app_name ILIKE '%.psb%') OR
            (al3.app_name ILIKE '%indesign%' OR al3.app_name ILIKE '%.indd%') OR
            (al3.app_name ILIKE '%illustrator%' OR al3.app_name ILIKE '%.ai%')
          THEN al3.duration_seconds ELSE 0 END) AS working_seconds,
          SUM(CASE WHEN NOT (
            (al3.app_name ILIKE '%photoshop%' OR al3.app_name ILIKE '%.psd%' OR al3.app_name ILIKE '%.psb%') OR
            (al3.app_name ILIKE '%indesign%' OR al3.app_name ILIKE '%.indd%') OR
            (al3.app_name ILIKE '%illustrator%' OR al3.app_name ILIKE '%.ai%')
          ) THEN al3.duration_seconds ELSE 0 END) AS idle_seconds
        FROM public.activity_logs al3
        WHERE (p_employee_id IS NULL OR al3.employee_id = p_employee_id)
          AND (p_start_date IS NULL OR al3.created_at >= p_start_date)
          AND (p_end_date IS NULL OR al3.created_at <= p_end_date)
        GROUP BY (al3.created_at AT TIME ZONE 'UTC')::date
      ) daily
    ), '[]'::json)
  ) INTO result
  FROM public.activity_logs al
  WHERE (p_employee_id IS NULL OR al.employee_id = p_employee_id)
    AND (p_start_date IS NULL OR al.created_at >= p_start_date)
    AND (p_end_date IS NULL OR al.created_at <= p_end_date);

  RETURN result;
END;
$$;
REVOKE ALL ON FUNCTION public.get_activity_stats(uuid,timestamptz,timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_activity_stats(uuid,timestamptz,timestamptz) TO authenticated;

