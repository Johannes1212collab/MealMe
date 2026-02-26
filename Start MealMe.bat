@echo off
title MealMe Launcher
cd /d "c:\Users\GGPC\Desktop\MealMe"

echo =======================================
echo     Starting MealMe Local Servers
echo =======================================
echo.

echo [1/3] Starting Node.js Backend API (Port 3001)...
start "MealMe Backend AI Engine" cmd /k "node server/index.js"

echo [2/3] Starting Vite Frontend UI (Port 5173)...
start "MealMe Frontend Web Server" cmd /k "npm run dev"

echo [3/3] Waiting 3 seconds for Vite engine to compile...
timeout /t 3 /nobreak >nul

echo Launching App in your default Browser!
start http://localhost:5173

exit
