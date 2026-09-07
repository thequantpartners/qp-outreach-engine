import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { FleetClientRecord, HeartbeatPayload } from '../types/index.js';

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
   * Registra un nuevo cliente o actualiza uno existente
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
    console.log(`📋 [ClientRegistry] Cliente "${client.companyName}" (${client.clientId}) registrado/actualizado en la flota.`);
  }

  /**
   * Lista todos los clientes registrados en la flota
   */
  public static async listClients(): Promise<FleetClientRecord[]> {
    return this.loadFleet();
  }

  /**
   * Obtiene la ficha de un cliente por su slug
   */
  public static async getClient(clientId: string): Promise<FleetClientRecord | null> {
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
    if (idx < 0) return false;

    fleet[idx] = {
      ...fleet[idx],
      ...updates,
      updatedAt: new Date().toISOString()
    };

    this.saveFleet(fleet);
    return true;
  }

  /**
   * Procesa un Heartbeat periódico recibido desde un nodo satélite
   */
  public static async recordHeartbeat(payload: HeartbeatPayload): Promise<void> {
    const fleet = this.loadFleet();
    const idx = fleet.findIndex(c => c.clientId === payload.clientId);
    if (idx < 0) {
      console.warn(`⚠️ [ClientRegistry] Heartbeat recibido de cliente no registrado: ${payload.clientId}`);
      return;
    }

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
    console.log(`💓 [ClientRegistry] Heartbeat registrado para "${client.companyName}": WA ${client.isWhatsAppConnected ? 'ONLINE' : 'OFFLINE'}, ${payload.qualifiedLeads} calificados, ${payload.meetingsBooked} citas.`);
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
    const fleet = this.loadFleet();
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
    if (filtered.length === fleet.length) return false;

    this.saveFleet(filtered);
    console.log(`🗑️ [ClientRegistry] Cliente ${clientId} removido de la flota.`);
    return true;
  }
}
