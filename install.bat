@echo off
:: Self-elevation check
net session >nul 2>&1
if %errorLevel% == 0 (
    goto :run
) else (
    echo Requesting Administrative Privileges...
    powershell -Command "Start-Process '%~dpnx0' -Verb RunAs"
    exit /b
)

:run
powershell -ExecutionPolicy Bypass -File "%~dp0install.ps1"
pause
