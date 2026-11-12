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
