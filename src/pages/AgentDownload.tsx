import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Download, FileCode, Settings, FileText, Terminal, User, Zap, Copy, Check } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import JSZip from 'jszip';
import { useState } from 'react';
import { toast } from 'sonner';
import { useEmployees } from '@/hooks/useEmployees';

// Agent package is generated here so the downloaded ZIP always matches this release.
const getAgentFiles = (apiKey?: string) => ({
  'employee_agent.py': `#!/usr/bin/env python3
"""ActivityTrack visible employee monitoring agent.

Runs in the signed-in Windows desktop session. The organization must disclose
what activity data and screenshots are collected, why, who can view them, and
how long they are retained before enabling monitoring.
"""
import io
import json
import os
import threading
import time
from datetime import datetime

import requests
import win32gui
from pynput import mouse, keyboard
from PIL import Image, ImageGrab
import pystray

APP_NAME = "ActivityTrack Agent"
AGENT_VERSION = "1.1.0"


class EmployeeAgent:
    def __init__(self):
        self.base_dir = os.path.dirname(os.path.abspath(__file__))
        self.config = self.load_config()
        self.api_key = self.config["api_key"]
        self.publishable_key = self.config.get("publishable_key", "")
        self.api_url = self.config["api_url"].rstrip("/")
        self.activity_interval = max(15, int(self.config.get("activity_interval", 30)))
        self.idle_threshold = max(60, int(self.config.get("idle_threshold", 300)))
        self.screenshot_quality = min(90, max(35, int(self.config.get("screenshot_quality", 60))))
        self.screenshot_interval = 300
        self.screenshot_enabled = False
        self.capture_requested_at = None
        self.last_capture_request = None
        self.last_screenshot_at = time.monotonic()
        self.last_activity_at = time.monotonic()
        self.running = threading.Event()
        self.running.set()
        self.session = requests.Session()
        self.session.headers.update({
            "x-api-key": self.api_key,
            "apikey": self.publishable_key,
            "User-Agent": f"ActivityTrackAgent/{AGENT_VERSION}",
        })
        self.icon = None

    def load_config(self):
        path = os.path.join(self.base_dir, "config.json")
        with open(path, "r", encoding="utf-8") as handle:
            cfg = json.load(handle)
        if not cfg.get("api_key") or cfg["api_key"] == "YOUR_EMPLOYEE_API_KEY_HERE":
            raise RuntimeError("Employee API key is missing from config.json")
        if not cfg.get("api_url"):
            raise RuntimeError("Supabase Functions URL is missing from config.json")
        if not cfg.get("publishable_key") or cfg["publishable_key"] == "YOUR_SUPABASE_PUBLISHABLE_KEY":
            raise RuntimeError("Supabase publishable key is missing from config.json")
        return cfg

    def on_input(self, *_args):
        self.last_activity_at = time.monotonic()

    def active_window(self):
        try:
            hwnd = win32gui.GetForegroundWindow()
            return win32gui.GetWindowText(hwnd) or "Unknown"
        except Exception:
            return "Unknown"

    def post_activity(self):
        window = self.active_window()
        idle = (time.monotonic() - self.last_activity_at) >= self.idle_threshold
        payload = {
            "app_name": window,
            "window_title": window,
            "status": "idle" if idle else "working",
            "duration_seconds": self.activity_interval,
        }
        try:
            response = self.session.post(f"{self.api_url}/log-activity", json=payload, timeout=15)
            response.raise_for_status()
        except requests.RequestException as exc:
            self.write_log(f"Activity heartbeat failed: {exc}")

    def fetch_remote_config(self):
        try:
            response = self.session.get(f"{self.api_url}/agent-config", timeout=15)
            response.raise_for_status()
            data = response.json()
            was_enabled = self.screenshot_enabled
            self.screenshot_enabled = bool(data.get("screenshot_enabled", False))
            if self.screenshot_enabled and not was_enabled:
                # Start the 5-minute schedule from the moment admin enables capture.
                self.last_screenshot_at = time.monotonic()
            self.screenshot_interval = min(3600, max(60, int(data.get("screenshot_interval", 300))))
            self.capture_requested_at = data.get("capture_requested_at")
            if self.icon:
                state = "enabled" if self.screenshot_enabled else "disabled"
                self.icon.title = f"ActivityTrack — Monitoring Active; screenshots {state}"
        except (requests.RequestException, ValueError, TypeError) as exc:
            self.write_log(f"Remote settings sync failed: {exc}")

    def upload_screenshot(self, reason="scheduled"):
        if not self.screenshot_enabled:
            return False
        try:
            image = ImageGrab.grab(all_screens=True)
            buffer = io.BytesIO()
            image.save(buffer, format="JPEG", quality=self.screenshot_quality, optimize=True)
            buffer.seek(0)
            data = {"capture_reason": reason}
            if reason == "admin_requested" and self.capture_requested_at:
                data["capture_requested_at"] = self.capture_requested_at
            response = self.session.post(
                f"{self.api_url}/upload-screenshot",
                files={"screenshot": ("activitytrack.jpg", buffer, "image/jpeg")},
                data=data,
                timeout=45,
            )
            response.raise_for_status()
            self.last_screenshot_at = time.monotonic()
            self.write_log(f"Screenshot uploaded ({reason})")
            return True
        except Exception as exc:
            self.write_log(f"Screenshot upload failed: {exc}")
            return False

    def config_loop(self):
        while self.running.is_set():
            try:
                self.fetch_remote_config()
                if (self.screenshot_enabled and self.capture_requested_at
                        and self.capture_requested_at != self.last_capture_request):
                    if self.upload_screenshot("admin_requested"):
                        self.last_capture_request = self.capture_requested_at
                elif (self.screenshot_enabled and
                      time.monotonic() - self.last_screenshot_at >= self.screenshot_interval):
                    self.upload_screenshot("scheduled")
            except Exception as exc:
                self.write_log(f"Remote control loop error: {exc}")
            self.running.wait(30)

    def activity_loop(self):
        while self.running.is_set():
            try:
                self.post_activity()
            except Exception as exc:
                self.write_log(f"Activity loop error: {exc}")
            self.running.wait(self.activity_interval)

    def write_log(self, message):
        log_path = os.path.join(self.base_dir, "agent.log")
        try:
            with open(log_path, "a", encoding="utf-8") as handle:
                handle.write(f"{datetime.now().isoformat(timespec='seconds')} {message}\\n")
        except OSError:
            pass

    def create_tray_icon(self):
        icon_image = Image.new("RGB", (64, 64), color="#16a34a")
        menu = pystray.Menu(
            pystray.MenuItem("ActivityTrack monitoring is active", lambda: None, enabled=False),
            pystray.MenuItem("Screenshot setting is controlled by your administrator", lambda: None, enabled=False),
            pystray.MenuItem("Open agent log", self.open_log),
        )
        self.icon = pystray.Icon(APP_NAME, icon_image, "ActivityTrack — Monitoring Active", menu)
        return self.icon

    def open_log(self, _icon=None, _item=None):
        path = os.path.join(self.base_dir, "agent.log")
        if os.path.exists(path):
            os.startfile(path)

    def start(self):
        self.write_log("Agent started in visible user session")
        mouse_listener = mouse.Listener(on_move=self.on_input, on_click=self.on_input, on_scroll=self.on_input)
        keyboard_listener = keyboard.Listener(on_press=self.on_input)
        mouse_listener.start()
        keyboard_listener.start()
        threading.Thread(target=self.activity_loop, name="activity-heartbeat", daemon=True).start()
        threading.Thread(target=self.config_loop, name="remote-settings", daemon=True).start()
        try:
            self.create_tray_icon().run()
        finally:
            self.running.clear()
            mouse_listener.stop()
            keyboard_listener.stop()
            self.session.close()
            self.write_log("Agent stopped")


if __name__ == "__main__":
    try:
        EmployeeAgent().start()
    except Exception as error:
        log_file = os.path.join(os.path.dirname(os.path.abspath(__file__)), "agent.log")
        with open(log_file, "a", encoding="utf-8") as handle:
            handle.write(f"{datetime.now().isoformat(timespec='seconds')} FATAL: {error}\\n")
        raise`,
  'config.json': `{
  "api_key": "${apiKey || 'YOUR_EMPLOYEE_API_KEY_HERE'}",
  "publishable_key": "${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || 'YOUR_SUPABASE_PUBLISHABLE_KEY'}",
  "api_url": "https://xcntwkimnwhedfmqhtcj.supabase.co/functions/v1",
  "activity_interval": 30,
  "screenshot_interval": 300,
  "idle_threshold": 300,
  "screenshot_quality": 60
}`,
  'requirements.txt': `requests>=2.31.0
pywin32>=306
pynput>=1.7.6
Pillow>=10.0.0
pystray>=0.19.5`,
  'setup.bat': `@echo off
setlocal
title ActivityTrack Agent Setup
echo.
echo ==========================================
echo       ActivityTrack Agent Setup
echo ==========================================
echo This installs the visible ActivityTrack agent for this Windows user.
echo Activity and screenshots are collected only as configured by your organization.
echo.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0install.ps1"
if errorlevel 1 (
  echo.
  echo Setup failed. Read the error above.
  pause
  exit /b 1
)
echo.
echo Setup complete. Agent is running in the background.
echo A green ActivityTrack icon should appear in the system tray.
echo Run turn_off.bat to stop the agent and disable automatic startup.
echo.
pause`,
  'install.ps1': `$ErrorActionPreference = "Stop"
$sourceDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$installDir = Join-Path $env:LOCALAPPDATA "ActivityTrackAgent"
$taskName = "ActivityTrackEmployeeAgent"

Write-Host "Installing ActivityTrack Agent for the current Windows user..." -ForegroundColor Cyan
New-Item -ItemType Directory -Force -Path $installDir | Out-Null
Copy-Item -Path (Join-Path $sourceDir "*") -Destination $installDir -Recurse -Force

$configPath = Join-Path $installDir "config.json"
$config = Get-Content $configPath -Raw | ConvertFrom-Json
if (-not $config.api_key -or $config.api_key -eq "YOUR_EMPLOYEE_API_KEY_HERE") {
    throw "This package has no employee API key. Download the personalized package from the admin dashboard."
}
if (-not $config.api_url -or $config.api_url -notmatch '^https://[^/]+\\.supabase\\.co/functions/v1$') {
    throw "The Supabase Edge Functions URL in config.json is invalid."
}
if (-not $config.publishable_key -or $config.publishable_key -eq "YOUR_SUPABASE_PUBLISHABLE_KEY") {
    throw "The Supabase publishable key is missing from this package. Download a fresh personalized package from the admin dashboard."
}

# Find a real Python installation (not the Microsoft Store execution alias).
$pythonExe = $null
$pythonw = $null
$pythonCmd = Get-Command python.exe -ErrorAction SilentlyContinue
if ($pythonCmd -and $pythonCmd.Source -notlike "$env:LOCALAPPDATA\\Microsoft\\WindowsApps\\*") {
    $pythonExe = $pythonCmd.Source
}
if (-not $pythonExe) {
    $pyCmd = Get-Command py.exe -ErrorAction SilentlyContinue
    if ($pyCmd) {
        $pythonExe = (& $pyCmd.Source -3 -c "import sys; print(sys.executable)" 2>$null).Trim()
    }
}
if (-not $pythonExe -or -not (Test-Path $pythonExe)) {
    throw "Python 3.10 or newer is required. Install Python from https://www.python.org/downloads/ (select 'Add Python to PATH'), then run setup.bat again."
}
$pythonVersion = (& $pythonExe -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')").Trim()
$versionParts = $pythonVersion.Split('.')
if ([int]$versionParts[0] -lt 3 -or ([int]$versionParts[0] -eq 3 -and [int]$versionParts[1] -lt 10)) {
    throw "Python 3.10 or newer is required. Detected Python $pythonVersion."
}

$pythonDir = Split-Path $pythonExe -Parent
$pythonw = Join-Path $pythonDir "pythonw.exe"
if (-not (Test-Path $pythonw)) {
    throw "pythonw.exe was not found beside Python. Reinstall Python from python.org and run setup.bat again."
}

Write-Host "Installing Python dependencies..." -ForegroundColor Cyan
& $pythonExe -m pip --version *> $null
if ($LASTEXITCODE -ne 0) {
    & $pythonExe -m ensurepip --upgrade
    if ($LASTEXITCODE -ne 0) { throw "Python pip could not be initialized." }
}
& $pythonExe -m pip install --user --upgrade -r (Join-Path $installDir "requirements.txt")
if ($LASTEXITCODE -ne 0) { throw "Could not install Python dependencies. Check the internet connection and run setup.bat again." }

$scriptPath = Join-Path $installDir "employee_agent.py"
$arguments = "\`"$scriptPath\`""
Stop-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -and $_.CommandLine.Contains($scriptPath) } | ForEach-Object {
    Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
}
Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue
$action = New-ScheduledTaskAction -Execute $pythonw -Argument $arguments -WorkingDirectory $installDir
$currentUser = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $currentUser
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit ([TimeSpan]::Zero)
$principal = New-ScheduledTaskPrincipal -UserId $currentUser -LogonType Interactive -RunLevel Limited
Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Description "ActivityTrack visible employee monitoring agent; employee notice required. Stop with turn_off.bat." -Force | Out-Null
Start-ScheduledTask -TaskName $taskName

Write-Host "Installed to: $installDir" -ForegroundColor Green
Write-Host "Agent started in the background. No terminal window is required." -ForegroundColor Green
Write-Host "A green ActivityTrack icon is visible in the Windows system tray." -ForegroundColor Green
Write-Host "At future Windows sign-ins, the agent starts automatically." -ForegroundColor Green
Write-Host "To stop it and disable startup, run turn_off.bat." -ForegroundColor Yellow`,
  'turn_off.bat': `@echo off
setlocal
title Turn Off ActivityTrack Agent
echo Stopping ActivityTrack and disabling automatic startup...
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command ^
 "$task='ActivityTrackEmployeeAgent'; $install=Join-Path $env:LOCALAPPDATA 'ActivityTrackAgent'; $script=Join-Path $install 'employee_agent.py';" ^
 "Disable-ScheduledTask -TaskName $task -ErrorAction SilentlyContinue | Out-Null;" ^
 "Stop-ScheduledTask -TaskName $task -ErrorAction SilentlyContinue;" ^
 "Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -and $_.CommandLine.Contains($script) } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue };" ^
 "Write-Host 'ActivityTrack Agent stopped. Automatic startup is disabled.' -ForegroundColor Green"
echo.
pause`,
  'README.md': `# ActivityTrack Employee Agent

ActivityTrack is a visible workplace monitoring client. Before installation, the organization must give employees written notice explaining the activity data collected, the purpose, screenshot settings, who can access the data, and retention periods.

## Install on a Windows employee PC

Personalized packages downloaded from **ActivityTrack → Agent Download** contain that employee's API key and the project's public Supabase publishable key.

1. Extract the ZIP.
2. Make sure Python 3.10+ is installed from https://www.python.org/downloads/ (enable **Add Python to PATH** during installation).
3. Double-click \`setup.bat\` and allow it to finish installing dependencies.
4. Confirm the green ActivityTrack icon is visible in the Windows system tray.

The installer copies the package to \`%LOCALAPPDATA%\\ActivityTrackAgent\`, installs Python dependencies, creates a per-user Task Scheduler task, and starts the agent using \`pythonw.exe\`. The agent continues in the background when the setup window is closed. It starts again at the next Windows sign-in and restarts after an unexpected crash.

The agent runs in the signed-in Windows desktop session. It cannot capture an interactive desktop before a user signs in; this is why it is not installed as a hidden Windows service.

## Stop the agent

Run \`turn_off.bat\` from the extracted package or \`%LOCALAPPDATA%\\ActivityTrackAgent\`. It stops the running process and disables the automatic sign-in task. Run \`setup.bat\` again if the agent needs to be installed and started again.

## Data and controls

- Activity heartbeat: every 30 seconds by default.
- Dashboard status: Online/Idle while a recent heartbeat exists; Offline after 90 seconds without one.
- Screenshot capture: disabled by default. An administrator can enable it per employee.
- Screenshot interval: default 300 seconds (5 minutes); the administrator can select a supported interval in Employee Details.
- Immediate screenshot: an administrator can request one capture from Employee Details while the employee agent is online and screenshot capture is enabled.
- The agent checks administrator-controlled screenshot settings every 30 seconds.
- Screenshots are uploaded to the private \`screenshots\` Storage bucket.
- Local diagnostic log: \`%LOCALAPPDATA%\\ActivityTrackAgent\\agent.log\`.

Screenshots are captured only while enabled by an administrator and under the organization's disclosed workplace monitoring policy.`
});

export default function AgentDownload() {
  const [isDownloading, setIsDownloading] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState<string>('');
  const [copied, setCopied] = useState(false);
  const { employees, loading } = useEmployees();

  const selectedEmployeeData = employees.find(e => e.id === selectedEmployee);

  const downloadAgentZip = async (withApiKey: boolean = false) => {
    setIsDownloading(true);
    try {
      const apiKey = withApiKey && selectedEmployeeData ? selectedEmployeeData.api_key : undefined;
      const agentFiles = getAgentFiles(apiKey);
      
      const zip = new JSZip();
      const folderName = selectedEmployeeData 
        ? `employee-agent-${selectedEmployeeData.name.replace(/\s+/g, '-').toLowerCase()}`
        : 'employee-agent';
      const folder = zip.folder(folderName);
      
      if (!folder) {
        throw new Error('Failed to create folder');
      }
      
      Object.entries(agentFiles).forEach(([filename, content]) => {
        folder.file(filename, content);
      });
      
      const blob = await zip.generateAsync({ type: 'blob' });
      
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${folderName}.zip`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      
      toast.success(withApiKey 
        ? `Personalized installer for ${selectedEmployeeData?.name} downloaded!`
        : 'Agent downloaded successfully!'
      );
    } catch (error) {
      console.error('Download failed:', error);
      toast.error('Failed to download agent files');
    } finally {
      setIsDownloading(false);
    }
  };

  const copyApiKey = () => {
    if (selectedEmployeeData?.api_key) {
      navigator.clipboard.writeText(selectedEmployeeData.api_key);
      setCopied(true);
      toast.success('API key copied to clipboard');
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const files = [
    { name: 'setup.bat', icon: Zap, description: 'One-click installer - double-click to install' },
    { name: 'employee_agent.py', icon: FileCode, description: 'Main Python agent script' },
    { name: 'config.json', icon: Settings, description: 'Configuration file (API key, intervals)' },
    { name: 'install.ps1', icon: Terminal, description: 'Installs the visible background agent and Windows sign-in startup task' },
    { name: 'turn_off.bat', icon: Settings, description: 'Stops the agent and disables automatic startup' },
    { name: 'requirements.txt', icon: FileText, description: 'Python dependencies' },
    { name: 'README.md', icon: FileText, description: 'Setup and usage instructions' },
  ];

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Agent Download</h1>
          <p className="text-muted-foreground mt-1">
            Download the employee monitoring agent for Windows computers
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          {/* One-Click Installer Card */}
          <Card className="border-primary/50 bg-primary/5">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Zap className="h-5 w-5 text-primary" />
                One-Click Installer
              </CardTitle>
              <CardDescription>
                Download a personalized agent package with the employee API key pre-configured
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="employee-select">Select Employee</Label>
                <Select value={selectedEmployee} onValueChange={setSelectedEmployee}>
                  <SelectTrigger id="employee-select">
                    <SelectValue placeholder="Choose an employee..." />
                  </SelectTrigger>
                  <SelectContent>
                    {loading ? (
                      <SelectItem value="loading" disabled>Loading employees...</SelectItem>
                    ) : employees.length === 0 ? (
                      <SelectItem value="none" disabled>No employees found</SelectItem>
                    ) : (
                      employees.map((employee) => (
                        <SelectItem key={employee.id} value={employee.id}>
                          <span className="flex items-center gap-2">
                            <User className="h-4 w-4" />
                            {employee.name} ({employee.employee_code})
                          </span>
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>

              {selectedEmployeeData && (
                <div className="p-3 bg-muted rounded-lg space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">API Key:</span>
                    <Button variant="ghost" size="sm" onClick={copyApiKey}>
                      {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                    </Button>
                  </div>
                  <code className="text-xs break-all block">
                    {selectedEmployeeData.api_key.slice(0, 8)}...{selectedEmployeeData.api_key.slice(-4)}
                  </code>
                </div>
              )}

              <Button 
                onClick={() => downloadAgentZip(true)} 
                disabled={isDownloading || !selectedEmployee}
                className="w-full"
                size="lg"
              >
                <Download className="mr-2 h-5 w-5" />
                {isDownloading ? 'Preparing...' : 'Download Personalized Installer'}
              </Button>
              
              <p className="text-xs text-muted-foreground">
                Extract the ZIP and run <code>setup.bat</code>. The agent runs visibly in the system tray.
              </p>
            </CardContent>
          </Card>

          {/* Generic Download Card */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Download className="h-5 w-5" />
                Generic Agent Package
              </CardTitle>
              <CardDescription>
                Download without pre-configured API key
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Button 
                onClick={() => downloadAgentZip(false)} 
                disabled={isDownloading}
                className="w-full"
                variant="outline"
                size="lg"
              >
                <Download className="mr-2 h-5 w-5" />
                {isDownloading ? 'Preparing...' : 'Download Generic Agent'}
              </Button>
              <p className="text-sm text-muted-foreground">
                Add the employee API key to <code>config.json</code> before running <code>setup.bat</code>.
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Installation Steps - Updated */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Zap className="h-5 w-5" />
              One-Click Installation Guide
            </CardTitle>
            <CardDescription>
              Deploying has never been easier
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ol className="space-y-4 text-sm">
              <li className="flex gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-medium">1</span>
                <div>
                  <p className="font-medium">Select employee & download</p>
                  <p className="text-muted-foreground">Choose the employee above and download their personalized installer</p>
                </div>
              </li>
              <li className="flex gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-medium">2</span>
                <div>
                  <p className="font-medium">Extract & run</p>
                  <p className="text-muted-foreground">Extract the ZIP on the employee's PC and double-click <code className="bg-muted px-1 rounded">setup.bat</code></p>
                </div>
              </li>
              <li className="flex gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-medium">3</span>
                <div>
                  <p className="font-medium">Done!</p>
                  <p className="text-muted-foreground">The installer installs dependencies, starts the visible agent, and configures automatic startup at Windows sign-in</p>
                </div>
              </li>
            </ol>
          </CardContent>
        </Card>

        {/* Package Contents */}
        <Card>
          <CardHeader>
            <CardTitle>Package Contents</CardTitle>
            <CardDescription>
              Files included in the agent package
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="divide-y divide-border">
              {files.map((file) => (
                <div key={file.name} className="flex items-center gap-4 py-3">
                  <file.icon className="h-5 w-5 text-muted-foreground" />
                  <div className="flex-1">
                    <p className="font-medium text-sm">{file.name}</p>
                    <p className="text-xs text-muted-foreground">{file.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* System Requirements */}
        <Card>
          <CardHeader>
            <CardTitle>System Requirements</CardTitle>
            <CardDescription>
              The one-click installer handles most requirements automatically
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 text-sm">
              <li className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                Windows 10 or 11
              </li>
              <li className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                Python 3.8+ <span className="text-muted-foreground">(auto-installed if missing)</span>
              </li>
              <li className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                Internet connection
              </li>
            </ul>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
