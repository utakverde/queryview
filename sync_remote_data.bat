@echo off
setlocal EnableExtensions
set "APP_DIR=%~dp0"
if exist "%APP_DIR%server_settings.bat" call "%APP_DIR%server_settings.bat"

call "%APP_DIR%start_all_servers.bat"
if errorlevel 1 exit /b 1

if not defined NODE_EXE set "NODE_EXE=C:\Users\SAMELCO II\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
if not exist "%NODE_EXE%" set "NODE_EXE=node.exe"

echo.
echo Syncing remote MySQL report data into local SQLite...
"%NODE_EXE%" "%APP_DIR%sync_remote_data.mjs" %*
if errorlevel 1 (
  echo Sync failed. Check server_settings.bat and remote MySQL access.
  exit /b 1
)

echo Local database updated: portable_data\reporting_cache.sqlite
exit /b 0
