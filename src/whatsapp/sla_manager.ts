import { Lead } from '../types/index.js';

interface PendingLeadSla {
  leadPhone: string;
  firstUnrepliedAt: Date;
  unrepliedCount: number;
  lastMessageText: string;
  assignedRepPhone?: string;
  assignedRepName?: string;
  companyName?: string;
  serviceName?: string;
  timer: NodeJS.Timeout;
}

export class SlaAlertManager {
  private static instance: SlaAlertManager;
  private pendingMap: Map<string, PendingLeadSla> = new Map();
  
  // Timeout por defecto: 15 minutos (900,000 ms)
  // Permite override por variable de entorno para pruebas rápidas
  private slaTimeoutMs: number = Number(process.env.SLA_TIMEOUT_MS) || (15 * 60 * 1000);

  private constructor() {}

  public static getInstance(): SlaAlertManager {
    if (!SlaAlertManager.instance) {
      SlaAlertManager.instance = new SlaAlertManager();
    }
    return SlaAlertManager.instance;
  }

  /**
   * Registra un mensaje entrante de prospecto en horario comercial.
   * Si no hay temporizador activo, inicia la cuenta regresiva de 15 min desde este primer mensaje.
   * Si ya existe, incrementa el contador de mensajes acumulados sin reiniciar el temporizador SLA.
   */
  public recordInboundMessage(options: {
    leadPhone: string;
    incomingText: string;
    lead: Lead;
    onEscalate: (details: {
      leadPhone: string;
      lastMessageText: string;
      unrepliedCount: number;
      assignedRepPhone?: string;
      assignedRepName?: string;
      companyName: string;
      serviceName?: string;
    }) => Promise<void>;
  }): void {
    const cleanPhone = options.leadPhone.replace(/[^0-9]/g, '');
    const existing = this.pendingMap.get(cleanPhone);

    if (existing) {
      existing.unrepliedCount += 1;
      existing.lastMessageText = options.incomingText;
      console.log(`⏱️ [SlaManager] Lead ${cleanPhone} envió otro mensaje (${existing.unrepliedCount} sin responder). SLA vigente.`);
      return;
    }

    console.log(`⏱️ [SlaManager] Iniciando temporizador SLA (15 min) para lead ${cleanPhone}. Primer mensaje: "${options.incomingText.slice(0, 40)}"`);

    const timer = setTimeout(async () => {
      const current = this.pendingMap.get(cleanPhone);
      this.pendingMap.delete(cleanPhone);

      if (current) {
        console.warn(`🚨 [SlaManager] ¡SLA INCUMPLIDO! Lead ${cleanPhone} sin respuesta por más de 15 minutos.`);
        try {
          await options.onEscalate({
            leadPhone: cleanPhone,
            lastMessageText: current.lastMessageText,
            unrepliedCount: current.unrepliedCount,
            assignedRepPhone: current.assignedRepPhone,
            assignedRepName: current.assignedRepName,
            companyName: current.companyName || 'Prospecto Comercial',
            serviceName: current.serviceName
          });
        } catch (err: any) {
          console.error(`❌ [SlaManager] Error disparando escalación de SLA para ${cleanPhone}:`, err.message);
        }
      }
    }, this.slaTimeoutMs);

    this.pendingMap.set(cleanPhone, {
      leadPhone: cleanPhone,
      firstUnrepliedAt: new Date(),
      unrepliedCount: 1,
      lastMessageText: options.incomingText,
      assignedRepPhone: options.lead.assignedRepPhone,
      assignedRepName: options.lead.assignedRepName,
      companyName: options.lead.companyName,
      serviceName: options.lead.serviceName,
      timer
    });
  }

  /**
   * Cancela el temporizador SLA de un lead cuando un asesor responde
   * (desde el CRM web o desde WhatsApp).
   */
  public cancelSlaTimer(leadPhone: string): boolean {
    const cleanPhone = leadPhone.replace(/[^0-9]/g, '');
    const existing = this.pendingMap.get(cleanPhone);

    if (existing) {
      clearTimeout(existing.timer);
      this.pendingMap.delete(cleanPhone);
      console.log(`✅ [SlaManager] Temporizador SLA cancelado para ${cleanPhone}. Lead atendido a tiempo.`);
      return true;
    }
    return false;
  }

  /**
   * Verifica si un lead tiene un temporizador SLA corriendo
   */
  public hasPendingTimer(leadPhone: string): boolean {
    const cleanPhone = leadPhone.replace(/[^0-9]/g, '');
    return this.pendingMap.has(cleanPhone);
  }

  /**
   * Obtiene la cantidad de leads en riesgo de SLA en este momento
   */
  public getPendingCount(): number {
    return this.pendingMap.size;
  }
}
