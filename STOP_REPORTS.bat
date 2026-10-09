@echo off
setlocal EnableExtensions
cd /d "%~dp0"
if exist "%~dp0server_settings.bat" call "%~dp0server_settings.bat"
if not defined PORT set "PORT=3001"
for /f "tokens=*" %%P in ('powershell -NoProfile -Command "Get-NetTCPConnection -LocalPort %PORT% -State Listen -ErrorAction SilentlyContinue ^| Select-Object -ExpandProperty OwningProcess -Unique"') do taskkill /PID %%P /T /F >nul 2>&1
echo SAMELCO II Reports stopped on port %PORT%.
exit /b 0
