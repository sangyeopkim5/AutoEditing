@echo off
chcp 65001 >nul
REM Premiere Pro Remote Project Creator - Windows Batch Trigger
REM Usage: trigger.bat [project_name]

set SERVER=http://localhost:3000

echo ==================================================
echo Premiere Pro Remote Project Creator
echo ==================================================
echo.

if "%1"=="" (
    echo Creating new project with default name...
    powershell -Command "Invoke-RestMethod -Uri '%SERVER%/create-project' -Method Post -ContentType 'application/json' -Body '{}'"
) else (
    echo Creating project: %1
    powershell -Command "Invoke-RestMethod -Uri '%SERVER%/create-project' -Method Post -ContentType 'application/json' -Body '{\"projectName\": \"%1\"}'"
)

echo.
pause
