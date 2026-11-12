import { adminClient, corsHeaders, employeeFromRequest, json } from "../_shared.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "GET") return json({ error: "Method not allowed" }, 405);

  try {
    const employee = await employeeFromRequest(req);
    if (!employee) return json({ error: "Invalid employee token" }, 401);

    const { data, error } = await adminClient()
      .from("employees")
      .select("screenshot_enabled,screenshot_interval,capture_requested_at")
      .eq("id", employee.id)
      .single();

    if (error || !data) return json({ error: "Agent configuration unavailable" }, 404);
    return json({
      screenshot_enabled: data.screenshot_enabled,
      screenshot_interval: data.screenshot_interval,
      capture_requested_at: data.capture_requested_at,
      server_time: new Date().toISOString(),
    });
  } catch (error) {
    console.error(error);
    return json({ error: "Unable to fetch agent configuration" }, 500);
  }
});
