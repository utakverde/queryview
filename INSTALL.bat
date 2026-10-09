@echo off
setlocal EnableExtensions
title SAMELCO II Reports Setup
cd /d "%~dp0"

echo =====================================================
echo             SAMELCO II REPORTS SETUP
echo =====================================================
echo.

if not exist "runtime\node.exe" (
  echo ERROR: Bundled Node.js runtime is missing.
  echo Use the complete portable installation package.
  pause
  exit /b 1
)
if not exist "runtime\mysql.exe" (
  echo ERROR: Bundled MySQL client is missing.
  echo Use the complete portable installation package.
  pause
  exit /b 1
)

call "%~dp0CONFIGURE.bat"
if errorlevel 1 exit /b 1

echo.
echo Creating desktop shortcuts...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$desktop=[Environment]::GetFolderPath('Desktop'); $shell=New-Object -ComObject WScript.Shell; $items=@(@('SAMELCO II Reports','OPEN_REPORTS.bat'),@('Start SAMELCO II Reports','start_all_servers.bat'),@('Stop SAMELCO II Reports','STOP_REPORTS.bat'),@('Configure SAMELCO II Reports','CONFIGURE.bat')); foreach($item in $items){$shortcut=$shell.CreateShortcut((Join-Path $desktop ($item[0]+'.lnk'))); $shortcut.TargetPath=(Join-Path '%~dp0' $item[1]); $shortcut.WorkingDirectory='%~dp0'; $shortcut.IconLocation='%%SystemRoot%%\System32\shell32.dll,13'; $shortcut.Save()}"
if errorlevel 1 (
  echo WARNING: Desktop shortcuts could not be created. The BAT files still work.
) else (
  echo Desktop shortcuts created.
)

echo.
echo Installation completed successfully.
echo The reports will now start and open in your browser.
call "%~dp0OPEN_REPORTS.bat"
exit /b %errorlevel%
