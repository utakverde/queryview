@echo off
setlocal
cd /d "%~dp0"
set "PYTHON_EXE=C:\Users\SAMELCO II\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe"
if not exist "%PYTHON_EXE%" set "PYTHON_EXE=python"
start "Beneficiary Batch Posting" /min "%PYTHON_EXE%" "%~dp0beneficiary_app.py" serve
timeout /t 2 /nobreak >nul
start "" "http://127.0.0.1:3002/"
