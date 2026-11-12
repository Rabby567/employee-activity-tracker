import { adminClient, corsHeaders, employeeFromRequest, json } from "../_shared.ts";
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "GET") return json({ error: "Method not allowed" }, 405);
  try {
    const employee = await employeeFromRequest(req);
    if (!employee) return json({ error: "Invalid employee token" }, 401);
    const requestId = new URL(req.url).searchParams.get("request_id");
    if (!requestId) return json({ error: "request_id is required" }, 400);
    const { data, error } = await adminClient().from("agent_requests")
      .select("id,status,reason,responded_at")
      .eq("id", requestId).eq("employee_id", employee.id).maybeSingle();
    if (error || !data) return json({ error: "Request not found" }, 404);
    return json({ request_id: data.id, status: data.status, reason: data.reason, responded_at: data.responded_at });
  } catch (error) {
    console.error(error);
    return json({ error: "Unable to check permission" }, 500);
  }
});
