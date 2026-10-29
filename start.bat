@echo off
cd /d "%~dp0"
docker compose up -d --build || (pause & exit /b 1)
start http://localhost:8765
