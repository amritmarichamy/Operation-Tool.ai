@echo off
REM Use if the normal installer says Access Denied (needs elevated task).
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\Install-CrmAutoStart.ps1" -RunAsAdmin
echo.
pause
