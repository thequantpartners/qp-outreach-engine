#!/usr/bin/env bash
# ======================================================================
#   🚀 INICIANDO QP COMMERCIAL ENGINE (THE QUANT PARTNERS)
# ======================================================================

set -e

if [ ! -f ".env" ]; then
    echo "[!] Archivo de configuración .env no encontrado."
    echo "[i] Por favor lee el archivo AI_BOOTSTRAP_PROMPT.txt y pídele a tu IA"
    echo "    que configure el sistema por ti primero."
    exit 1
fi

echo "[*] Levantando contenedores en segundo plano (PostgreSQL + Engine)..."
docker compose up -d

echo ""
echo "======================================================================"
echo "  ✨ ¡SISTEMA ONLINE Y OPERANDO EXITOSAMENTE!"
echo "======================================================================"
echo ""
echo "Abre tu navegador en: http://localhost:3100/dashboard"

if command -v open > /dev/null; then
    open http://localhost:3100/dashboard
elif command -v xdg-open > /dev/null; then
    xdg-open http://localhost:3100/dashboard
fi
