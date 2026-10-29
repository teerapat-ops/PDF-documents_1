@echo off
setlocal
cd /d "%~dp0"

net session >nul 2>&1
if %errorlevel% neq 0 (
  powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
  exit /b
)

netsh advfirewall firewall delete rule name="Document Desk LAN" >nul 2>&1
netsh advfirewall firewall add rule name="Document Desk LAN" dir=in action=allow protocol=TCP localport=8000 profile=domain,private

if exist "%~dp0.venv\Scripts\python.exe" (
  "%~dp0.venv\Scripts\python.exe" server.py --host 0.0.0.0 --no-browser
) else (
  python server.py --host 0.0.0.0 --no-browser
)
pause
