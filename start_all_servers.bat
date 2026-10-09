@echo off
setlocal EnableExtensions

set "APP_DIR=%~dp0"
if exist "%APP_DIR%server_settings.bat" call "%APP_DIR%server_settings.bat"
if not defined PORT set "PORT=3001"
if not defined REPORT_HOST set "REPORT_HOST=127.0.0.1"
if not defined NODE_EXE if exist "%APP_DIR%runtime\node.exe" set "NODE_EXE=%APP_DIR%runtime\node.exe"
if not defined NODE_EXE set "NODE_EXE=C:\Users\SAMELCO II\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
if not defined MYSQL_EXE if exist "%APP_DIR%runtime\mysql.exe" set "MYSQL_EXE=%APP_DIR%runtime\mysql.exe"
set "SERVER_SCRIPT=%APP_DIR%api_server.mjs"

if /i "%~1"=="server" goto run_server

if not exist "%SERVER_SCRIPT%" (
  echo ERROR: Server script not found: "%SERVER_SCRIPT%"
  pause
  exit /b 1
)

if not exist "%NODE_EXE%" (
  where node.exe >nul 2>&1
  if errorlevel 1 (
    echo ERROR: Node.js was not found.
    pause
    exit /b 1
  )
  set "NODE_EXE=node.exe"
)

powershell -NoProfile -Command "if (Get-NetTCPConnection -LocalPort %PORT% -State Listen -ErrorAction SilentlyContinue) { exit 0 } else { exit 1 }"
if not errorlevel 1 (
  echo SAMELCO II Reports is already running on port %PORT%.
  goto show_urls
)

echo Starting SAMELCO II API and web reports...
start "SAMELCO II Reports - Port %PORT%" /min "%ComSpec%" /k call "%~f0" server

echo Waiting for the server health check...
powershell -NoProfile -Command "$url='http://127.0.0.1:%PORT%/api/health'; 1..30 | ForEach-Object { try { $r=Invoke-RestMethod $url -TimeoutSec 1; if ($r.ok) { exit 0 } } catch {}; Start-Sleep -Milliseconds 500 }; exit 1"
if errorlevel 1 (
  echo ERROR: The reports server did not become ready.
  pause
  exit /b 1
)

echo Server started successfully.

:show_urls
echo.
echo SAMELCO II report URLs
echo ----------------------
echo Tables:                http://127.0.0.1:%PORT%/
echo Graphs:                http://127.0.0.1:%PORT%/visual-report
echo Cash Flow:             http://127.0.0.1:%PORT%/cash-flow
echo Collection Monitoring: http://127.0.0.1:%PORT%/collection-monitoring
echo Collection Components: http://127.0.0.1:%PORT%/collection-components
echo Collector Performance: http://127.0.0.1:%PORT%/collector-report
echo API Health:            http://127.0.0.1:%PORT%/api/health
if /i not "%REPORT_HOST%"=="127.0.0.1" echo LAN access:            http://THIS-SERVER-IP:%PORT%/
echo.
exit /b 0

:run_server
title SAMELCO II Reports - Port %PORT%
cd /d "%APP_DIR%"
echo Keep this window open while using the reports.
echo Press Ctrl+C to stop the server.
echo.
"%NODE_EXE%" "%SERVER_SCRIPT%"
if errorlevel 1 (
  echo.
  echo The reports server stopped with an error.
  pause
)
exit /b %errorlevel%
