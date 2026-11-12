# ActivityTrack frontend + new Supabase project patch

Target Supabase Project: `xcntwkimnwhedfmqhtcj`
Target URL: `https://xcntwkimnwhedfmqhtcj.supabase.co`

## Why reload on /employees/:id showed Vercel 404
The app uses React Router `BrowserRouter`, but the Vercel project did not include an SPA rewrite. `vercel.json` now rewrites unknown app routes to `/index.html`, so direct reloads such as `/employees/<uuid>` return the React app instead of a Vercel 404.

## Apply code patch
1. Replace the GitHub repository files with this patched project, or copy the changed files into the existing repo.
2. Commit and push to the connected Vercel branch.
3. In Vercel Project Settings > Environment Variables set:
   - `VITE_SUPABASE_URL` = `https://xcntwkimnwhedfmqhtcj.supabase.co`
   - `VITE_SUPABASE_PUBLISHABLE_KEY` = the `sb_publishable_...` key provided by the owner
   - `VITE_SUPABASE_PROJECT_ID` = `xcntwkimnwhedfmqhtcj`
   Apply to Production (and Preview if desired), then redeploy.
4. Do not put service-role/secret keys in Vercel `VITE_` variables or the browser.

## New database setup
The existing four migrations under `supabase/migrations` must be run in timestamp order on the NEW empty Supabase project, followed by:
`20261112000100_activitytrack_secure_new_project.sql`

The first migration has been adjusted so new signups receive role `pending`, not `admin`.
After the intended admin has signed up and verified email, promote only that account in SQL Editor:
```sql
UPDATE public.profiles SET role='admin', updated_at=now()
WHERE lower(email)=lower('YOUR_ADMIN_EMAIL@gmail.com');
```
Verify exactly one row was updated. Then disable public signups in Supabase Auth settings.

## Edge Functions
The five Edge Functions are included. From the repo root:
```powershell
npx supabase login
npx supabase link --project-ref xcntwkimnwhedfmqhtcj
npx supabase functions deploy log-activity --use-api
npx supabase functions deploy upload-screenshot --use-api
npx supabase functions deploy agent-request --use-api
npx supabase functions deploy check-permission --use-api
npx supabase functions deploy agent-config --use-api
```
The Edge Functions use Supabase's server-side `SUPABASE_SERVICE_ROLE_KEY` automatically. Never expose that key to the frontend or Employee Agent.
Employee agent requests include `apikey: <publishable key>` and `x-api-key: <employee api_key>` headers. The employee API key is hashed in the database for lookup. The Agent Download page generates a personalized ZIP containing both keys; the publishable key is public, while the service-role key is never shipped to a client.

## Auth redirect URLs
In Supabase Authentication > URL Configuration:
- Site URL: `https://activitytrack-sand.vercel.app`
- Add Redirect URL: `https://activitytrack-sand.vercel.app/**`
- Add local development URL if needed: `http://localhost:8080/**`

## Important
- This patch changes the target project ID to the newly selected project. It does not modify or delete the old Supabase projects.
- No project has been deployed or database migration run by this package creation.
- The new DB should be empty before running the migration chain. Do not run the old schema chain against a project that already contains the same tables.
- Screenshot bucket remains private. `screenshot_enabled` defaults false; screenshots are not accepted until Admin explicitly enables the employee setting and the employee has been informed.
- Existing `get_activity_stats` RPC is restricted to admins.
- The Windows Agent package is included under `agent/` and is embedded in the Agent Download page. It starts after Windows user sign-in in a visible system-tray session; screenshots remain disabled until an administrator enables them.
