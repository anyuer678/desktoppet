@echo off
cd /d "%~dp0"
echo [1/2] Type check...
call npm run typecheck
if errorlevel 1 goto :fail
echo [2/2] Unit tests...
call npm run test
if errorlevel 1 goto :fail
echo.
echo All checks passed.
pause
exit /b 0

:fail
echo.
echo FAILED. See messages above.
pause
exit /b 1
