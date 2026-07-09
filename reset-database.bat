@echo off
echo ========================================
echo Resetting Database for First-Run Test
echo ========================================
echo.
echo WARNING: This will delete ALL users and workspaces!
echo Press Ctrl+C to cancel, or
pause

cd /d "%~dp0server"

echo.
echo Running reset script...
psql -U postgres -d petrol_pump_management -f db/reset-for-testing.sql

if %ERRORLEVEL% EQU 0 (
    echo.
    echo ========================================
    echo Database reset successful!
    echo ========================================
    echo.
    echo Now restart your frontend dev server:
    echo   cd client
    echo   npm run dev
    echo.
    echo Then visit http://localhost:5173
    echo You should see the 4-step onboarding wizard.
) else (
    echo.
    echo ERROR: Database reset failed!
    echo Make sure PostgreSQL is running and credentials are correct.
)

pause
