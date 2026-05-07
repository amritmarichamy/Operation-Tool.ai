@echo off
setlocal
cd /d "%~dp0"
title Terra Tern CRM — port 8080

if not exist ".venv\Scripts\python.exe" (
  echo Creating virtual environment...
  python -m venv .venv
)
call .venv\Scripts\activate.bat
pip install -r requirements.txt -q
echo Starting from: %CD%
python server.py
pause
