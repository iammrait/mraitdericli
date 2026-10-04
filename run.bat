@echo off
title Directory Submitter - mrait.ca
echo ========================================================
echo   Launching Directory Submitter (mrait.ca)
echo ========================================================
cd /d "%~dp0"

where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Node.js is not installed on this computer!
    echo Please install Node.js from https://nodejs.org and run this again.
    pause
    exit /b
)

if not exist "node_modules" (
    echo [Setup] First time running - installing required packages...
    call npm install
)

echo [Starting] Opening your web browser to http://localhost:3000...
call npm start
pause
