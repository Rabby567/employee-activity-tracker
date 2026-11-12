import { adminClient, corsHeaders, employeeFromRequest, json } from "../_shared.ts";
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  try {
    const employee = await employeeFromRequest(req);
    if (!employee) return json({ error: "Invalid employee token" }, 401);
    const body = await req.json();
    if (!["close", "uninstall"].includes(body.request_type)) return json({ error: "Invalid request type" }, 400);
    const sb = adminClient();
    const { data: existing } = await sb.from("agent_requests").select("id")
      .eq("employee_id", employee.id).eq("request_type", body.request_type).eq("status", "pending").maybeSingle();
    if (existing) return json({ request_id: existing.id, status: "pending" });
    const { data, error } = await sb.from("agent_requests").insert({
      employee_id: employee.id, request_type: body.request_type, status: "pending"
    }).select("id").single();
    if (error) throw error;
    return json({ request_id: data.id, status: "pending" });
  } catch (error) {
    console.error(error);
    return json({ error: "Unable to create request" }, 500);
  }
});
