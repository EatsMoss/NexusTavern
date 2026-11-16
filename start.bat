@echo off
setlocal EnableExtensions
title NexusTavern
cd /d "%~dp0"

echo ==================================================
echo   NexusTavern Launcher
echo ==================================================
echo.

:: 1. Verify Node.js & npm are installed
where node >nul 2>&1
if errorlevel 1 (
  echo [ERROR] Node.js is not installed or not added to PATH.
  echo Please install Node.js LTS ^(v20 or newer^) from:
  echo   https://nodejs.org/
  echo.
  pause
  exit /b 1
)

where npm.cmd >nul 2>&1
if errorlevel 1 (
  echo [ERROR] npm was not found in PATH.
  echo Please reinstall Node.js LTS from https://nodejs.org/
  echo.
  pause
  exit /b 1
)

:: 2. Detect git revision so `git pull` automatically rebuilds the frontend
set "CURRENT_REV="
where git >nul 2>&1
if not errorlevel 1 (
  if exist ".git" (
    for /f "delims=" %%r in ('git rev-parse HEAD 2^>nul') do set "CURRENT_REV=%%r"
  )
)

set "SAVED_REV="
if exist "dist\.build-rev" (
  set /p SAVED_REV=<"dist\.build-rev"
)

:: 3. Install dependencies automatically on first launch
if not exist "node_modules\" (
  echo Installing dependencies ^(first-time setup^)...
  call npm.cmd install --no-audit --no-fund
  if errorlevel 1 (
    echo.
    echo [ERROR] Failed to install dependencies.
    pause
    exit /b 1
  )
  echo.
)

:: 4. Build production frontend if `dist` is missing or repo was updated via `git pull`
set "NEED_BUILD=0"
if not exist "dist\index.html" set "NEED_BUILD=1"
if defined CURRENT_REV (
  if not "%CURRENT_REV%"=="%SAVED_REV%" set "NEED_BUILD=1"
)

if "%NEED_BUILD%"=="1" (
  echo Building NexusTavern frontend...
  call npm.cmd run build
  if errorlevel 1 (
    echo.
    echo Syncing packages after update and retrying build...
    call npm.cmd install --no-audit --no-fund
    if errorlevel 1 (
      echo.
      echo [ERROR] Package installation failed.
      pause
      exit /b 1
    )
    call npm.cmd run build
    if errorlevel 1 (
      echo.
      echo [ERROR] Frontend build failed.
      pause
      exit /b 1
    )
  )
  if defined CURRENT_REV (
    echo %CURRENT_REV%>"dist\.build-rev"
  )
  echo.
)

:: 5. Automatically free port 8088 if left open from a previous session
set "APP_PORT=%NEXUSTAVERN_SERVER_PORT%"
if not defined APP_PORT set "APP_PORT=8088"
for /f "tokens=5" %%a in ('netstat -aon ^| findstr /C:":%APP_PORT% " ^| findstr "LISTENING"') do (
  if not "%%a"=="0" taskkill /F /PID %%a >nul 2>&1
)

:: 6. Start NexusTavern standalone server & open browser
call npm.cmd start
pause
