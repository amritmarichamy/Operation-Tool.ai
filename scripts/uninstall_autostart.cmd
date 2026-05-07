@echo off
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\Uninstall-CrmAutoStart.ps1"
echo.
pause
