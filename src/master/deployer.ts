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
import { VpsInstaller } from './vps_installer.js';

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
  installCommand?: string;
  railwayDeployUrl?: string;
  railwayCliCommand?: string;
}

export class Deployer {
  public static generateSlug(name: string): string {
    return name
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  public static generatePin(): string {
    return Math.floor(1000 + Math.random() * 9000).toString();
  }

  /**
   * Ejecuta aprovisionamiento vía Railway GraphQL API si RAILWAY_API_TOKEN está disponible
   */
  private static async provisionRailwayProject(
    projectName: string,
    token: string
  ): Promise<{ projectId?: string; error?: string }> {
    try {
      const query = `
        mutation ProjectCreate($input: ProjectCreateInput!) {
          projectCreate(input: $input) {
            id
            name
          }
        }
      `;
      const res = await fetch('https://backboard.railway.app/graphql/v2', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          query,
          variables: {
            input: {
              name: projectName,
              description: `Instancia SaaR Desacoplada - ${projectName}`
            }
          }
        })
      });

      const data = (await res.json()) as any;
      if (data.errors && data.errors.length > 0) {
        return { error: data.errors[0].message };
      }
      return { projectId: data.data?.projectCreate?.id };
    } catch (err: any) {
      return { error: err.message };
    }
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

    // 3. Determinar URLs maestras y del satélite
    const masterBaseUrl = process.env.PUBLIC_URL
      ? (process.env.PUBLIC_URL.startsWith('http') ? process.env.PUBLIC_URL : `https://${process.env.PUBLIC_URL}`)
      : `http://localhost:${process.env.PORT || 3100}`;
    const masterHeartbeatUrl = `${masterBaseUrl}/api/master/heartbeat`;

    const dashboardDomain = deployTarget === 'railway'
      ? `${clientId}.up.railway.app`
      : `${clientId}.thequantpartners.pe`;
    const dashboardUrl = `https://${dashboardDomain}/dashboard`;

    // 4. Registrar en el catálogo maestro
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

    // 5. Generar artefactos de despliegue para VPS o Railway
    const installScript = VpsInstaller.generateInstallScript(clientRecord, masterHeartbeatUrl);
    const envProduction = VpsInstaller.generateEnvProduction(clientRecord, masterHeartbeatUrl);
    const dockerCompose = VpsInstaller.generateDockerCompose(clientRecord);

    fs.writeFileSync(path.join(clientDir, 'install.sh'), installScript, { encoding: 'utf-8', mode: 0o755 });
    fs.writeFileSync(path.join(clientDir, '.env.production'), envProduction, 'utf-8');
    fs.writeFileSync(path.join(clientDir, 'docker-compose.yml'), dockerCompose, 'utf-8');

    const installCommand = `curl -fsSL ${masterBaseUrl}/api/master/install/${clientId} | bash`;

    let railwayDeployUrl: string | undefined;
    let railwayCliCommand: string | undefined;

    if (deployTarget === 'railway') {
      const railwayToken = process.env.RAILWAY_API_TOKEN;
      if (railwayToken) {
        console.log(`⚡ [Deployer] Detectado RAILWAY_API_TOKEN. Creando proyecto en Railway API...`);
        const railwayRes = await this.provisionRailwayProject(`QP - ${req.companyName}`, railwayToken);
        if (railwayRes.error) {
          console.warn(`⚠️ [Deployer] Railway API error: ${railwayRes.error}`);
        } else {
          console.log(`✅ [Deployer] Proyecto creado en Railway: ID ${railwayRes.projectId}`);
        }
      }

      railwayDeployUrl = `https://railway.app/new/template?template=https%3A%2F%2Fgithub.com%2Fthe-quant-partners%2Fqp-outreach-engine&envs=MODE%2CCOMPANY_NAME%2CCLIENT_ID%2CCLIENT_PIN%2CADMIN_WHATSAPP_PHONE%2CMASTER_HEARTBEAT_URL&MODE=client&COMPANY_NAME=${encodeURIComponent(req.companyName)}&CLIENT_ID=${clientId}&CLIENT_PIN=${clientPin}&ADMIN_WHATSAPP_PHONE=${req.adminPhone.replace(/[^0-9]/g, '')}&MASTER_HEARTBEAT_URL=${encodeURIComponent(masterHeartbeatUrl)}`;
      railwayCliCommand = `railway init --name "qp-${clientId}" && railway add -d postgres`;
    }

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
      installCommand,
      railwayDeployUrl,
      railwayCliCommand,
      message: deployTarget === 'vps'
        ? `Cliente "${req.companyName}" listo para VPS. Ejecuta en el servidor: ${installCommand}`
        : `Cliente "${req.companyName}" aprovisionado para Railway. PIN de acceso: ${clientPin}`
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
