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

set "NODE_EXE="
where node >nul 2>nul
if not errorlevel 1 set "NODE_EXE=node"
if not defined NODE_EXE if exist "%ProgramFiles%\nodejs\node.exe" set "NODE_EXE=%ProgramFiles%\nodejs\node.exe"
if not defined NODE_EXE if exist "%ProgramFiles(x86)%\nodejs\node.exe" set "NODE_EXE=%ProgramFiles(x86)%\nodejs\node.exe"
if not defined NODE_EXE if exist "%LOCALAPPDATA%\Programs\nodejs\node.exe" set "NODE_EXE=%LOCALAPPDATA%\Programs\nodejs\node.exe"
if not defined NODE_EXE if exist "%USERPROFILE%\AppData\Local\Programs\nodejs\node.exe" set "NODE_EXE=%USERPROFILE%\AppData\Local\Programs\nodejs\node.exe"
if not defined NODE_EXE if exist "%LOCALAPPDATA%\Volta\bin\node.exe" set "NODE_EXE=%LOCALAPPDATA%\Volta\bin\node.exe"

if not defined NODE_EXE (
  echo Node.js is required to start LogicaMirror.
  echo If Node.js is already installed, close this window and run start-app.bat normally, not as administrator.
  echo Administrator windows can miss user-only Node.js installs.
  echo Otherwise install Node.js from https://nodejs.org/ and run this file again.
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
echo Using Node.js: %NODE_EXE%
echo Opening %APP_URL%
start "" /b cmd /c "timeout /t 2 /nobreak >nul && start "" %APP_URL%"

"%NODE_EXE%" scripts\serve.mjs
set "EXIT_CODE=%ERRORLEVEL%"

echo.
if not "%EXIT_CODE%"=="0" (
  echo LogicaMirror stopped with exit code %EXIT_CODE%.
  pause
)

exit /b %EXIT_CODE%
