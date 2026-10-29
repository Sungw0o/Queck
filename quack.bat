@echo off
rem Quack helper. Double-click or `quack` = build, start, open the browser once it answers.
rem   quack stop      stop containers (data stays in the volume)
rem   quack logs      follow app logs
rem   quack db        start only the DB, for running QuackApplication from IntelliJ
rem   quack backup    dump the DB to backups\quack-YYYYMMDD-HHMM.sql, drop dumps older than 30 days
rem   quack schedule  register (or update) the daily "Quack backup" task in Task Scheduler
rem   quack smoke     run scripts/smoke.sh against the running app
cd /d "%~dp0"
if "%~1"=="" goto up
if /i "%~1"=="stop" (docker compose stop & exit /b)
if /i "%~1"=="logs" (docker compose logs -f app & exit /b)
if /i "%~1"=="db" (docker compose up -d db & exit /b)
if /i "%~1"=="backup" goto backup
if /i "%~1"=="schedule" goto schedule
if /i "%~1"=="smoke" (bash scripts/smoke.sh & exit /b)
echo usage: quack [stop^|logs^|db^|backup^|schedule^|smoke]
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
rem Dump to .tmp first: a failed run must never overwrite a good dump with the same name.
docker compose exec -T db pg_dump -U postgres postgres > backups\dump.tmp || (
  del backups\dump.tmp
  echo %ts% FAILED, is Docker running?>> backups\backup.log
  echo backup failed. Is Docker running?
  exit /b 1
)
move /y backups\dump.tmp backups\quack-%ts%.sql >nul
rem Prune only after a successful dump, so a run of failures never empties the folder.
forfiles /p backups /m quack-*.sql /d -30 /c "cmd /c del @path" 2>nul
echo %ts% ok>> backups\backup.log
echo saved backups\quack-%ts%.sql
exit /b

:schedule
rem Daily at 12:00; StartWhenAvailable runs a missed backup at the next logon. Battery is allowed: this is a laptop and a dump takes seconds.
powershell -NoProfile -Command "$a = New-ScheduledTaskAction -Execute '%~f0' -Argument 'backup' -WorkingDirectory '%~dp0'; $t = New-ScheduledTaskTrigger -Daily -At 12:00; $s = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Minutes 10); Register-ScheduledTask -TaskName 'Quack backup' -Action $a -Trigger $t -Settings $s -Description 'Daily pg_dump of the Quack DB into backups\, keeps 30 days' -Force | Out-Null; Get-ScheduledTask 'Quack backup' | Format-Table TaskName, State -AutoSize"
exit /b
