@echo off
cd /d "%~dp0"
start "PizzPlass - servidor local" /min powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0servidor-local.ps1"
exit /b 0
