$ErrorActionPreference = "Stop"
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
if (-not $config.api_url -or $config.api_url -notmatch '^https://[^/]+\.supabase\.co/functions/v1$') {
    throw "The Supabase Edge Functions URL in config.json is invalid."
}
if (-not $config.publishable_key -or $config.publishable_key -eq "YOUR_SUPABASE_PUBLISHABLE_KEY") {
    throw "The Supabase publishable key is missing from this package. Download a fresh personalized package from the admin dashboard."
}

# Find a real Python installation (not the Microsoft Store execution alias).
$pythonExe = $null
$pythonw = $null
$pythonCmd = Get-Command python.exe -ErrorAction SilentlyContinue
if ($pythonCmd -and $pythonCmd.Source -notlike "$env:LOCALAPPDATA\Microsoft\WindowsApps\*") {
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
$arguments = "`"$scriptPath`""
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
Write-Host "To stop it and disable startup, run turn_off.bat." -ForegroundColor Yellow
