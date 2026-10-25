@echo off
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Install Node.js 24 LTS from https://nodejs.org then reopen this launcher.
  pause
  exit /b 1
)
node "%~dp0receiver\launch.mjs"
pause
