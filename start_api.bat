@echo off
setlocal

call "%~dp0start_all_servers.bat" server
exit /b %errorlevel%
