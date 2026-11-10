@echo off
echo =======================================================
echo    Starting 3D Smart Library Server...
echo =======================================================
cd /d "%~dp0"

REM Find python from uv or system
set "PYTHON_EXE=C:\Users\THARQIYA\AppData\Roaming\uv\python\cpython-3.12-windows-x86_64-none\python.exe"

if not exist "%PYTHON_EXE%" (
    set "PYTHON_EXE=python"
)

echo Opening browser at http://localhost:5050
start http://localhost:5050

echo Running server...
"%PYTHON_EXE%" server.py
pause
