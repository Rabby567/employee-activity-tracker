import { adminClient, corsHeaders, employeeFromRequest, json } from "../_shared.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const employee = await employeeFromRequest(req);
    if (!employee) return json({ error: "Invalid employee token" }, 401);
    if (!employee.screenshot_enabled) return json({ error: "Screenshot capture is not enabled by the administrator" }, 403);

    const form = await req.formData();
    const file = form.get("screenshot");
    const captureReason = String(form.get("capture_reason") || "scheduled");
    const requestedAt = String(form.get("capture_requested_at") || "");
    if (!(["scheduled", "admin_requested"] as string[]).includes(captureReason)) {
      return json({ error: "Invalid capture reason" }, 400);
    }
    if (!(file instanceof File)) return json({ error: "Screenshot file is required" }, 400);
    if (!["image/jpeg", "image/png"].includes(file.type) || file.size < 1 || file.size > 5 * 1024 * 1024) {
      return json({ error: "Only non-empty JPEG/PNG files up to 5 MB are accepted" }, 400);
    }

    const sb = adminClient();
    if (captureReason === "admin_requested") {
      if (!requestedAt) return json({ error: "Admin screenshot request timestamp is required" }, 400);
      const { data: current, error: requestError } = await sb.from("employees")
        .select("capture_requested_at,screenshot_enabled")
        .eq("id", employee.id).single();
      if (requestError || !current?.screenshot_enabled || !current.capture_requested_at ||
          new Date(current.capture_requested_at).getTime() !== new Date(requestedAt).getTime()) {
        return json({ error: "This screenshot request is no longer active" }, 409);
      }
    }

    const now = new Date().toISOString();
    const extension = file.type === "image/png" ? "png" : "jpg";
    const path = `${employee.employee_code}/${crypto.randomUUID()}.${extension}`;
    const { error: uploadError } = await sb.storage.from("screenshots").upload(path, file, {
      contentType: file.type,
      upsert: false,
    });
    if (uploadError) throw uploadError;

    const { error: insertError } = await sb.from("screenshots").insert({
      employee_id: employee.id,
      image_path: path,
      created_at: now,
    });
    if (insertError) {
      await sb.storage.from("screenshots").remove([path]);
      throw insertError;
    }

    const employeeUpdate = sb.from("employees").update({ last_seen: now }).eq("id", employee.id);
    if (captureReason === "admin_requested") {
      // Clear only the request this agent has just fulfilled; a newer admin request is preserved.
      await sb.from("employees").update({ capture_requested_at: null, last_seen: now })
        .eq("id", employee.id).eq("capture_requested_at", requestedAt);
    } else {
      await employeeUpdate;
    }

    return json({ success: true, path, capture_reason: captureReason });
  } catch (error) {
    console.error("Screenshot upload failed:", error);
    return json({ error: "Unable to upload screenshot" }, 500);
  }
});
