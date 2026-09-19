@echo off
cd /d "%~dp0"
call npm.cmd install
if errorlevel 1 exit /b 1
call npm.cmd run build
if errorlevel 1 exit /b 1
node dist\cli\index.js setup
