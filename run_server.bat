@echo off
title ASIO WebSocket Server Launcher
echo ===================================================
echo     ASIO Audio WebSocket Server Quick Launcher
echo ===================================================
echo.

:: Check if Python is installed
python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Python is not installed or not in your PATH.
    echo Please install Python 3.8+ and try again.
    pause
    exit /b
)

echo [INFO] Listing available audio input devices...
echo.
python asio_server.py --list
echo.
echo ===================================================
set /p DEVICE_ID="Enter your input device index number (e.g. 46): "

echo.
echo [INFO] Starting ASIO WebSocket Server on device #%DEVICE_ID%...
start "ASIO WebSocket Server" python asio_server.py --device %DEVICE_ID%

echo [INFO] Starting HTTPS Local Web Server...
python run_https_server.py

pause
