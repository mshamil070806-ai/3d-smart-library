@echo off
title 3D Smart Library
echo =======================================================
echo    Starting 3D Smart Library Interactive Web App...
echo =======================================================
cd /d "%~dp0"

REM Find python from uv or system
set "PYTHON_EXE=C:\Users\THARQIYA\AppData\Roaming\uv\python\cpython-3.12-windows-x86_64-none\python.exe"

if not exist "%PYTHON_EXE%" (
    set "PYTHON_EXE=python"
)

echo Checking server status on port 5050...
powershell -Command "if (Get-NetTCPConnection -LocalPort 5050 -ErrorAction SilentlyContinue) { exit 0 } else { exit 1 }"
if %ERRORLEVEL% EQU 0 (
    echo Server is ALREADY running on port 5050!
    echo Opening browser at http://localhost:5050 ...
    start http://localhost:5050
    goto running
)

echo Starting Python Multi-threaded Server...
start /b "" "%PYTHON_EXE%" server.py

echo Waiting 2 seconds for server to initialize...
powershell -Command "Start-Sleep -Seconds 2"

echo Opening browser at http://localhost:5050 ...
start http://localhost:5050

:running
echo.
echo =======================================================
echo   3D Smart Library is live and running!
echo   Local URL: http://localhost:5050
echo   Keep this window open to maintain server connection.
echo =======================================================
echo.
pause
