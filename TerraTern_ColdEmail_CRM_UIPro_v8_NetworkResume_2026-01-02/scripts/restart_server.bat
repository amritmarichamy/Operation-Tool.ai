@echo off
setlocal
cd /d "%~dp0"
title Terra Tern CRM — restart on port 8080

echo.
echo [1/3] Stopping old CRM servers (stale Python processes keep OLD code in memory — this fixes 404 on Smart Automation).
echo      a) Anything listening on port 8080
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$ids = Get-NetTCPConnection -LocalPort 8080 -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique; ^
   foreach ($procId in $ids) { try { Stop-Process -Id $procId -Force -ErrorAction Stop; Write-Host ('  Stopped listener PID ' + $procId) } catch { Write-Host ('  Could not stop PID ' + $procId) } }"
echo      b) Every python.exe running server.py from THIS folder
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "Set-Location -LiteralPath '%~dp0'; $here = (Get-Location).Path; ^
   Get-CimInstance Win32_Process -Filter \"Name = 'python.exe'\" | Where-Object { $_.CommandLine -match [regex]::Escape($here) -and $_.CommandLine -match 'server\\.py' } | ForEach-Object { try { Stop-Process -Id $_.ProcessId -Force; Write-Host ('  Stopped server.py PID ' + $_.ProcessId) } catch {} }"
if errorlevel 1 (
  echo Note: If stop failed, close old CMD windows running server.py or run this BAT as Administrator.
)
timeout /t 2 /nobreak >nul

if not exist ".venv\Scripts\python.exe" (
  echo [2/3] Creating virtual environment...
  python -m venv .venv
  call .venv\Scripts\activate.bat
  pip install -r requirements.txt
) else (
  echo [2/3] Using existing .venv
  call .venv\Scripts\activate.bat
  pip install -r requirements.txt -q
)

echo [3/3] Starting Flask from:
echo   %CD%
echo.
echo Open: http://127.0.0.1:8080  —  Health should show build smart-automation-v2
echo.
python server.py
pause
