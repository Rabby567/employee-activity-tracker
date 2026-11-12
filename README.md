# ActivityTrack

ActivityTrack is a React + TypeScript + Vite employee activity dashboard backed by Supabase. The Windows employee agent is in `agent/` and is also packaged by the Agent Download page.

## Local development

Requirements: Node.js 20+ and npm.

```powershell
npm ci
copy .env.example .env
# Fill in the new Supabase project's URL, project ID and publishable key.
npm run dev
```

Build check:

```powershell
npm run build
```

## Supabase

The app targets Supabase project `xcntwkimnwhedfmqhtcj`. Apply the base migrations in `supabase/migrations/` in timestamp order, followed by the two `20261112...` migrations. See `ACTIVITYTRACK_SETUP.md` for the admin-account setup and deployment steps.

Deploy all five Edge Functions: `agent-config`, `log-activity`, `upload-screenshot`, `agent-request`, and `check-permission`.

Never put a Supabase service-role key in `.env`, Vercel `VITE_` variables, browser code, or the employee agent. Only the public publishable key belongs in the frontend and personalized agent package.

## Windows employee agent

See `agent/README.md`. Employees should receive the written monitoring notice before installation. `setup.bat` installs the visible background agent and its Windows sign-in startup task. `turn_off.bat` stops the agent and disables automatic startup. Screenshots are disabled by default and are enabled per employee by an administrator.


## ActivityTrack productivity update (2026-11-12)

The current update adds organization-wide activity sampling controls, productive website/application allowlists, separate productive/unproductive/idle states, timezone-aware analytics, website-domain reporting, and a protected test-data reset function.

### Apply the database migration first

Run `supabase/migrations/20261112000300_activitytrack_productivity_rules.sql` in the Supabase SQL Editor. It creates `activitytrack_settings`, adds the `website_domain` activity field, updates the activity status constraint, and replaces `get_activity_stats`. Do this before deploying the updated Edge Functions.

### Deploy updated Edge Functions

Deploy the updated `agent-config` and `log-activity` functions and the new `reset-activity-data` function from `supabase/functions/`. The reset endpoint requires an authenticated admin session and the exact confirmation text `RESET`.

### Website tracking

The employee agent starts a loopback-only browser bridge on `127.0.0.1:8765`. Install the included `browser-extension` folder in Chrome or Edge using Developer mode → Load unpacked. The extension sends only the active tab hostname; it does not collect page content, paths, or query strings.

### Important

The update archive excludes the local `.env` file and Supabase temporary project-link metadata. Keep your own local environment file separate. After deploying the migration and functions, download a fresh personalized employee installer from Agent Download so employees receive the updated agent.
