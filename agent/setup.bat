@echo off
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
pause
