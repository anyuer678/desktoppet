@echo off
cd /d "%~dp0"
echo [1/1] Starting DesktopPet (dev mode, hot reload)...
call npm run dev
echo.
echo DesktopPet stopped.
pause
