import { adminClient, corsHeaders, employeeFromRequest, json } from "../_shared.ts";

const normalizeDomain = (value: string) => value.toLowerCase().trim().replace(/^https?:\/\//, "").replace(/^www\./, "").split(/[/:?#]/)[0];
const matchesDomain = (domain: string, allowlist: string[]) => allowlist.some((item) => {
  const allowed = normalizeDomain(item);
  return allowed && (domain === allowed || domain.endsWith(`.${allowed}`));
});
const matchesApp = (app: string, allowlist: string[]) => {
  const value = app.toLowerCase().replace(/\.exe$/i, "").trim();
  return allowlist.some((item) => {
    const allowed = item.toLowerCase().replace(/\.exe$/i, "").trim();
    return allowed && value === allowed;
  });
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  try {
    const employee = await employeeFromRequest(req);
    if (!employee) return json({ error: "Invalid employee token" }, 401);
    const body = await req.json();
    const app_name = String(body.app_name || "").slice(0, 300);
    const window_title = String(body.window_title || "").slice(0, 500);
    const website_domain = normalizeDomain(String(body.website_domain || "").slice(0, 500));
    const reportedStatus = body.status;
    const duration_seconds = Number(body.duration_seconds ?? 30);
    if (!app_name || !["working", "idle"].includes(reportedStatus) ||
        !Number.isInteger(duration_seconds) || duration_seconds < 1 || duration_seconds > 300) {
      return json({ error: "Invalid activity payload" }, 400);
    }
    const sb = adminClient();
    const { data: settings, error: settingsError } = await sb.from("activitytrack_settings")
      .select("productive_websites,productive_apps").eq("id", 1).single();
    if (settingsError || !settings) throw settingsError || new Error("Settings missing");

    // Genuine idle always remains idle. Otherwise classify only by the two allowlists.
    const isProductive = matchesApp(app_name, settings.productive_apps || []) ||
      (website_domain !== "" && matchesDomain(website_domain, settings.productive_websites || []));
    const status = reportedStatus === "idle" ? "idle" : (isProductive ? "working" : "unproductive");
    const now = new Date().toISOString();
    const { error } = await sb.from("activity_logs").insert({
      employee_id: employee.id, app_name, window_title, website_domain: website_domain || null, status, duration_seconds, created_at: now,
    });
    if (error) throw error;
    const { error: updateError } = await sb.from("employees").update({
      status: status === "idle" ? "idle" : "online", current_app: website_domain ? `${app_name} — ${website_domain}` : app_name, last_seen: now,
    }).eq("id", employee.id);
    if (updateError) throw updateError;
    return json({ success: true, status, website_domain: website_domain || null });
  } catch (error) {
    console.error(error);
    return json({ error: "Unable to record activity" }, 500);
  }
});
