@echo off
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
pause
