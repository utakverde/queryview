@echo off
setlocal EnableExtensions
cd /d "%~dp0"
call "%~dp0start_all_servers.bat"
if errorlevel 1 exit /b 1
if exist "%~dp0server_settings.bat" call "%~dp0server_settings.bat"
if not defined PORT set "PORT=3001"
start "" "http://127.0.0.1:%PORT%/"
exit /b 0
