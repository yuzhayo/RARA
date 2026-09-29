@echo off
REM ===========================================================================
REM  Resume THIS chat session.
REM
REM  The workspace moved to C:\RARA, but a Claude Code session belongs to the
REM  directory it was STARTED in - its transcript lives under
REM  .claude\projects\<encoded-cwd>\. This one was started at C:\VSCODE, so
REM  "C--VSCODE" is its folder and the cd below has to go there, NOT to C:\RARA.
REM
REM  Consequences of resuming here: the agent's cwd is C:\VSCODE, and it loads
REM  the C--VSCODE memory scope - not anything under C:\RARA.
REM
REM  To work with C:\RARA as the starting point instead, run "claude" from
REM  C:\RARA in a normal terminal. That starts a NEW session with its own
REM  transcript and its own memory scope. The project docs it needs are in
REM  C:\RARA\SPREADSHEET\HANDOFF.md.
REM ===========================================================================

title Claude - JATIM RARA session (resumed)
cd /d C:\VSCODE

echo ============================================================
echo  Resuming Claude Code session
echo  b6d5264f-8b35-4fb3-a989-ef16bc66fe45
echo  Working dir : C:\VSCODE   (session is bound here, not C:\RARA)
echo  Project docs: C:\RARA\SPREADSHEET\HANDOFF.md
echo ============================================================
echo.

where claude >nul 2>&1
if errorlevel 1 (
  echo ERROR: "claude" not found on PATH.
  echo Expected at: C:\Users\YUZHA\AppData\Roaming\npm\claude.cmd
  echo.
  pause
  exit /b 1
)

claude --resume b6d5264f-8b35-4fb3-a989-ef16bc66fe45

echo.
echo ---- session ended ----
pause
