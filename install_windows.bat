@echo off
setlocal enabledelayedexpansion

cd /d "%~dp0"

echo ===============================================
echo MMTC Documents Generator - Windows Setup
echo ===============================================

where node >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Node.js is not installed or not in PATH.
  echo Install Node.js LTS from https://nodejs.org/ and run this again.
  exit /b 1
)

where npm >nul 2>nul
if errorlevel 1 (
  echo [ERROR] npm is not available.
  echo Reinstall Node.js LTS and run this again.
  exit /b 1
)

echo [1/4] Installing backend dependencies...
pushd backend
if exist package-lock.json (
  call npm ci
) else (
  call npm install
)
if errorlevel 1 (
  popd
  echo [ERROR] Backend dependency install failed.
  exit /b 1
)
popd

echo [2/4] Installing frontend dependencies...
pushd frontend
if exist package-lock.json (
  call npm ci
) else (
  call npm install
)
if errorlevel 1 (
  popd
  echo [ERROR] Frontend dependency install failed.
  exit /b 1
)
popd

echo [3/4] Checking Microsoft Office (Word + Excel)...
powershell -NoProfile -NonInteractive -ExecutionPolicy Bypass -Command ^
  "$ErrorActionPreference='Stop';" ^
  "$word=$null; $excel=$null;" ^
  "try { $word=New-Object -ComObject Word.Application; $excel=New-Object -ComObject Excel.Application; exit 0 } catch { exit 1 } finally { if($word){$word.Quit()} if($excel){$excel.Quit()} }"
if errorlevel 1 (
  echo [ERROR] Microsoft Word and Excel desktop apps are required for PDF conversion.
  echo Install Microsoft Office and run this installer again.
  exit /b 1
) else (
  echo [OK] Microsoft Word and Excel automation is available.
)

echo [4/4] Setup complete.
echo.
echo Next step:
echo   Double-click run_windows.bat
echo.
pause
exit /b 0
