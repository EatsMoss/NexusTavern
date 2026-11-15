@echo off
title NexusTavern (Dev Server + LAN Mode)
cd /d "%~dp0"

:: Automatically free ports 8088 and 5173 if left open from a previous session
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":8088 :5173" ^| findstr "LISTENING"') do (
  taskkill /F /PID %%a >nul 2>&1
)

call npm.cmd run dev
pause
