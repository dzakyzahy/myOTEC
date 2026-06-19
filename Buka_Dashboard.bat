@echo off
cd /d "%~dp0"
set "PAGE=%~dp0dashboard.html"

where chrome >nul 2>&1 && (start "" chrome "%PAGE%" & exit /b 0)
if exist "%ProgramFiles%\Google\Chrome\Application\chrome.exe" (
  start "" "%ProgramFiles%\Google\Chrome\Application\chrome.exe" "%PAGE%"
  exit /b 0
)
if exist "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" (
  start "" "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" "%PAGE%"
  exit /b 0
)
start "" "%PAGE%"
