@echo off
setlocal

set "SCRIPT_DIR=%~dp0"
set "APP_DIR=%SCRIPT_DIR%"

if not exist "%APP_DIR%scripts\serve.mjs" (
  if exist "%SCRIPT_DIR%LogicaMirror-main\scripts\serve.mjs" (
    set "APP_DIR=%SCRIPT_DIR%LogicaMirror-main\"
  )
)

if not exist "%APP_DIR%scripts\serve.mjs" (
  echo Could not find the LogicaMirror app files.
  echo Put this file in the app folder, or in the folder that contains LogicaMirror-main.
  pause
  exit /b 1
)

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is required to start LogicaMirror.
  echo Install it from https://nodejs.org/ and run this file again.
  pause
  exit /b 1
)

cd /d "%APP_DIR%" || (
  echo Could not open app directory: "%APP_DIR%"
  pause
  exit /b 1
)

set "APP_PORT=%PORT%"
if not defined APP_PORT set "APP_PORT=4173"
set "APP_URL=http://127.0.0.1:%APP_PORT%"

echo Starting LogicaMirror from "%APP_DIR%"...
echo Opening %APP_URL%
start "" powershell -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -Command "Start-Sleep -Seconds 2; Start-Process '%APP_URL%'"

node scripts\serve.mjs
set "EXIT_CODE=%ERRORLEVEL%"

echo.
if not "%EXIT_CODE%"=="0" (
  echo LogicaMirror stopped with exit code %EXIT_CODE%.
  pause
)

exit /b %EXIT_CODE%
