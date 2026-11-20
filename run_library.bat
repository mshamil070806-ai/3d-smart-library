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

REM Detect Chrome or Edge to launch with CPU-safe WebGL flags (zero GPU required)
set "BROWSER_EXE=C:\Program Files\Google\Chrome\Application\chrome.exe"
if not exist "%BROWSER_EXE%" set "BROWSER_EXE=C:\Program Files (x86)\Google\Chrome\Application\chrome.exe"
if not exist "%BROWSER_EXE%" set "BROWSER_EXE=C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
if not exist "%BROWSER_EXE%" set "BROWSER_EXE=C:\Program Files\Microsoft\Edge\Application\msedge.exe"

set "BROWSER_FLAGS=--user-data-dir="%TEMP%\smart_library_profile" --ignore-gpu-blocklist --enable-webgl --disable-gpu-watchdog"

echo Checking server status on port 5050...
powershell -Command "try { $r = Invoke-WebRequest -Uri 'http://localhost:5050/api/books' -TimeoutSec 2 -UseBasicParsing; exit 0 } catch { exit 1 }"
if %ERRORLEVEL% EQU 0 (
    echo Server is ALREADY active on port 5050!
    echo Opening browser with GPU-free CPU flags at http://localhost:5050 ...
    if exist "%BROWSER_EXE%" (
        start "" "%BROWSER_EXE%" %BROWSER_FLAGS% http://localhost:5050
    ) else (
        start http://localhost:5050
    )
    goto running
)

echo Starting Python Multi-threaded Server in background...
start "3D Smart Library Server" /min "%PYTHON_EXE%" server.py

echo Waiting for server to initialize...
powershell -Command "for ($i=0; $i -lt 12; $i++) { try { $r = Invoke-WebRequest -Uri 'http://localhost:5050/api/books' -TimeoutSec 1 -UseBasicParsing; exit 0 } catch { Start-Sleep -Milliseconds 500 } }; exit 1"

echo Opening browser with GPU-free CPU flags at http://localhost:5050 ...
if exist "%BROWSER_EXE%" (
    start "" "%BROWSER_EXE%" %BROWSER_FLAGS% http://localhost:5050
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
