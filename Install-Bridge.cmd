@echo off
"%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe" -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0windows\Install-Bridge.ps1" %*
set "BridgeExitCode=%ERRORLEVEL%"
echo.
pause
exit /b %BridgeExitCode%
