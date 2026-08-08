@echo off
title ASIO & HTTPS Server Launcher
echo ===================================================
echo     Guitar Scale Tuner - Automatic Dual Server
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

echo [INFO] Starting ASIO Audio WebSocket Server...
start "ASIO Audio Server" python asio_server.py

echo [INFO] Starting HTTPS Local Web Server...
start "HTTPS Web Server" python run_https_server.py

echo.
echo [SUCCESS] Both servers are running!
echo Open your browser at: https://localhost:8000
echo Select your audio interface directly inside the UI!
echo.
pause
