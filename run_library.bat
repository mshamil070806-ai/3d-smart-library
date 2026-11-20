@echo off
title 3D Smart Library Launcher
echo =======================================================
echo    Starting 3D Smart Library Interactive Web App...
echo =======================================================
cd /d "%~dp0"

REM Find python from uv or system
set "PYTHON_EXE=C:\Users\THARQIYA\AppData\Roaming\uv\python\cpython-3.12-windows-x86_64-none\python.exe"

if not exist "%PYTHON_EXE%" (
    set "PYTHON_EXE=C:\Users\THARQIYA\AppData\Roaming\uv\python\cpython-3.15-windows-x86_64-none\python.exe"
)

if not exist "%PYTHON_EXE%" (
    set "PYTHON_EXE=python"
)

echo Checking server status on port 5050...
powershell -Command "try { $r = Invoke-WebRequest -Uri 'http://localhost:5050/api/books' -TimeoutSec 2 -UseBasicParsing; exit 0 } catch { exit 1 }"
if %ERRORLEVEL% EQU 0 (
    echo Server is ALREADY active on port 5050!
    echo Opening browser at http://localhost:5050 ...
    if exist "C:\Program Files\Google\Chrome\Application\chrome.exe" (
        start "" "C:\Program Files\Google\Chrome\Application\chrome.exe" --enable-webgl --ignore-gpu-blocklist http://localhost:5050
    ) else (
        start http://localhost:5050
    )
    goto running
)

echo Starting Python Multi-threaded Server in background...
start "3D Smart Library Server" /min "%PYTHON_EXE%" server.py

echo Waiting for server to initialize...
powershell -Command "for ($i=0; $i -lt 12; $i++) { try { $r = Invoke-WebRequest -Uri 'http://localhost:5050/api/books' -TimeoutSec 1 -UseBasicParsing; exit 0 } catch { Start-Sleep -Milliseconds 500 } }; exit 1"

echo Opening browser at http://localhost:5050 ...
if exist "C:\Program Files\Google\Chrome\Application\chrome.exe" (
    start "" "C:\Program Files\Google\Chrome\Application\chrome.exe" --enable-webgl --ignore-gpu-blocklist http://localhost:5050
) else (
    start http://localhost:5050
)

:running
echo.
echo =======================================================
echo   3D Smart Library is live and running!
echo   Local URL: http://localhost:5050
echo   Keep this window open to maintain server connection.
echo =======================================================
echo.
pause
