import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-api-key",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};
export function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}
export function adminClient() {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) throw new Error("Server configuration missing");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
export async function employeeFromRequest(req: Request) {
  const token = req.headers.get("x-api-key") || "";
  if (token.length < 20 || token.length > 256) return null;
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  const hash = [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, "0")).join("");
  const { data, error } = await adminClient().from("employees")
    .select("id,name,employee_code,screenshot_enabled")
    .eq("api_key_hash", hash).maybeSingle();
  return error ? null : data;
}
