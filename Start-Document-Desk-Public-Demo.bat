@echo off
setlocal
cd /d "%~dp0"

if exist "%~dp0.venv\Scripts\python.exe" (
  start "Document Desk Server" /B "%~dp0.venv\Scripts\python.exe" server.py --host 127.0.0.1 --port 8000 --no-browser
) else (
  start "Document Desk Server" /B python server.py --host 127.0.0.1 --port 8000 --no-browser
)
ping 127.0.0.1 -n 3 >nul

where cloudflared >nul 2>&1
if errorlevel 1 (
  echo Cloudflared is not installed or is not available on PATH.
  echo Install it with: winget install --id Cloudflare.cloudflared
  pause
  exit /b 1
)
cloudflared tunnel --url http://127.0.0.1:8000
pause
