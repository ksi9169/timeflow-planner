@echo off
set "PATH=%PATH%;C:\Program Files\Git\cmd;C:\Program Files\nodejs;%APPDATA%\npm"
cd /d "%~dp0"

call "C:\Program Files\Git\cmd\git.exe" add -A
call "C:\Program Files\Git\cmd\git.exe" commit -m "update: %date% %time%"
call "C:\Program Files\Git\cmd\git.exe" push origin main

if not exist "C:\temp" mkdir "C:\temp"
set "npm_config_cache=C:\temp\npm-cache"
call "C:\Program Files\nodejs\npx.cmd" wrangler deploy
pause
