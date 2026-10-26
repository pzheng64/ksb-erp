@echo off
setlocal
cd /d "%~dp0"
set "NEXT_TELEMETRY_DISABLED=1"
set "PYTHONNOUSERSITE=1"
set "npm_config_offline=true"
set "PATH=%~dp0runtime\node;%PATH%"

if not exist "%~dp0runtime\python\python.exe" (
  echo Portable Python is missing from runtime\python.
  exit /b 1
)
if not exist "%~dp0runtime\node\node.exe" (
  echo Portable Node.js is missing from runtime\node.
  exit /b 1
)
if not exist "%~dp0frontend\node_modules\next" (
  echo frontend\node_modules is missing. Copy it with the project. Packages are not downloaded.
  exit /b 1
)

start "KSB API" /D "%~dp0backend" "%~dp0runtime\python\python.exe" -m uvicorn app.main:app --host 127.0.0.1 --port 8001
cd /d "%~dp0frontend"
"%~dp0runtime\node\npm.cmd" run dev -- --hostname 127.0.0.1 --port 3000
