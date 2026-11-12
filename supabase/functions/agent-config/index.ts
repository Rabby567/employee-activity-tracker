import { adminClient, corsHeaders, employeeFromRequest, json } from "../_shared.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "GET") return json({ error: "Method not allowed" }, 405);
  try {
    const employee = await employeeFromRequest(req);
    if (!employee) return json({ error: "Invalid employee token" }, 401);
    const sb = adminClient();
    const [{ data: employeeSettings, error: employeeError }, { data: settings, error: settingsError }] = await Promise.all([
      sb.from("employees").select("screenshot_enabled,screenshot_interval,capture_requested_at").eq("id", employee.id).single(),
      sb.from("activitytrack_settings").select("activity_interval_seconds,idle_threshold_seconds,productive_websites,productive_apps").eq("id", 1).single(),
    ]);
    if (employeeError || !employeeSettings) return json({ error: "Agent configuration unavailable" }, 404);
    if (settingsError || !settings) return json({ error: "Activity settings unavailable" }, 503);
    return json({
      ...employeeSettings,
      activity_interval: settings.activity_interval_seconds,
      idle_threshold: settings.idle_threshold_seconds,
      productive_websites: settings.productive_websites || [],
      productive_apps: settings.productive_apps || [],
      server_time: new Date().toISOString(),
    });
  } catch (error) {
    console.error(error);
    return json({ error: "Unable to fetch agent configuration" }, 500);
  }
});
