# ActivityTrack Employee Agent

ActivityTrack is a visible workplace monitoring client. Before installation, the organization must give employees written notice explaining the activity data collected, the purpose, screenshot settings, who can access the data, and retention periods.

## Install on a Windows employee PC

Personalized packages downloaded from **ActivityTrack → Agent Download** contain that employee's API key and the project's public Supabase publishable key.

1. Extract the ZIP.
2. Make sure Python 3.10+ is installed from https://www.python.org/downloads/ (enable **Add Python to PATH** during installation).
3. Double-click `setup.bat` and allow it to finish installing dependencies.
4. Confirm the green ActivityTrack icon is visible in the Windows system tray.

The installer copies the package to `%LOCALAPPDATA%\ActivityTrackAgent`, installs Python dependencies, creates a per-user Task Scheduler task, and starts the agent using `pythonw.exe`. The agent continues in the background when the setup window is closed. It starts again at the next Windows sign-in and restarts after an unexpected crash.

The agent runs in the signed-in Windows desktop session. It cannot capture an interactive desktop before a user signs in; this is why it is not installed as a hidden Windows service.

## Stop the agent

Run `turn_off.bat` from the extracted package or `%LOCALAPPDATA%\ActivityTrackAgent`. It stops the running process and disables the automatic sign-in task. Run `setup.bat` again if the agent needs to be installed and started again.

## Data and controls

- Activity heartbeat: every 30 seconds by default.
- Dashboard status: Online/Idle while a recent heartbeat exists; Offline after 90 seconds without one.
- Screenshot capture: disabled by default. An administrator can enable it per employee.
- Screenshot interval: default 300 seconds (5 minutes); the administrator can select a supported interval in Employee Details.
- Immediate screenshot: an administrator can request one capture from Employee Details while the employee agent is online and screenshot capture is enabled.
- The agent checks administrator-controlled screenshot settings every 30 seconds.
- Screenshots are uploaded to the private `screenshots` Storage bucket.
- Local diagnostic log: `%LOCALAPPDATA%\ActivityTrackAgent\agent.log`.

Screenshots are captured only while enabled by an administrator and under the organization's disclosed workplace monitoring policy.
