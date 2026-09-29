@echo off
REM ===========================================================================
REM  Resume THIS opencode session.
REM
REM  Session : ses_f157f6639ffe3fIictGfkm1r8a
REM  Title   : Memahami HANDOFF.md spreadsheet
REM  Started : C:\RARA  (session is bound here)
REM  Docs    : C:\RARA\SPREADSHEET\HANDOFF.md
REM
REM  Double-click to reopen this exact session.
REM  Uses --session (ID), not --continue (that takes the most recent session).
REM ===========================================================================

title Opencode - RARA session (resumed)
cd /d C:\RARA

echo ============================================================
echo  Resuming opencode session
echo  ses_f157f6639ffe3fIictGfkm1r8a
echo  Working dir : C:\RARA
echo  Project docs: C:\RARA\SPREADSHEET\HANDOFF.md
echo ============================================================
echo.

where opencode >nul 2>&1
if errorlevel 1 (
  echo ERROR: "opencode" not found on PATH.
  echo Expected at: C:\Users\YUZHA\AppData\Roaming\npm\opencode.cmd
  echo.
  pause
  exit /b 1
)

opencode --session ses_f157f6639ffe3fIictGfkm1r8a

echo.
echo ---- session ended ----
pause
