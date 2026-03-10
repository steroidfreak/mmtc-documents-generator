@echo off
setlocal

cd /d "%~dp0"

echo Starting MMTC backend and frontend...
echo Backend:  http://localhost:8787
echo Frontend: http://localhost:5173
echo.

start "MMTC Backend" cmd /k "cd /d \"%~dp0backend\" && npm run dev"
start "MMTC Frontend" cmd /k "cd /d \"%~dp0frontend\" && npm run dev -- --host 0.0.0.0"

echo Two windows were opened.
echo Keep them running while you use the app.
echo.
pause
exit /b 0

