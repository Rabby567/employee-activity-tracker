DROP FUNCTION IF EXISTS public.get_activity_stats(uuid,timestamptz,timestamptz);
DROP FUNCTION IF EXISTS public.get_activity_stats(uuid,timestamptz,timestamptz,text);
CREATE FUNCTION public.get_activity_stats(
  p_employee_id uuid DEFAULT NULL,
  p_start_date timestamptz DEFAULT NULL,
  p_end_date timestamptz DEFAULT NULL,
  p_timezone text DEFAULT 'UTC'
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

  WITH filtered AS (
    SELECT al.* FROM public.activity_logs al
    WHERE (p_employee_id IS NULL OR al.employee_id = p_employee_id)
      AND (p_start_date IS NULL OR al.created_at >= p_start_date)
      AND (p_end_date IS NULL OR al.created_at <= p_end_date)
  ), daily AS (
    SELECT (created_at AT TIME ZONE COALESCE(NULLIF(p_timezone, ''), 'UTC'))::date AS date,
      SUM(CASE WHEN status = 'working' THEN duration_seconds ELSE 0 END)::bigint AS working_seconds,
      SUM(CASE WHEN status = 'unproductive' THEN duration_seconds ELSE 0 END)::bigint AS unproductive_seconds,
      SUM(CASE WHEN status = 'idle' THEN duration_seconds ELSE 0 END)::bigint AS idle_seconds
    FROM filtered GROUP BY (created_at AT TIME ZONE COALESCE(NULLIF(p_timezone, ''), 'UTC'))::date
  ), apps AS (
    SELECT app_name, SUM(duration_seconds)::bigint AS total_seconds
    FROM filtered GROUP BY app_name
  ), websites AS (
    SELECT website_domain, SUM(duration_seconds)::bigint AS total_seconds
    FROM filtered WHERE website_domain IS NOT NULL AND website_domain <> ''
    GROUP BY website_domain
  ), employee_totals AS (
    SELECT employee_id,
      SUM(CASE WHEN status='working' THEN duration_seconds ELSE 0 END)::bigint AS working_seconds,
      SUM(CASE WHEN status='unproductive' THEN duration_seconds ELSE 0 END)::bigint AS unproductive_seconds,
      SUM(CASE WHEN status='idle' THEN duration_seconds ELSE 0 END)::bigint AS idle_seconds
    FROM filtered GROUP BY employee_id
  )
  SELECT json_build_object(
    'working_seconds', COALESCE((SELECT SUM(duration_seconds) FROM filtered WHERE status='working'), 0),
    'unproductive_seconds', COALESCE((SELECT SUM(duration_seconds) FROM filtered WHERE status='unproductive'), 0),
    'idle_seconds', COALESCE((SELECT SUM(duration_seconds) FROM filtered WHERE status='idle'), 0),
    'total_seconds', COALESCE((SELECT SUM(duration_seconds) FROM filtered), 0),
    'app_usage', COALESCE((SELECT json_object_agg(app_name,total_seconds) FROM apps), '{}'::json),
    'website_usage', COALESCE((SELECT json_object_agg(website_domain,total_seconds) FROM websites), '{}'::json),
    'employee_breakdown', COALESCE((SELECT json_agg(row_to_json(e)) FROM employee_totals e), '[]'::json),
    'daily_breakdown', COALESCE((SELECT json_agg(row_to_json(d) ORDER BY d.date) FROM daily d), '[]'::json)
  ) INTO result;
  RETURN result;
END;
$$;
REVOKE ALL ON FUNCTION public.get_activity_stats(uuid,timestamptz,timestamptz,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_activity_stats(uuid,timestamptz,timestamptz,text) TO authenticated;

COMMIT;
