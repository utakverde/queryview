@echo off
setlocal

set "NODE_EXE=C:\Users\SAMELCO II\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
set "SCRIPT=%~dp0api_server.mjs"

if not exist "%NODE_EXE%" (
  echo Node runtime not found: "%NODE_EXE%"
  exit /b 1
)

if not exist "%SCRIPT%" (
  echo API script not found: "%SCRIPT%"
  exit /b 1
)

echo Starting API server on http://127.0.0.1:3000
"%NODE_EXE%" "%SCRIPT%"
