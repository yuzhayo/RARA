@echo off
REM open-chat.bat - reopen THIS chat session, by its ID.
REM
REM Two things have to be right, and the folder is the easy one to get wrong.
REM
REM 1. THE FOLDER. A session is stored under the directory it was started in.
REM    This one was started at C:\ - its transcript is
REM    .claude\projects\C--\017b041c-....jsonl, and "C--" is how C:\ is encoded.
REM    So the cd below goes to C:\, NOT to this file's own folder.
REM
REM 2. THE ID. Not `--continue`: that takes the most recent session for the
REM    folder, and C:\ has three - this one, 25c53162-..., and 9f299d7a-...
REM
REM To list past sessions and pick one by hand instead: claude --resume

cd /d C:\
claude --resume 017b041c-78d9-4174-be4d-6e44f1db515e
