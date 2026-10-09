@echo off
setlocal

set "NODE_EXE=C:\Users\SAMELCO II\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
set "SCRIPT=%~dp0.workbook_build\build_summary.mjs"
set "CONFIG=%~dp0.workbook_build\builder.config.json"

if not exist "%NODE_EXE%" (
  echo Node runtime not found: "%NODE_EXE%"
  exit /b 1
)

if not exist "%SCRIPT%" (
  echo Builder script not found: "%SCRIPT%"
  exit /b 1
)

set "CONFIG_ARG=%~1"
if "%CONFIG_ARG%"=="" set "CONFIG_ARG=%CONFIG%"

"%NODE_EXE%" "%SCRIPT%" "%CONFIG_ARG%"
if errorlevel 1 (
  echo Build failed.
  exit /b 1
)

echo Build completed successfully.
exit /b %errorlevel%
