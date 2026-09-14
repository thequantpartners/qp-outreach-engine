// =================================================================
// THE QUANT PARTNERS · WHATSAPP BUSINESS LABELS & GHOST CRM SYNC
// =================================================================

import { LeadStatus } from '../types/index.js';
import { OutreachRepo } from '../db/repo.js';

export interface GhostCRMLabel {
  id: string;
  status: LeadStatus;
  name: string;
  color: number; // 0 a 19 (WhatsApp LabelColor)
  emoji: string;
}

/**
 * Mapeo oficial 1:1 de estados de Ghost CRM a Etiquetas de WhatsApp Business
 */
export const GHOST_CRM_LABELS: Record<string, GhostCRMLabel> = {
  DISCOVERED: {
    id: 'qp_lbl_discovered',
    status: 'DISCOVERED',
    name: '🟡 Nuevo Prospecto',
    color: 5, // Amarillo
    emoji: '🟡'
  },
  QUEUED: {
    id: 'qp_lbl_discovered',
    status: 'QUEUED',
    name: '🟡 Nuevo Prospecto',
    color: 5,
    emoji: '🟡'
  },
  OUTREACH_SENT: {
    id: 'qp_lbl_outreach',
    status: 'OUTREACH_SENT',
    name: '📤 Primer Contacto',
    color: 0, // Cyan
    emoji: '📤'
  },
  FOLLOW_UP_SENT: {
    id: 'qp_lbl_followup',
    status: 'FOLLOW_UP_SENT',
    name: '⏳ Seguimiento Enviado',
    color: 1, // Azul
    emoji: '⏳'
  },
  REPLIED: {
    id: 'qp_lbl_replied',
    status: 'REPLIED',
    name: '💬 En Conversación',
    color: 2, // Naranja
    emoji: '💬'
  },
  QUALIFIED: {
    id: 'qp_lbl_qualified',
    status: 'QUALIFIED',
    name: '🟢 Interesado / Calificado',
    color: 8, // Verde brillante
    emoji: '🟢'
  },
  MEETING_SCHEDULED: {
    id: 'qp_lbl_scheduled',
    status: 'MEETING_SCHEDULED',
    name: '📅 Cita Agendada',
    color: 10, // Morado
    emoji: '📅'
  },
  CLOSED_WON: {
    id: 'qp_lbl_won',
    status: 'CLOSED_WON',
    name: '🏆 Venta Cerrada',
    color: 9, // Verde esmeralda
    emoji: '🏆'
  },
  CLOSED_LOST: {
    id: 'qp_lbl_lost',
    status: 'CLOSED_LOST',
    name: '🔴 No Interesado',
    color: 14, // Rojo
    emoji: '🔴'
  },
  OPT_OUT: {
    id: 'qp_lbl_optout',
    status: 'OPT_OUT',
    name: '🚫 Baja / Opt-Out',
    color: 19, // Gris oscuro / Neutro
    emoji: '🚫'
  },
  HUMAN_TAKEOVER: {
    id: 'qp_lbl_takeover',
    status: 'HUMAN_TAKEOVER',
    name: '👤 Control Humano',
    color: 13, // Magenta
    emoji: '👤'
  }
};

export class WhatsAppLabelManager {
  private static initialized = false;

  /**
   * Registra y asegura la existencia de las etiquetas oficiales en WhatsApp Business.
   * Si la cuenta no es WhatsApp Business o no soporta sync de appState, lo captura sin error.
   */
  public static async initLabels(sock: any): Promise<void> {
    if (!sock || this.initialized) return;

    console.log('🏷️ [WhatsAppLabelManager] Inicializando etiquetas de Ghost CRM en WhatsApp Business...');

    const uniqueLabels = new Map<string, GhostCRMLabel>();
    for (const label of Object.values(GHOST_CRM_LABELS)) {
      if (!uniqueLabels.has(label.id)) {
        uniqueLabels.set(label.id, label);
      }
    }

    const jid = sock.user?.id || '';

    for (const label of uniqueLabels.values()) {
      try {
        if (typeof sock.addLabel === 'function') {
          await sock.addLabel(jid, {
            id: label.id,
            name: label.name,
            color: label.color,
            deleted: false
          });
        }
      } catch (err: any) {
        // WhatsApp standard o ya existente
      }
    }

    this.initialized = true;
    console.log(`✅ [WhatsAppLabelManager] ${uniqueLabels.size} etiquetas sincronizadas con Ghost CRM.`);
  }

  /**
   * Obtiene la definición de etiqueta para un estado dado
   */
  public static getLabelForStatus(status: LeadStatus): GhostCRMLabel | undefined {
    return GHOST_CRM_LABELS[status];
  }

  /**
   * Sincroniza la etiqueta de WhatsApp para un lead según su nuevo estado
   */
  public static async syncLeadLabel(
    sock: any,
    phone: string,
    newStatus: LeadStatus,
    previousStatus?: LeadStatus
  ): Promise<void> {
    const cleanPhone = phone.replace(/[^0-9]/g, '');
    if (!cleanPhone) return;

    const newLabel = GHOST_CRM_LABELS[newStatus];
    const oldLabel = previousStatus ? GHOST_CRM_LABELS[previousStatus] : undefined;

    const jid = `${cleanPhone}@s.whatsapp.net`;

    // 1. Sincronizar en WhatsApp Business si el socket está activo
    if (sock) {
      try {
        // Remover etiqueta anterior si cambió
        if (oldLabel && oldLabel.id !== newLabel?.id && typeof sock.removeChatLabel === 'function') {
          await sock.removeChatLabel(jid, oldLabel.id).catch(() => {});
        }

        // Asignar nueva etiqueta
        if (newLabel && typeof sock.addChatLabel === 'function') {
          await sock.addChatLabel(jid, newLabel.id).catch(() => {});
          console.log(`🏷️ [WhatsAppLabelManager] Chat +${cleanPhone} etiquetado como "${newLabel.name}"`);
        }
      } catch (err: any) {
        // Fallback silencioso si la cuenta no es Business
      }
    }

    // 2. Persistir en PostgreSQL dentro de custom_fields
    if (newLabel) {
      try {
        await OutreachRepo.updateLeadCustomFields(cleanPhone, {
          whatsappLabel: newLabel.name,
          whatsappLabelId: newLabel.id,
          whatsappLabelEmoji: newLabel.emoji,
          lastLabelUpdateAt: new Date().toISOString()
        });
      } catch {}
    }

    // 3. Notificar al Dashboard Web en vivo vía SSE
    try {
      const { broadcastDashboardEvent } = await import('../gateway/server.js');
      broadcastDashboardEvent({
        type: 'lead_label_updated',
        phone: cleanPhone,
        status: newStatus,
        label: newLabel ? {
          id: newLabel.id,
          name: newLabel.name,
          color: newLabel.color,
          emoji: newLabel.emoji
        } : null
      });
    } catch {}
  }
}
