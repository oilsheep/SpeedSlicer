@echo off
setlocal
cd /d "%~dp0"

set PORT=8000
set URL=http://localhost:%PORT%/index.html

echo =====================================================
echo  SpeedSlicer - Local Launcher
echo =====================================================
echo.

rem --- Try Python 3 (python.exe) ---
where python >nul 2>&1
if %errorlevel%==0 (
    echo [OK] Using Python: python -m http.server %PORT%
    echo      Opening %URL%
    echo      Press Ctrl+C to stop the server.
    echo.
    start "" "%URL%"
    python -m http.server %PORT%
    goto :eof
)

rem --- Try Windows Python launcher (py.exe) ---
where py >nul 2>&1
if %errorlevel%==0 (
    echo [OK] Using Python launcher: py -3 -m http.server %PORT%
    echo      Opening %URL%
    echo      Press Ctrl+C to stop the server.
    echo.
    start "" "%URL%"
    py -3 -m http.server %PORT%
    goto :eof
)

rem --- Fallback to Node.js http-server via npx ---
where npx >nul 2>&1
if %errorlevel%==0 (
    echo [OK] Using Node.js: npx http-server -p %PORT% -c-1
    echo      Opening %URL%
    echo      Press Ctrl+C to stop the server.
    echo.
    start "" "%URL%"
    npx --yes http-server -p %PORT% -c-1 -o /index.html
    goto :eof
)

echo [ERROR] No supported runtime found on PATH.
echo.
echo Please install ONE of the following:
echo   - Python 3:  https://www.python.org/downloads/
echo   - Node.js:   https://nodejs.org/
echo.
pause
exit /b 1
