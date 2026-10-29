@echo off
title HTML-2-Fig Autonomous Studio
cd /d "%~dp0"
echo ========================================================
echo   Starting HTML-2-Fig Visual Studio...
echo ========================================================
echo.

node studio/server.js
pause
