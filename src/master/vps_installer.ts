import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { FleetClientRecord } from '../types/index.js';

export class VpsInstaller {
  /**
   * Genera el archivo .env.production virgen para el nodo del cliente (Zero Leakage)
   */
  public static generateEnvProduction(
    client: FleetClientRecord,
    masterHeartbeatUrl: string,
    dbPassword?: string
  ): string {
    const pass = dbPassword || crypto.randomBytes(12).toString('hex');
    const salesRepsString = (client.salesReps || []).map(r => `${r.name}:${r.phone.replace(/[^0-9]/g, '')}`).join(',');
    const apiSecretKey = `qp-${client.clientId}-${crypto.randomBytes(8).toString('hex')}`;

    return [
      `# =================================================================`,
      `# NODO SATÉLITE SAAR - CONFIGURACIÓN DE INSTANCIA CLIENTE`,
      `# Cliente: ${client.companyName} (${client.clientId})`,
      `# Generado automáticamente por QP Outreach Engine Master Hub`,
      `# =================================================================`,
      `MODE=client`,
      `NODE_ENV=production`,
      `PORT=3100`,
      `COMPANY_NAME="${client.companyName}"`,
      `CLIENT_ID="${client.clientId}"`,
      `CLIENT_PIN="${client.clientPin}"`,
      `ADMIN_NAME="${client.companyName} (Director)"`,
      `ADMIN_WHATSAPP_PHONE="${client.adminPhone.replace(/[^0-9]/g, '')}"`,
      `SALES_REPS="${salesRepsString}"`,
      `CLOSING_MODE="${client.closingMode || 'HYBRID_SMART'}"`,
      client.serviceName ? `SERVICE_NAME="${client.serviceName}"` : `SERVICE_NAME="Prospección B2B - ${client.companyName}"`,
      client.niche ? `INITIAL_NICHE="${client.niche}"` : '',
      `PUBLIC_URL="${client.dashboardUrl.replace(/^https?:\/\//, '').replace(/\/dashboard$/, '')}"`,
      `MASTER_HEARTBEAT_URL="${masterHeartbeatUrl}"`,
      `STORAGE_DIR="./storage"`,
      `API_SECRET_KEY="${apiSecretKey}"`,
      `DATABASE_URL="postgres://qp_user:${pass}@postgres:5432/qp_outreach"`,
      ``,
      `# POLÍTICA CERO FUGAS: Claves de Kenneth vacías (El cliente ingresa las suyas en el Onboarding Wizard)`,
      `OPENROUTER_API_KEY=""`,
      `APIFY_TOKEN=""`
    ].filter(line => line !== '').join('\n');
  }

  /**
   * Genera el docker-compose.yml con PostgreSQL aislado y la aplicación
   */
  public static generateDockerCompose(
    client: FleetClientRecord,
    dbPassword?: string,
    hostPort: number = 3100
  ): string {
    const pass = dbPassword || 'qp_secure_pass_' + crypto.randomBytes(6).toString('hex');

    return `version: '3.8'

services:
  postgres:
    image: postgres:15-alpine
    container_name: qp-postgres-${client.clientId}
    restart: always
    environment:
      POSTGRES_DB: qp_outreach
      POSTGRES_USER: qp_user
      POSTGRES_PASSWORD: ${pass}
    volumes:
      - qp_${client.clientId}_pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U qp_user -d qp_outreach"]
      interval: 5s
      timeout: 5s
      retries: 5

  engine:
    image: node:22-alpine
    container_name: qp-engine-${client.clientId}
    restart: always
    working_dir: /app
    depends_on:
      postgres:
        condition: service_healthy
    env_file:
      - .env.production
    ports:
      - "${hostPort}:3100"
    volumes:
      - .:/app
      - ./storage:/app/storage
    command: sh -c "npm install --omit=dev && npm run build && npm start"

volumes:
  qp_${client.clientId}_pgdata:
`;
  }

  /**
   * Genera el script bash 'install.sh' ejecutable en una sola línea vía curl | bash
   */
  public static generateInstallScript(
    client: FleetClientRecord,
    masterHeartbeatUrl: string,
    hostPort: number = 3100
  ): string {
    const dbPassword = crypto.randomBytes(12).toString('hex');
    const envContent = this.generateEnvProduction(client, masterHeartbeatUrl, dbPassword);
    const dockerCompose = this.generateDockerCompose(client, dbPassword, hostPort);

    return `#!/bin/bash
set -e

# =================================================================
# QP Outreach Engine - Instalador Automático de Nodo Satélite SaaR
# Cliente: ${client.companyName} (${client.clientId})
# =================================================================

echo "========================================================"
echo "🚀 QP Outreach Engine - Despliegue SaaR Desacoplado"
echo "Empresa: ${client.companyName}"
echo "Cliente ID: ${client.clientId}"
echo "========================================================"

# 1. Comprobar privilegios de superusuario
if [ "$(id -u)" != "0" ]; then
   echo "⚠️  Este script debe ejecutarse como root o con sudo." 1>&2
   exit 1
fi

# 2. Instalar Docker y Docker Compose si no están presentes
if ! command -v docker &> /dev/null; then
    echo "📦 Docker no detectado. Instalando Docker oficial..."
    curl -fsSL https://get.docker.com | sh
    systemctl enable --now docker
fi

# 3. Preparar directorio de la instancia aislada
INSTALL_DIR="/opt/qp-outreach-${client.clientId}"
echo "📂 Creando directorio de instalación en: $INSTALL_DIR"
mkdir -p "$INSTALL_DIR/storage/baileys_auth"
mkdir -p "$INSTALL_DIR/storage/assets"
mkdir -p "$INSTALL_DIR/src"
mkdir -p "$INSTALL_DIR/public"
cd "$INSTALL_DIR"

# 4. Clonar código base desacoplado desde GitHub oficial
if [ ! -f "package.json" ]; then
    echo "📥 Descargando paquete base de QP Outreach Engine..."
    if command -v git &> /dev/null; then
        git clone https://github.com/the-quant-partners/qp-outreach-engine.git temp_repo
        cp -r temp_repo/* .
        rm -rf temp_repo
    else
        echo "📥 Descargando tarball vía curl..."
        curl -fsSL https://github.com/the-quant-partners/qp-outreach-engine/archive/refs/heads/main.tar.gz | tar -xz --strip-components=1
    fi
fi

# 5. Escribir archivo .env.production virgen (Zero Leakage)
echo "🔒 Generando variables de entorno vírgenes (.env.production)..."
cat << 'ENV_EOF' > .env.production
${envContent}
ENV_EOF

# 6. Escribir docker-compose.yml aislado
echo "🐳 Generando docker-compose.yml con PostgreSQL dedicado..."
cat << 'COMPOSE_EOF' > docker-compose.yml
${dockerCompose}
COMPOSE_EOF

# 7. Levantar la infraestructura
echo "🚀 Levantando contenedores de la instancia cliente..."
docker compose down || true
docker compose up -d --build

echo ""
echo "========================================================"
echo "✅ ¡NODO SATÉLITE SAAR DESPLEGADO CON ÉXITO!"
echo "Empresa: ${client.companyName}"
echo "URL Local/Pública: http://$(curl -s ifconfig.me):${hostPort}/dashboard"
echo "PIN de Acceso Maestro: ${client.clientPin}"
echo "Directorio de Instalación: $INSTALL_DIR"
echo "Telemetría Master: Conectada a ${masterHeartbeatUrl}"
echo "========================================================"
echo "👉 El cliente ahora puede ingresar al dashboard y completar su Onboarding Wizard."
`;
  }
}
