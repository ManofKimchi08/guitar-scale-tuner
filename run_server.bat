@echo off
title Guitar Scale Tuner Launcher
echo ===================================================
echo     Guitar Scale Tuner Launcher
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

echo [INFO] Launching Guitar Scale Tuner...
python GuitarScaleTuner.py
