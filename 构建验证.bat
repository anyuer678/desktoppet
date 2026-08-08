@echo off
cd /d "%~dp0"
echo [1/3] Type check...
call npm run typecheck
if errorlevel 1 goto :fail
echo [2/3] Unit tests...
call npm run test
if errorlevel 1 goto :fail
echo [3/3] Build...
call npm run build
if errorlevel 1 goto :fail
echo.
echo Build OK. Output in out/.
pause
exit /b 0

:fail
echo.
echo FAILED. See messages above.
pause
exit /b 1
