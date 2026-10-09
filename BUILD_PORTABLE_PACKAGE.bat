@echo off
setlocal
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0BUILD_PORTABLE_PACKAGE.ps1"
if errorlevel 1 (
  echo.
  echo Package build failed.
  pause
  exit /b 1
)
echo.
echo Portable installer package created successfully.
echo outputs\SAMELCO-II-Reports-Portable.zip
pause
exit /b 0
