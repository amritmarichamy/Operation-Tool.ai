@echo off
REM Terra Tern CRM — 24/7 loop: restart server after crash or exit.
cd /d "%~dp0"

set "PY=%~dp0.venv\Scripts\python.exe"
if not exist "%PY%" (
  echo [CRM] Missing .venv — run: python -m venv .venv ^&^& .venv\Scripts\pip install -r requirements.txt
  pause
  exit /b 1
)

:loop
echo.
echo [%date% %time%] [CRM] Starting server...
"%PY%" "%~dp0server.py"
echo [%date% %time%] [CRM] Stopped. Restart in 5 seconds...
timeout /t 5 /nobreak >nul
goto loop
