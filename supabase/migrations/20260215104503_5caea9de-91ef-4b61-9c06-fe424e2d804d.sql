
CREATE OR REPLACE FUNCTION get_activity_stats(
  p_employee_id uuid DEFAULT NULL,
  p_start_date timestamptz DEFAULT NULL,
  p_end_date timestamptz DEFAULT NULL
)
RETURNS JSON
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
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
    ), '{}'::json)
  )
  FROM activity_logs al
  WHERE
    (p_employee_id IS NULL OR al.employee_id = p_employee_id) AND
    (p_start_date IS NULL OR al.created_at >= p_start_date) AND
    (p_end_date IS NULL OR al.created_at <= p_end_date);
$$;
