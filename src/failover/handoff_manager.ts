import { OutreachRepo } from '../db/repo.js';
import { ChatMessage, Lead } from '../types/index.js';

export interface HandoffTriggerParams {
  senderPhone: string;
  reason: 'TECHNICAL_TIMEOUT' | 'TECHNICAL_EXCEPTION' | 'USER_REQUESTED_HUMAN' | 'USER_FRUSTRATION' | 'REPETITION_LOOP' | 'MANUAL';
  reasonText: string;
  errorDetail?: string;
  incomingText: string;
  leadName?: string;
}

export class HandoffManager {
  private static readonly CLIENT_HANDOFF_MESSAGE = 
    'Un momento por favor 🙌, te comunico con un asesor en este mismo chat para ayudarte de inmediato con los detalles 🤝.';

  /**
   * Ejecuta el Handoff Humano Graceful:
   * 1. Despacha mensaje cálido de transferencia al cliente por WhatsApp (cero mensajes rotos).
   * 2. Silencia a la IA inmediatamente pasando el lead a HUMAN_TAKEOVER.
   * 3. Despacha alerta con contexto completo al WhatsApp del Administrador (Kenneth en Master o Dueño de tienda en Cliente Satélite).
   */
  public static async triggerHandoff(params: HandoffTriggerParams): Promise<{ success: boolean; alertedPhone?: string }> {
    const cleanPhone = params.senderPhone.replace(/[^0-9]/g, '');
    console.log(`🚨 [HandoffManager] Activando Handoff para +${cleanPhone} | Motivo: ${params.reason} (${params.reasonText})`);

    try {
      // 1. Despachar mensaje de cortesía al cliente en WhatsApp para no dejarlo en visto ni mudo
      const { BaileysEngine } = await import('../whatsapp/baileys_engine.js');
      try {
        await BaileysEngine.getInstance().sendMessage(cleanPhone, this.CLIENT_HANDOFF_MESSAGE);
        await OutreachRepo.addChatMessage(cleanPhone, 'assistant', this.CLIENT_HANDOFF_MESSAGE);
      } catch (sendErr: any) {
        console.warn(`[HandoffManager] Advertencia enviando mensaje de cortesía a +${cleanPhone}:`, sendErr.message);
      }

      // 2. Silenciar la IA: Actualizar estado a HUMAN_TAKEOVER en PostgreSQL
      await OutreachRepo.updateLeadStatus(cleanPhone, 'HUMAN_TAKEOVER', {
        humanTakeoverAt: new Date().toISOString()
      });

      await OutreachRepo.updateLeadCustomFields(cleanPhone, {
        lastHandoffReason: params.reason,
        lastHandoffReasonText: params.reasonText,
        lastHandoffError: params.errorDetail || null,
        lastHandoffAt: new Date().toISOString()
      });

      // 3. Resolver destinatario de alerta de forma dinámica (Dual-Mode: Master vs Satélite Cliente)
      const settings = await OutreachRepo.getSettings();
      const isClientSatellite = process.env.MODE === 'client';

      // En Satélite Cliente va al teléfono del dueño de la tienda configurado en settings
      // En Master va a Kenneth (51902105668)
      const targetAdmin = (
        settings.adminWhatsAppPhone || 
        process.env.ADMIN_WHATSAPP_PHONE || 
        (isClientSatellite ? '' : '51902105668')
      ).replace(/[^0-9]/g, '');

      if (!targetAdmin) {
        console.warn('[HandoffManager] No hay teléfono de administrador configurado para enviar la alerta de Handoff.');
        return { success: true };
      }

      const clientTag = isClientSatellite ? `🏢 *${settings.companyName || 'TIENDA'}*` : '🚀 *THE QUANT PARTNERS*';
      const displayName = params.leadName || `Contacto +${cleanPhone}`;

      const alertMessage = 
        `🚨 *ALERTA DE ASISTENCIA / CONTROL HUMANO*\n` +
        `━━━━━━━━━━━━━━━━━━━━\n` +
        `${clientTag}\n` +
        `👤 Cliente: *${displayName}*\n` +
        `📱 Teléfono: *+${cleanPhone}*\n` +
        `⚠️ Motivo: *${params.reasonText}*\n` +
        (params.errorDetail ? `🔍 Diagnóstico: _${params.errorDetail}_\n` : '') +
        `━━━━━━━━━━━━━━━━━━━━\n` +
        `💬 *Último mensaje recibido:*\n` +
        `"${params.incomingText.slice(0, 220)}"\n` +
        `━━━━━━━━━━━━━━━━━━━━\n` +
        `👉 *Acción:* El bot fue silenciado. Por favor responde directamente al cliente en este chat.\n` +
        `👉 *Para reactivar el bot:* Escribe */bot on ${cleanPhone}*`;

      try {
        await BaileysEngine.getInstance().sendMessage(targetAdmin, alertMessage);
        console.log(`📢 [HandoffManager] Alerta de Handoff despachada a admin +${targetAdmin}`);
      } catch (adminErr: any) {
        console.error(`[HandoffManager] Error enviando alerta a admin +${targetAdmin}:`, adminErr.message);
      }

      return { success: true, alertedPhone: targetAdmin };

    } catch (criticalErr: any) {
      console.error(`❌ [HandoffManager] Error crítico ejecutando Handoff para +${cleanPhone}:`, criticalErr.message);
      return { success: false };
    }
  }

  /**
   * Analiza el mensaje del cliente y el historial reciente para detectar si corresponde
   * transferir la conversación inmediatamente a un asesor humano.
   */
  public static checkConversationalTriggers(
    incomingText: string,
    recentHistory: ChatMessage[]
  ): { shouldHandoff: boolean; reason?: 'USER_REQUESTED_HUMAN' | 'USER_FRUSTRATION' | 'REPETITION_LOOP'; reasonText?: string } {
    const clean = (incomingText || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim();

    if (!clean) return { shouldHandoff: false };

    // 1. Petición explícita de hablar con una persona / asesor / humano
    const humanKeywords = [
      'asesor', 'humano', 'persona', 'operador', 'agente', 'representante',
      'hablar con alguien', 'hablar con una persona', 'hablar con un asesor',
      'pasame a un asesor', 'pasame con alguien', 'comunicame con alguien',
      'con quien hablo', 'eres un bot', 'eres un robot', 'eres ia',
      'quiero hablar con el dueno', 'quiero hablar con un humano'
    ];

    for (const kw of humanKeywords) {
      if (clean === kw || clean.includes(kw)) {
        return {
          shouldHandoff: true,
          reason: 'USER_REQUESTED_HUMAN',
          reasonText: `El cliente solicitó expresamente atención humana ("${kw}")`
        };
      }
    }

    // 2. Frustración, reclamo o sospecha
    const frustrationKeywords = [
      'no me entiendes', 'no entiendes nada', 'pesima atencion', 'estafa',
      'fraude', 'denuncia', 'reclamo', 'libro de reclamaciones',
      'me estan paseando', 'pura maquina', 'no me sirve', 'no respondes lo que pregunto'
    ];

    for (const kw of frustrationKeywords) {
      if (clean.includes(kw)) {
        return {
          shouldHandoff: true,
          reason: 'USER_FRUSTRATION',
          reasonText: `Detección de frustración o reclamo en el cliente ("${kw}")`
        };
      }
    }

    // 3. Detector de Bucle / Repetición Consecutiva: Si el usuario repitió la misma pregunta que en su mensaje anterior
    if (recentHistory && recentHistory.length > 0) {
      const lastUserMsg = [...recentHistory].reverse().find(m => m.role === 'user');
      if (lastUserMsg) {
        const prevClean = (lastUserMsg.content || '')
          .toLowerCase()
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .trim();

        if (clean.length > 5 && clean === prevClean) {
          return {
            shouldHandoff: true,
            reason: 'REPETITION_LOOP',
            reasonText: 'El cliente repitió la misma consulta consecutivamente (bucle detectado)'
          };
        }
      }
    }

    return { shouldHandoff: false };
  }

  /**
   * Auto-Reactivación Inteligente (Ventana de 24 horas):
   * Si el chat estaba en HUMAN_TAKEOVER pero pasaron más de 24 horas desde la última
   * intervención y el cliente vuelve a escribir después de un día, reactiva la IA automáticamente.
   */
  public static async checkAutoReactivation(lead: Lead): Promise<boolean> {
    if (lead.status !== 'HUMAN_TAKEOVER' && !lead.humanTakeoverAt) {
      return false;
    }

    const takeoverDate = lead.humanTakeoverAt ? new Date(lead.humanTakeoverAt).getTime() : 0;
    if (!takeoverDate) return false;

    const diffHours = (Date.now() - takeoverDate) / (1000 * 60 * 60);

    // Si pasaron más de 24 horas de silencio, reactivar automáticamente a REPLIED
    if (diffHours >= 24) {
      console.log(`🔄 [HandoffManager] Auto-reactivando bot para +${lead.phone} tras ${Math.round(diffHours)}h de inactividad.`);
      await OutreachRepo.updateLeadStatus(lead.phone, 'REPLIED', {
        humanTakeoverAt: null
      });
      return true;
    }

    return false;
  }
}
