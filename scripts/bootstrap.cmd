@echo off
setlocal
cd /d "%~dp0\.."

where python >nul 2>nul
if errorlevel 1 (
  echo Python 3.11 or newer is required.
  exit /b 1
)
where npm >nul 2>nul
if errorlevel 1 (
  echo npm is required (Node.js 18 or newer).
  exit /b 1
)

python -m venv .venv
.venv\Scripts\python -m pip install -U pip
.venv\Scripts\python -m pip install -e "producer[live,binary]"
call npm ci
if errorlevel 1 exit /b 1
call npm run build
if errorlevel 1 exit /b 1
.venv\Scripts\traceviewer doctor

echo.
echo TraceViewer is ready on this machine.
echo.
echo Author a presentation:
echo   .venv\Scripts\traceviewer dev presentations.example
echo.
echo Build a standalone CLI for this OS and architecture:
echo   .venv\Scripts\python scripts\build_binary.py
echo.
echo Documentation:
echo   docs\BUILD.md
echo   docs\AUTHORING.md
