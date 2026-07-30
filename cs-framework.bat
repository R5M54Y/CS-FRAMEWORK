@echo off
title WhatsApp CS Framework Starter

echo ============================================
echo   WhatsApp CS Framework
echo ============================================
echo.

echo Killing anything using port 3000...

for /f "tokens=5" %%p in ('netstat -ano ^| findstr ":3000"') do (
    taskkill /F /PID %%p >nul 2>&1
)

timeout /t 1 >nul

cd /c C:\CS-FRAMEWORK

echo.
echo Starting application...
echo.

call npm start

pause