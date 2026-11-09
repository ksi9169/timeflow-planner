@echo off
chcp 65001 >nul
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "$s = Get-ChildItem -Path (Split-Path -Parent (Get-Location).Path) -Filter setup_new_pc.ps1 -Recurse -ErrorAction SilentlyContinue | Select-Object -First 1; if ($s) { & $s.FullName }"
pause
