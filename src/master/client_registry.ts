import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { FleetClientRecord, HeartbeatPayload } from '../types/index.js';
import { DbConnection } from '../db/connection.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '../../');
const masterStorageDir = path.resolve(projectRoot, 'storage/master');
const registryFile = path.join(masterStorageDir, 'fleet_clients.json');

export class ClientRegistry {
  private static ensureStorage(): void {
    if (!fs.existsSync(masterStorageDir)) {
      fs.mkdirSync(masterStorageDir, { recursive: true });
    }
    if (!fs.existsSync(registryFile)) {
      fs.writeFileSync(registryFile, JSON.stringify([], null, 2), 'utf-8');
    }
  }

  private static loadFleet(): FleetClientRecord[] {
    this.ensureStorage();
    try {
      const raw = fs.readFileSync(registryFile, 'utf-8');
      return JSON.parse(raw);
    } catch {
      return [];
    }
  }

  private static saveFleet(fleet: FleetClientRecord[]): void {
    this.ensureStorage();
    fs.writeFileSync(registryFile, JSON.stringify(fleet, null, 2), 'utf-8');
  }

  /**
   * Registra un nuevo cliente o actualiza uno existente (PostgreSQL + JSON Backup)
   */
  public static async registerClient(client: FleetClientRecord): Promise<void> {
    const fleet = this.loadFleet();
    const idx = fleet.findIndex(c => c.clientId === client.clientId);

    if (idx >= 0) {
      fleet[idx] = {
        ...fleet[idx],
        ...client,
        updatedAt: new Date().toISOString()
      };
    } else {
      fleet.push({
        ...client,
        createdAt: client.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });
    }

    this.saveFleet(fleet);

    // Persistir en PostgreSQL si está disponible
    if (DbConnection.isPg()) {
      try {
        await DbConnection.getPool().query(`
          INSERT INTO fleet_clients (
            client_id, company_name, niche, status, deploy_target, dashboard_url, admin_phone,
            sales_reps, client_pin, closing_mode, service_name, is_whatsapp_connected,
            total_leads, replied_leads, qualified_leads, meetings_booked, created_at, updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
          ON CONFLICT (client_id) DO UPDATE SET
            company_name = EXCLUDED.company_name,
            niche = EXCLUDED.niche,
            status = EXCLUDED.status,
            deploy_target = EXCLUDED.deploy_target,
            dashboard_url = EXCLUDED.dashboard_url,
            admin_phone = EXCLUDED.admin_phone,
            sales_reps = EXCLUDED.sales_reps,
            client_pin = EXCLUDED.client_pin,
            closing_mode = EXCLUDED.closing_mode,
            service_name = EXCLUDED.service_name,
            updated_at = CURRENT_TIMESTAMP
        `, [
          client.clientId,
          client.companyName,
          client.niche || 'custom',
          client.status || 'ACTIVE',
          client.deployTarget || 'railway',
          client.dashboardUrl || '',
          client.adminPhone,
          JSON.stringify(client.salesReps || []),
          client.clientPin,
          client.closingMode || 'HYBRID_SMART',
          client.serviceName || `Prospección - ${client.companyName}`,
          client.isWhatsAppConnected || false,
          client.totalLeads || 0,
          client.repliedLeads || 0,
          client.qualifiedLeads || 0,
          client.meetingsBooked || 0,
          client.createdAt || new Date().toISOString(),
          client.updatedAt || new Date().toISOString()
        ]);
      } catch (err: any) {
        console.warn('⚠️ [ClientRegistry] Error persistiendo cliente en PostgreSQL:', err.message);
      }
    }

    console.log(`📋 [ClientRegistry] Cliente "${client.companyName}" (${client.clientId}) registrado/actualizado en la flota.`);
  }

  /**
   * Lista todos los clientes registrados en la flota
   */
  public static async listClients(): Promise<FleetClientRecord[]> {
    if (DbConnection.isPg()) {
      try {
        const res = await DbConnection.getPool().query(`SELECT * FROM fleet_clients ORDER BY created_at DESC`);
        if (res.rows.length > 0) {
          const pgFleet: FleetClientRecord[] = res.rows.map(r => ({
            clientId: r.client_id,
            companyName: r.company_name,
            niche: r.niche,
            status: r.status,
            deployTarget: r.deploy_target,
            dashboardUrl: r.dashboard_url,
            adminPhone: r.admin_phone,
            salesReps: typeof r.sales_reps === 'string' ? JSON.parse(r.sales_reps) : (r.sales_reps || []),
            clientPin: r.client_pin,
            closingMode: r.closing_mode,
            serviceName: r.service_name,
            isWhatsAppConnected: Boolean(r.is_whatsapp_connected),
            totalLeads: Number(r.total_leads || 0),
            repliedLeads: Number(r.replied_leads || 0),
            qualifiedLeads: Number(r.qualified_leads || 0),
            meetingsBooked: Number(r.meetings_booked || 0),
            lastHeartbeat: r.last_heartbeat ? new Date(r.last_heartbeat).toISOString() : undefined,
            createdAt: r.created_at ? new Date(r.created_at).toISOString() : new Date().toISOString(),
            updatedAt: r.updated_at ? new Date(r.updated_at).toISOString() : new Date().toISOString()
          }));
          this.saveFleet(pgFleet); // Mantener sincronizado el JSON local
          return pgFleet;
        }
      } catch (err: any) {
        console.warn('⚠️ [ClientRegistry] Error consultando PostgreSQL:', err.message);
      }
    }
    return this.loadFleet();
  }

  /**
   * Obtiene la ficha de un cliente por su slug
   */
  public static async getClient(clientId: string): Promise<FleetClientRecord | null> {
    if (DbConnection.isPg()) {
      try {
        const res = await DbConnection.getPool().query(`SELECT * FROM fleet_clients WHERE client_id = $1`, [clientId]);
        if (res.rows.length > 0) {
          const r = res.rows[0];
          return {
            clientId: r.client_id,
            companyName: r.company_name,
            niche: r.niche,
            status: r.status,
            deployTarget: r.deploy_target,
            dashboardUrl: r.dashboard_url,
            adminPhone: r.admin_phone,
            salesReps: typeof r.sales_reps === 'string' ? JSON.parse(r.sales_reps) : (r.sales_reps || []),
            clientPin: r.client_pin,
            closingMode: r.closing_mode,
            serviceName: r.service_name,
            isWhatsAppConnected: Boolean(r.is_whatsapp_connected),
            totalLeads: Number(r.total_leads || 0),
            repliedLeads: Number(r.replied_leads || 0),
            qualifiedLeads: Number(r.qualified_leads || 0),
            meetingsBooked: Number(r.meetings_booked || 0),
            lastHeartbeat: r.last_heartbeat ? new Date(r.last_heartbeat).toISOString() : undefined,
            createdAt: r.created_at ? new Date(r.created_at).toISOString() : new Date().toISOString(),
            updatedAt: r.updated_at ? new Date(r.updated_at).toISOString() : new Date().toISOString()
          };
        }
      } catch (err: any) {
        console.warn('⚠️ [ClientRegistry] Error buscando cliente en PostgreSQL:', err.message);
      }
    }
    const fleet = this.loadFleet();
    return fleet.find(c => c.clientId === clientId) || null;
  }

  /**
   * Actualiza el estado o propiedades de un cliente
   */
  public static async updateClient(
    clientId: string,
    updates: Partial<FleetClientRecord>
  ): Promise<boolean> {
    const fleet = this.loadFleet();
    const idx = fleet.findIndex(c => c.clientId === clientId);
    if (idx >= 0) {
      fleet[idx] = {
        ...fleet[idx],
        ...updates,
        updatedAt: new Date().toISOString()
      };
      this.saveFleet(fleet);
    }

    if (DbConnection.isPg()) {
      try {
        await DbConnection.getPool().query(`
          UPDATE fleet_clients SET
            company_name = COALESCE($2, company_name),
            status = COALESCE($3, status),
            dashboard_url = COALESCE($4, dashboard_url),
            is_whatsapp_connected = COALESCE($5, is_whatsapp_connected),
            total_leads = COALESCE($6, total_leads),
            replied_leads = COALESCE($7, replied_leads),
            qualified_leads = COALESCE($8, qualified_leads),
            meetings_booked = COALESCE($9, meetings_booked),
            updated_at = CURRENT_TIMESTAMP
          WHERE client_id = $1
        `, [
          clientId,
          updates.companyName || null,
          updates.status || null,
          updates.dashboardUrl || null,
          updates.isWhatsAppConnected != null ? updates.isWhatsAppConnected : null,
          updates.totalLeads != null ? updates.totalLeads : null,
          updates.repliedLeads != null ? updates.repliedLeads : null,
          updates.qualifiedLeads != null ? updates.qualifiedLeads : null,
          updates.meetingsBooked != null ? updates.meetingsBooked : null
        ]);
      } catch (err: any) {
        console.warn('⚠️ [ClientRegistry] Error actualizando cliente en PostgreSQL:', err.message);
      }
    }

    return true;
  }

  /**
   * Procesa un Heartbeat periódico recibido desde un nodo satélite
   */
  public static async recordHeartbeat(payload: HeartbeatPayload): Promise<void> {
    const fleet = this.loadFleet();
    const idx = fleet.findIndex(c => c.clientId === payload.clientId);
    if (idx >= 0) {
      const client = fleet[idx];
      client.lastHeartbeat = payload.timestamp || new Date().toISOString();
      client.isWhatsAppConnected = payload.isWhatsAppConnected;
      client.totalLeads = payload.totalLeads;
      client.repliedLeads = payload.repliedLeads;
      client.qualifiedLeads = payload.qualifiedLeads;
      client.meetingsBooked = payload.meetingsBooked;
      client.status = payload.isWhatsAppConnected ? 'ACTIVE' : 'DISCONNECTED';
      client.updatedAt = new Date().toISOString();
      this.saveFleet(fleet);
    }

    if (DbConnection.isPg()) {
      try {
        await DbConnection.getPool().query(`
          UPDATE fleet_clients SET
            is_whatsapp_connected = $2,
            total_leads = $3,
            replied_leads = $4,
            qualified_leads = $5,
            meetings_booked = $6,
            status = $7,
            last_heartbeat = CURRENT_TIMESTAMP,
            updated_at = CURRENT_TIMESTAMP
          WHERE client_id = $1
        `, [
          payload.clientId,
          payload.isWhatsAppConnected,
          payload.totalLeads,
          payload.repliedLeads,
          payload.qualifiedLeads,
          payload.meetingsBooked,
          payload.isWhatsAppConnected ? 'ACTIVE' : 'DISCONNECTED'
        ]);
      } catch (err: any) {
        console.warn('⚠️ [ClientRegistry] Error grabando Heartbeat en PostgreSQL:', err.message);
      }
    }

    console.log(`💓 [ClientRegistry] Heartbeat registrado para "${payload.clientId}": WA ${payload.isWhatsAppConnected ? 'ONLINE' : 'OFFLINE'}, ${payload.qualifiedLeads} calificados, ${payload.meetingsBooked} citas.`);
  }

  /**
   * Reporte consolidado de salud de toda la flota
   */
  public static async getFleetHealth(): Promise<{
    totalClients: number;
    activeClients: number;
    disconnectedClients: number;
    totalLeadsContacted: number;
    totalQualifiedOpportunities: number;
    totalMeetingsBooked: number;
    clients: FleetClientRecord[];
  }> {
    const fleet = await this.listClients();
    let totalLeadsContacted = 0;
    let totalQualified = 0;
    let totalMeetings = 0;
    let active = 0;
    let disconnected = 0;

    for (const c of fleet) {
      totalLeadsContacted += c.totalLeads || 0;
      totalQualified += c.qualifiedLeads || 0;
      totalMeetings += c.meetingsBooked || 0;
      if (c.isWhatsAppConnected) {
        active++;
      } else {
        disconnected++;
      }
    }

    return {
      totalClients: fleet.length,
      activeClients: active,
      disconnectedClients: disconnected,
      totalLeadsContacted,
      totalQualifiedOpportunities: totalQualified,
      totalMeetingsBooked: totalMeetings,
      clients: fleet
    };
  }

  /**
   * Elimina un cliente del registro
   */
  public static async deleteClient(clientId: string): Promise<boolean> {
    const fleet = this.loadFleet();
    const filtered = fleet.filter(c => c.clientId !== clientId);
    if (filtered.length !== fleet.length) {
      this.saveFleet(filtered);
    }

    if (DbConnection.isPg()) {
      try {
        await DbConnection.getPool().query(`DELETE FROM fleet_clients WHERE client_id = $1`, [clientId]);
      } catch (err: any) {
        console.warn('⚠️ [ClientRegistry] Error eliminando cliente de PostgreSQL:', err.message);
      }
    }

    console.log(`🗑️ [ClientRegistry] Cliente ${clientId} removido de la flota.`);
    return true;
  }
}
