@echo off
REM ===========================================================================
REM  stop-automation-chrome.bat
REM
REM  Stops the DEDICATED automation Chrome used by the ICE CUBE tools.
REM
REM  Your normal Chrome is NOT affected: it runs from the default profile path,
REM  and this only closes processes whose command line names the automation
REM  profile.
REM
REM  >!< It does NOT force-kill. CloseMainWindow() and then WAIT for the process
REM      count to reach zero. A force-kill during shutdown can corrupt profile
REM      state - that is what destroyed a Google sign-in on 2026-09-26, and it
REM      was done twice after being warned. If the processes will not close, the
REM      script says so instead of escalating.
REM
REM  The work lives in stop-automation-chrome.ps1 beside this file, so the logic
REM  is readable and testable on its own.
REM ===========================================================================

title ICE CUBE - stop automation Chrome

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0stop-automation-chrome.ps1"
set "RC=%ERRORLEVEL%"

echo.
if not "%RC%"=="0" (
  echo   Exited with code %RC% - see the message above.
) else (
  echo   Done.
)
echo.
pause
exit /b %RC%
