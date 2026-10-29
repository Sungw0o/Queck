@echo off
rem Quack helper. Double-click or `quack` = build, start, open the browser once it answers.
rem   quack stop     stop containers (data stays in the volume)
rem   quack logs     follow app logs
rem   quack db       start only the DB, for running QuackApplication from IntelliJ
rem   quack backup   dump the DB to backups\quack-YYYYMMDD-HHMM.sql
rem   quack smoke    run scripts/smoke.sh against the running app
cd /d "%~dp0"
if "%~1"=="" goto up
if /i "%~1"=="stop" (docker compose stop & exit /b)
if /i "%~1"=="logs" (docker compose logs -f app & exit /b)
if /i "%~1"=="db" (docker compose up -d db & exit /b)
if /i "%~1"=="backup" goto backup
if /i "%~1"=="smoke" (bash scripts/smoke.sh & exit /b)
echo usage: quack [stop^|logs^|db^|backup^|smoke]
exit /b 1

:up
docker compose up -d --build || (pause & exit /b 1)
echo Waiting for Quack...
set n=0
:wait
set /a n+=1
if %n% gtr 90 (echo Quack did not answer in 90s. Check: quack logs & pause & exit /b 1)
curl -sf -o nul http://localhost:8765/api/items || (ping -n 2 127.0.0.1 >nul & goto wait)
start http://localhost:8765
exit /b

:backup
if not exist backups mkdir backups
for /f %%t in ('powershell -NoProfile -Command "Get-Date -Format yyyyMMdd-HHmm"') do set ts=%%t
docker compose exec -T db pg_dump -U postgres postgres > backups\quack-%ts%.sql || exit /b 1
echo saved backups\quack-%ts%.sql
