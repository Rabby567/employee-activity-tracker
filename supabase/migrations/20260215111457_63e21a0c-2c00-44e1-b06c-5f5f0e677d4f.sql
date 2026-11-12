
CREATE OR REPLACE FUNCTION public.get_activity_stats(p_employee_id uuid DEFAULT NULL::uuid, p_start_date timestamp with time zone DEFAULT NULL::timestamp with time zone, p_end_date timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS json
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
        SELECT al2.app_name, SUM(al2.duration_seconds) as total_seconds
        FROM activity_logs al2
        WHERE
          (p_employee_id IS NULL OR al2.employee_id = p_employee_id) AND
          (p_start_date IS NULL OR al2.created_at >= p_start_date) AND
          (p_end_date IS NULL OR al2.created_at <= p_end_date)
        GROUP BY al2.app_name
      ) sub
    ), '{}'::json),
    'daily_breakdown', COALESCE((
      SELECT json_agg(row_to_json(daily) ORDER BY daily.date)
      FROM (
        SELECT
          (al3.created_at AT TIME ZONE 'UTC')::date AS date,
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
        FROM activity_logs al3
        WHERE
          (p_employee_id IS NULL OR al3.employee_id = p_employee_id) AND
          (p_start_date IS NULL OR al3.created_at >= p_start_date) AND
          (p_end_date IS NULL OR al3.created_at <= p_end_date)
        GROUP BY (al3.created_at AT TIME ZONE 'UTC')::date
      ) daily
    ), '[]'::json)
  )
  FROM activity_logs al
  WHERE
    (p_employee_id IS NULL OR al.employee_id = p_employee_id) AND
    (p_start_date IS NULL OR al.created_at >= p_start_date) AND
    (p_end_date IS NULL OR al.created_at <= p_end_date);
$function$;
