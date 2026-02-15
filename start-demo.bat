@echo off
title N. Allen Classics - Demo
echo.
echo  N. Allen Classics - Barber Appointment Demo
echo  ===========================================
echo.

cd /d "%~dp0"

where node >nul 2>nul
if %errorlevel% neq 0 (
  echo  [ERROR] Node.js is not installed or not in PATH.
  echo  Please install Node.js from https://nodejs.org and try again.
  pause
  exit /b 1
)

echo  Installing/checking backend...
if not exist "backend\node_modules" (
  cd backend
  call npm install
  cd ..
)

echo.
echo  Starting demo server...
echo  When you see "On your phone" below, use that URL on your mobile.
echo.
cd backend
node server.js
pause
