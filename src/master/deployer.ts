import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  ProvisionClientRequest,
  CloneClientRequest,
  FleetClientRecord
} from '../types/index.js';
import { ClientRegistry } from './client_registry.js';
import { BlueprintsManager } from './blueprints_manager.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '../../');
const clientsStorageDir = path.resolve(projectRoot, 'storage/clients');

export interface ProvisionResult {
  success: boolean;
  clientId: string;
  companyName: string;
  clientPin: string;
  dashboardUrl: string;
  deployTarget: 'railway' | 'vps';
  status: 'ACTIVE' | 'PROVISIONING' | 'ERROR';
  configDir: string;
  salesRepsCount: number;
  message: string;
}

export class Deployer {
  private static generateSlug(name: string): string {
    return name
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  private static generatePin(): string {
    return Math.floor(1000 + Math.random() * 9000).toString();
  }

  /**
   * Aprovisiona una nueva instancia de cliente (SaaR Satellite Node)
   */
  public static async provisionClient(req: ProvisionClientRequest): Promise<ProvisionResult> {
    const clientId = req.clientId || this.generateSlug(req.companyName);
    const clientPin = req.clientPin || this.generatePin();
    const deployTarget = req.deployTarget || 'railway';

    console.log(`🚀 [Deployer] Aprovisionando cliente: "${req.companyName}" (${clientId}) [Destino: ${deployTarget}]...`);

    // 1. Obtener blueprint de nicho si aplica
    const blueprint = req.niche && req.niche !== 'custom'
      ? BlueprintsManager.getBlueprint(req.niche)
      : null;

    const closingMode = req.closingMode || blueprint?.recommendedClosingMode || 'HYBRID_SMART';
    const serviceName = req.serviceName || (blueprint ? `${blueprint.nicheName} - ${req.companyName}` : `Prospección B2B - ${req.companyName}`);

    // 2. Preparar directorio de configuración del cliente
    const clientDir = path.join(clientsStorageDir, clientId);
    if (!fs.existsSync(clientDir)) {
      fs.mkdirSync(clientDir, { recursive: true });
    }

    // 3. Determinar URL pública
    const defaultMasterUrl = process.env.PUBLIC_URL
      ? `https://${process.env.PUBLIC_URL}`
      : `http://localhost:${process.env.PORT || 3100}`;
    const dashboardDomain = deployTarget === 'railway'
      ? `${clientId}.up.railway.app`
      : `${clientId}.thequantpartners.pe`;
    const dashboardUrl = `https://${dashboardDomain}/dashboard`;

    // 4. Generar archivo .env para el nodo del cliente
    const salesRepsString = req.salesReps.map(r => `${r.name}:${r.phone}`).join(',');
    const envContent = [
      `# Configuración del Nodo Satélite - ${req.companyName}`,
      `MODE=client`,
      `PORT=3100`,
      `COMPANY_NAME="${req.companyName}"`,
      `CLIENT_ID="${clientId}"`,
      `CLIENT_PIN="${clientPin}"`,
      `ADMIN_WHATSAPP_PHONE="${req.adminPhone.replace(/[^0-9]/g, '')}"`,
      `SALES_REPS="${salesRepsString}"`,
      `CLOSING_MODE="${closingMode}"`,
      req.meetingUrl ? `MEETING_URL="${req.meetingUrl}"` : '',
      `SERVICE_NAME="${serviceName}"`,
      `PUBLIC_URL="${dashboardDomain}"`,
      `MASTER_HEARTBEAT_URL="${defaultMasterUrl}/api/master/heartbeat"`,
      `DATABASE_URL="${process.env.DATABASE_URL || ''}"`,
      `STORAGE_DIR="./storage"`,
      `API_SECRET_KEY="qp-client-sec-${clientPin}"`
    ].filter(Boolean).join('\n');

    fs.writeFileSync(path.join(clientDir, '.env.production'), envContent, 'utf-8');

    // 5. Generar archivo docker-compose.yml para despliegue en VPS
    const dockerComposeContent = `
version: '3.8'
services:
  ${clientId}:
    image: qp-outreach-engine:latest
    container_name: qp-node-${clientId}
    restart: unless-stopped
    env_file:
      - .env.production
    ports:
      - "31${Math.floor(10 + Math.random() * 89)}:3100"
    volumes:
      - ./storage:/app/storage
    environment:
      - NODE_ENV=production
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.${clientId}.rule=Host(\`${dashboardDomain}\`)"
      - "traefik.http.routers.${clientId}.entrypoints=websecure"
      - "traefik.http.routers.${clientId}.tls.certresolver=myresolver"
`.trim();

    fs.writeFileSync(path.join(clientDir, 'docker-compose.yml'), dockerComposeContent, 'utf-8');

    // 6. Registrar en el catálogo maestro
    const clientRecord: FleetClientRecord = {
      clientId,
      companyName: req.companyName,
      niche: req.niche,
      status: 'ACTIVE',
      deployTarget,
      dashboardUrl,
      adminPhone: req.adminPhone,
      salesReps: req.salesReps,
      clientPin,
      closingMode,
      serviceName,
      isWhatsAppConnected: false,
      totalLeads: 0,
      repliedLeads: 0,
      qualifiedLeads: 0,
      meetingsBooked: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    await ClientRegistry.registerClient(clientRecord);

    console.log(`✅ [Deployer] Cliente "${req.companyName}" aprovisionado con éxito.`);
    console.log(`🔑 PIN de Acceso: ${clientPin}`);
    console.log(`🌐 Dashboard URL: ${dashboardUrl}`);

    return {
      success: true,
      clientId,
      companyName: req.companyName,
      clientPin,
      dashboardUrl,
      deployTarget,
      status: 'ACTIVE',
      configDir: clientDir,
      salesRepsCount: req.salesReps.length,
      message: `Cliente "${req.companyName}" aprovisionado exitosamente en ${clientDir}. PIN de acceso: ${clientPin}.`
    };
  }

  /**
   * Clona la configuración y prompts de un cliente existente para uno nuevo
   */
  public static async cloneClient(req: CloneClientRequest): Promise<ProvisionResult> {
    console.log(`🐑 [Deployer] Clonando cliente "${req.sourceClientId}" para "${req.newCompanyName}"...`);

    const sourceClient = await ClientRegistry.getClient(req.sourceClientId);
    if (!sourceClient) {
      throw new Error(`No se encontró el cliente fuente con ID "${req.sourceClientId}".`);
    }

    const newClientId = this.generateSlug(req.newCompanyName);

    return await this.provisionClient({
      clientId: newClientId,
      companyName: req.newCompanyName,
      niche: sourceClient.niche,
      adminPhone: req.newAdminPhone,
      salesReps: req.newSalesReps,
      closingMode: sourceClient.closingMode,
      serviceName: `${sourceClient.niche.toUpperCase()} - ${req.newCompanyName}`,
      deployTarget: req.deployTarget || sourceClient.deployTarget,
      clientPin: req.newClientPin
    });
  }
}
