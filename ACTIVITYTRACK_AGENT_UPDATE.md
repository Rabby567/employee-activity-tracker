# ActivityTrack Agent Update — Background Startup and Screenshot Controls

## Implemented in this project
- `setup.bat` installs the visible agent to `%LOCALAPPDATA%\ActivityTrackAgent`, installs Python dependencies, registers a per-user Windows Task Scheduler logon task, and starts it immediately.
- Runtime uses `pythonw.exe`; no terminal window is required after setup. A green ActivityTrack system-tray icon remains visible.
- The scheduled task starts at the next Windows sign-in, is configured without a run-time limit, and retries unexpected process failures.
- `turn_off.bat` stops the installed process and disables its automatic startup task. There is no `turn_on.bat`; run `setup.bat` to install/start again.
- Agent heartbeat runs every 30 seconds. The dashboard derives Offline after 90 seconds without a heartbeat.
- Screenshot capture is OFF by default. Admin can enable it per employee, select the interval (default 300 seconds / 5 minutes), or request one immediate screenshot from Employee Details.
- The agent polls remote screenshot settings every 30 seconds. Admin-requested captures are validated and their request timestamp is cleared after successful upload.
- The Agent Download page embeds the same Python, PowerShell installer, batch files, requirements and README as the `agent/` source directory. Personalized downloads contain the employee API token and public Supabase publishable key.
- Screenshots are uploaded through the authenticated employee Edge Function to the private `screenshots` Storage bucket. Employee tokens are checked using the stored SHA-256 hash.

## Supabase SQL
Run these migrations on the new Supabase project in order, after the four original base migrations:
1. `supabase/migrations/20261112000100_activitytrack_secure_new_project.sql`
2. `supabase/migrations/20261112000200_activitytrack_agent_controls.sql`

The second migration adds `screenshot_enabled`, `screenshot_interval` (default 300), and `capture_requested_at` to `public.employees`.

## Deploy Edge Functions
From the repository root, after `supabase login` and `supabase link --project-ref xcntwkimnwhedfmqhtcj`:

```powershell
supabase functions deploy agent-config --project-ref xcntwkimnwhedfmqhtcj
supabase functions deploy log-activity --project-ref xcntwkimnwhedfmqhtcj
supabase functions deploy upload-screenshot --project-ref xcntwkimnwhedfmqhtcj
supabase functions deploy agent-request --project-ref xcntwkimnwhedfmqhtcj
supabase functions deploy check-permission --project-ref xcntwkimnwhedfmqhtcj
```

`supabase/config.toml` disables JWT verification for these employee-token endpoints; each function validates the employee `x-api-key` itself. The public publishable key is sent in the `apikey` header. The service-role key remains server-side and is never included in the frontend or agent package.

## Local validation
```powershell
npm ci
npm run build
npm run dev
```

Then sign in as admin, open Agent Download, select an employee, download the personalized ZIP, and test it on a Windows PC with that employee's knowledge. Confirm the tray icon appears, Last Seen updates, screenshots remain disabled by default, then enable screenshot monitoring and test the 5-minute schedule and Request Screenshot control.

## Deployment
After local build and Windows-agent testing pass, commit and push to the connected GitHub repository. Vercel must have `VITE_SUPABASE_URL`, `VITE_SUPABASE_PROJECT_ID`, and `VITE_SUPABASE_PUBLISHABLE_KEY` configured for Production (and Preview if used), then redeploy.

## Operational limitation
The agent starts when the employee signs into Windows, not before Windows login. That is required for capture of the interactive desktop. A powered-on PC sitting at the sign-in screen will not provide a logged-in desktop for activity or screenshot collection.
