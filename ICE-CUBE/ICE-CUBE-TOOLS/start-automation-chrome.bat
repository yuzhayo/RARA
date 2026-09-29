@echo off
REM ===========================================================================
REM  start-automation-chrome.bat
REM
REM  Starts the DEDICATED automation Chrome used by the ICE CUBE tools.
REM
REM  This is its OWN Chrome profile. It is NOT your normal Chrome and it does
REM  NOT touch your normal Chrome profiles.
REM
REM  This profile HAS been copied, moved and renamed, and its Google sign-in
REM  survived all three - measured, not assumed. An earlier warning here said a
REM  moved profile arrives signed out; that proved wrong for this profile, and
REM  it made every move look more dangerous than it was.
REM
REM  What is still absolutely true is the DIFFERENT thing: running a SIGNED-IN
REM  REAL profile through a junction destroyed cookies and account identity on
REM  working accounts. That is why the junction is banned - not this.
REM
REM  Port 9333 is used deliberately, so it can never collide with the real
REM  Chrome's 9222.
REM ===========================================================================

title ICE CUBE - automation Chrome

REM The profile sits BESIDE the workspace, not inside it, and its path is
REM derived from this script's location rather than written down - so moving the
REM whole C:\RARA folder needs no edit here.
REM
REM pushd/popd rather than `for %%I in (...)` : the for form was rejected in
REM this file with "invalid usage of the path operator", and the resolved path
REM is the same either way.
set "TOOLS=%~dp0"
pushd "%~dp0..\.."
set "RARA_ROOT=%CD%"
popd
set "PROFILE=%RARA_ROOT%\BROWSER-AUTOMATION"
set "CHROME=C:\Program Files\Google\Chrome\Application\chrome.exe"
set "PORT=9333"

if not exist "%CHROME%" (
  echo ERROR: Chrome not found at "%CHROME%"
  pause
  exit /b 1
)

echo.
echo  ============================================
echo   ICE CUBE - automation browser
echo  ============================================
echo.
echo   profile : %PROFILE%
echo   port    : %PORT%
echo.
echo   This is a SEPARATE Chrome profile. Your normal
echo   Chrome is not affected.
echo.
echo   To stop it again, run stop-automation-chrome.bat.
echo   Closing the window is not enough.
echo.

REM already running on this port? then there is nothing to do
powershell -NoProfile -Command "try { Invoke-RestMethod -Uri 'http://127.0.0.1:%PORT%/json/version' -TimeoutSec 2 | Out-Null; exit 0 } catch { exit 1 }" >nul 2>&1
if not errorlevel 1 (
  echo   Already running on port %PORT% - nothing to do.
  echo.
  REM ping, not timeout - timeout fails when stdin is redirected
  ping -n 3 127.0.0.1 >nul 2>&1
  exit /b 0
)

echo   Starting...
start "" "%CHROME%" ^
  --user-data-dir="%PROFILE%" ^
  --profile-directory=Default ^
  --remote-debugging-port=%PORT% ^
  --no-first-run ^
  --no-default-browser-check ^
  "https://docs.google.com/spreadsheets/d/1mrju1CMNo_AM82PeBrk2myVWTNOrH_VWkDJHzFT4hR4/edit?gid=1800166641#gid=1800166641"

echo   Waiting for the debug port...
powershell -NoProfile -Command "for ($i=0; $i -lt 30; $i++) { Start-Sleep -Milliseconds 700; try { $r = Invoke-RestMethod -Uri 'http://127.0.0.1:%PORT%/json/version' -TimeoutSec 3; Write-Host ('  ready: ' + $r.Browser) -ForegroundColor Green; exit 0 } catch {} }; Write-Host '  port did not open - check the Chrome window' -ForegroundColor Red"

echo.
echo   Next: run the pipeline from ICE-CUBE-TOOLS
echo      node run-pipeline.js --dry-run
echo      node run-pipeline.js
echo.
pause
