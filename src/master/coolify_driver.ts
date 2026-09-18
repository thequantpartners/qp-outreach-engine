// =================================================================
// THE QUANT PARTNERS · COOLIFY DRIVER (MASTER HUB PROVISIONING)
// Aprovisionamiento autónomo de nodos satélite de clientes en Coolify
// =================================================================

import { FleetClientRecord } from '../types/index.js';

export interface CoolifyConfig {
  apiUrl: string;
  apiToken: string;
  projectUuid: string;
  serverUuid: string;
  destinationUuid: string;
  githubAppUuid: string;
  rootDomain: string;
}

export class CoolifyDriver {
  private static getConfig(): CoolifyConfig {
    return {
      apiUrl: process.env.COOLIFY_API_URL || 'https://coolify.thequantpartners.com/api/v1',
      apiToken: process.env.COOLIFY_API_TOKEN || '2|1wZMBnDtoLDjHGB3IM7Jmq5FFiE19ww3Ez17xPrv03cb3119',
      projectUuid: process.env.COOLIFY_PROJECT_UUID || '1mfhyv4z3hkskc5q1xnigx5b',
      serverUuid: process.env.COOLIFY_SERVER_UUID || 'cg4smsvar83wy2r4tn5tqxl9',
      destinationUuid: process.env.COOLIFY_DESTINATION_UUID || 'qbm74jav8a2qzeozpd4zgc7q',
      githubAppUuid: process.env.COOLIFY_GITHUB_APP_UUID || 'zidrnmo7pqpnymniosekantn',
      rootDomain: process.env.COOLIFY_ROOT_DOMAIN || 'thequantpartners.com'
    };
  }

  public static isConfigured(): boolean {
    const cfg = this.getConfig();
    return Boolean(cfg.apiUrl && cfg.apiToken && cfg.projectUuid);
  }

  private static async request(endpoint: string, method: string = 'GET', data?: any): Promise<any> {
    const cfg = this.getConfig();
    const url = `${cfg.apiUrl.replace(/\/$/, '')}${endpoint}`;
    const headers: Record<string, string> = {
      'Authorization': `Bearer ${cfg.apiToken}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    };

    const res = await fetch(url, {
      method,
      headers,
      body: data ? JSON.stringify(data) : undefined
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Coolify API Error (${res.status} on ${endpoint}): ${errText}`);
    }

    const text = await res.text();
    return text ? JSON.parse(text) : {};
  }

  /**
   * Aprovisiona un cliente como una aplicación aislada dentro de Coolify
   */
  public static async provisionClient(
    client: FleetClientRecord,
    masterHeartbeatUrl: string
  ): Promise<{
    success: boolean;
    appUuid?: string;
    dashboardUrl: string;
    error?: string;
  }> {
    const cfg = this.getConfig();
    const clientDomain = `${client.clientId}.${cfg.rootDomain}`;
    const dashboardUrl = `https://${clientDomain}/dashboard`;

    try {
      console.log(`🐳 [CoolifyDriver] Creando aplicación satélite para: ${client.companyName} (${client.clientId})...`);

      const createRes = await this.request('/applications/private-github-app', 'POST', {
        project_uuid: cfg.projectUuid,
        server_uuid: cfg.serverUuid,
        environment_name: 'production',
        destination_uuid: cfg.destinationUuid,
        github_app_uuid: cfg.githubAppUuid,
        git_repository: 'thequantpartners/qp-outreach-engine',
        git_branch: 'main',
        build_pack: 'dockerfile',
        ports_exposes: '3100',
        name: `qp-client-${client.clientId}`,
        description: `Nodo Satélite SaaR - ${client.companyName}`,
        domains: `https://${clientDomain}`,
        instant_deploy: false
      });

      const appUuid = createRes.uuid;
      if (!appUuid) {
        throw new Error('Coolify no retornó UUID para la nueva aplicación.');
      }

      console.log(`✅ [CoolifyDriver] Aplicación creada en Coolify (UUID: ${appUuid}).`);

      try {
        await this.request(`/applications/${appUuid}/storages`, 'POST', {
          type: 'persistent',
          name: `storage-${client.clientId}`,
          mount_path: '/app/storage'
        });
        console.log(`💾 [CoolifyDriver] Volumen persistente configurado en /app/storage.`);
      } catch (storageErr: any) {
        console.warn(`⚠️ [CoolifyDriver] Advertencia configurando storage:`, storageErr.message);
      }

      const salesRepsString = (client.salesReps || []).map(r => `${r.name}:${r.phone.replace(/[^0-9]/g, '')}`).join(',');
      const apiSecretKey = `qp-${client.clientId}-${Math.random().toString(36).substring(2, 10)}`;

      const envVars = [
        { key: 'MODE', value: 'client' },
        { key: 'NODE_ENV', value: 'production' },
        { key: 'PORT', value: '3100' },
        { key: 'COMPANY_NAME', value: client.companyName },
        { key: 'CLIENT_ID', value: client.clientId },
        { key: 'CLIENT_PIN', value: client.clientPin },
        { key: 'ADMIN_NAME', value: `${client.companyName} (Director)` },
        { key: 'ADMIN_WHATSAPP_PHONE', value: client.adminPhone.replace(/[^0-9]/g, '') },
        { key: 'SALES_REPS', value: salesRepsString },
        { key: 'CLOSING_MODE', value: client.closingMode || 'HYBRID_SMART' },
        { key: 'SERVICE_NAME', value: client.serviceName || `Prospección - ${client.companyName}` },
        { key: 'PUBLIC_URL', value: clientDomain },
        { key: 'MASTER_HEARTBEAT_URL', value: masterHeartbeatUrl },
        { key: 'STORAGE_DIR', value: '/app/storage' },
        { key: 'API_SECRET_KEY', value: apiSecretKey },
        { key: 'STANDALONE_MODE', value: 'false' },
        { key: 'TZ', value: 'America/Lima' }
      ];

      if (client.niche) {
        envVars.push({ key: 'INITIAL_NICHE', value: client.niche });
      }

      await this.request(`/applications/${appUuid}/envs/bulk`, 'PATCH', {
        data: envVars.map(e => ({
          key: e.key,
          value: e.value,
          is_runtime: true,
          is_buildtime: false,
          is_literal: true
        }))
      });

      console.log(`🔒 [CoolifyDriver] Variables de entorno inyectadas con política Cero Fugas.`);

      await this.request(`/deploy?uuid=${appUuid}`, 'POST');
      console.log(`🚀 [CoolifyDriver] Despliegue encolado exitosamente para https://${clientDomain}.`);

      return {
        success: true,
        appUuid,
        dashboardUrl
      };
    } catch (err: any) {
      console.error(`🚨 [CoolifyDriver] Error aprovisionando en Coolify:`, err.message);
      return {
        success: false,
        dashboardUrl,
        error: err.message
      };
    }
  }
}
