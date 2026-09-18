@echo off
chcp 65001 > nul
title QP Commercial Engine - Lanzador de Sistema

echo ======================================================================
echo   🚀 INICIANDO QP COMMERCIAL ENGINE (THE QUANT PARTNERS)
echo ======================================================================
echo.

if not exist ".env" (
    echo [!] Archivo de configuración .env no encontrado.
    echo [i] Por favor lee el archivo AI_BOOTSTRAP_PROMPT.txt y pídele a tu IA
    echo     que configure el sistema por ti primero.
    echo.
    pause
    exit /b 1
)

echo [*] Verificando Docker en tu equipo...
docker --version > nul 2>&1
if %errorlevel% neq 0 (
    echo [!] Docker no está detectado o no está instalado.
    echo [i] Si usas Node.js, ejecutando vía npm start...
    npm start
    exit /b %errorlevel%
)

echo [*] Levantando contenedores en segundo plano (PostgreSQL + Engine)...
docker compose up -d

if %errorlevel% neq 0 (
    echo.
    echo [!] Error al levantar contenedores Docker.
    echo [i] Asegúrate de que Docker Desktop esté abierto (con la ballena verde).
    echo.
    pause
    exit /b 1
)

echo.
echo ======================================================================
echo   ✨ ¡SISTEMA ONLINE Y OPERANDO EXITOSAMENTE!
echo ======================================================================
echo.
echo Abriendo Centro de Mando en tu navegador...
timeout /t 3 /nobreak > nul
start http://localhost:3100/dashboard

echo.
echo Puedes cerrar esta ventana. El sistema seguirá corriendo en segundo plano.
timeout /t 5 > nul
exit /b 0
