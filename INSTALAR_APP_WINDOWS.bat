@echo off
setlocal
cd /d "%~dp0"
call npm install
if not exist .env copy .env.example .env >nul
 echo.
 echo Aplicativo instalado. Confira o arquivo .env antes de iniciar.
pause
