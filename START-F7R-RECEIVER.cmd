@echo off
cd /d "%~dp0"
powershell.exe -NoProfile -File "%~dp0receiver\launch.ps1"
pause
