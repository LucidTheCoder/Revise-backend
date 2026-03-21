@echo off
setlocal
cd /d "%~dp0"

echo Starting local server at http://localhost:5500
start "" http://localhost:5500

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0serve.ps1" -Port 5500
