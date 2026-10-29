@echo off
title HTML-2-Fig Autonomous Studio
echo ========================================================
echo   Starting HTML-2-Fig Visual Studio...
echo ========================================================
echo.

start "" "http://localhost:4242"
node studio/server.js
pause
