import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { adminClient, corsHeaders, json } from "../_shared.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  try {
    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.replace(/^Bearer\s+/i, "");
    if (!token) return json({ error: "Authentication required" }, 401);
    const url = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const userClient = createClient(url, anonKey, { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false } });
    const { data: userData, error: userError } = await userClient.auth.getUser();
    if (userError || !userData.user) return json({ error: "Invalid session" }, 401);
    const sb = adminClient();
    const { data: profile } = await sb.from("profiles").select("role").eq("user_id", userData.user.id).maybeSingle();
    if (profile?.role !== "admin") return json({ error: "Admin access required" }, 403);
    const body = await req.json().catch(() => ({}));
    if (body.confirmation !== "RESET") return json({ error: "Confirmation missing" }, 400);

    // Collect all screenshot paths first, then remove in batches. This avoids
    // offset-pagination skips while files are being deleted.
    const collectFiles = async (prefix: string): Promise<string[]> => {
      const collected: string[] = [];
      let offset = 0;
      const pageSize = 500;
      while (true) {
        const { data: objects, error: listError } = await sb.storage.from("screenshots").list(prefix, { limit: pageSize, offset });
        if (listError) throw listError;
        if (!objects?.length) break;
        for (const item of objects) {
          if (item.id) collected.push(prefix ? `${prefix}/${item.name}` : item.name);
          else if (item.name) collected.push(...await collectFiles(prefix ? `${prefix}/${item.name}` : item.name));
        }
        if (objects.length < pageSize) break;
        offset += pageSize;
      }
      return collected;
    };
    const screenshotPaths = await collectFiles("");
    for (let i = 0; i < screenshotPaths.length; i += 100) {
      const { error: removeError } = await sb.storage.from("screenshots").remove(screenshotPaths.slice(i, i + 100));
      if (removeError) throw removeError;
    }

    const { error: screenshotError } = await sb.from("screenshots").delete().not("id", "is", null);
    if (screenshotError) throw screenshotError;
    const { error: logsError } = await sb.from("activity_logs").delete().not("id", "is", null);
    if (logsError) throw logsError;
    const { error: requestsError } = await sb.from("agent_requests").delete().not("id", "is", null);
    if (requestsError) throw requestsError;
    const { error: clockError } = await sb.from("clock_records").delete().not("id", "is", null);
    if (clockError) throw clockError;
    const { error: employeesError } = await sb.from("employees").update({ status: "offline", current_app: null, last_seen: null, capture_requested_at: null });
    if (employeesError) throw employeesError;
    return json({ success: true, message: "Activity and screenshot test data cleared." });
  } catch (error) {
    console.error(error);
    return json({ error: "Unable to reset activity data" }, 500);
  }
});
