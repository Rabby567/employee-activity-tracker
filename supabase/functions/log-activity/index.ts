import { adminClient, corsHeaders, employeeFromRequest, json } from "../_shared.ts";
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  try {
    const employee = await employeeFromRequest(req);
    if (!employee) return json({ error: "Invalid employee token" }, 401);
    const body = await req.json();
    const app_name = String(body.app_name || "").slice(0, 300);
    const window_title = String(body.window_title || "").slice(0, 500);
    const status = body.status;
    const duration_seconds = Number(body.duration_seconds ?? 30);
    if (!app_name || !["working", "idle"].includes(status) ||
        !Number.isInteger(duration_seconds) || duration_seconds < 0 || duration_seconds > 3600) {
      return json({ error: "Invalid activity payload" }, 400);
    }
    const sb = adminClient();
    const now = new Date().toISOString();
    const { error } = await sb.from("activity_logs").insert({
      employee_id: employee.id, app_name, window_title, status, duration_seconds, created_at: now
    });
    if (error) throw error;
    const { error: updateError } = await sb.from("employees").update({
      status: status === "idle" ? "idle" : "online", current_app: app_name, last_seen: now
    }).eq("id", employee.id);
    if (updateError) throw updateError;
    return json({ success: true });
  } catch (error) {
    console.error(error);
    return json({ error: "Unable to record activity" }, 500);
  }
});
