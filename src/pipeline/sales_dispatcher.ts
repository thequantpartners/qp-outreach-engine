// =================================================================
// THE QUANT PARTNERS · SALES DISPATCHER (Round-Robin & Handoff)
// =================================================================

import { OutreachRepo } from '../db/repo.js';
import { Lead, SalesRep } from '../types/index.js';
import { BaileysEngine } from '../whatsapp/baileys_engine.js';
import { GhostCRM } from '../crm/ghost_crm.js';

export interface LeadQualificationDetails {
  need?: string;
  urgency?: string;
  budget?: string;
  summary?: string;
  lastMessage?: string;
}

export class SalesDispatcher {
  /**
   * Ejecuta el traspaso calificado (Setter -> Rep Humano / Kenneth)
   * Asigna el vendedor por Round-Robin, silencia a la IA y despacha la alerta privada
   */
  public static async dispatchQualifiedLead(
    leadPhone: string,
    details: LeadQualificationDetails,
    campaignName?: string
  ): Promise<{ success: boolean; assignedRep?: SalesRep; message: string }> {
    const cleanPhone = leadPhone.replace(/[^0-9]/g, '');
    const lead = await OutreachRepo.getLead(cleanPhone);

    if (!lead) {
      return { success: false, message: `Lead ${cleanPhone} no encontrado en CRM.` };
    }

    // 1. Obtener siguiente vendedor por Round-Robin
    let assignedRep: SalesRep | null = null;
    try {
      assignedRep = await OutreachRepo.getNextSalesRep();
    } catch {
      // Fallback si no hay vendedores configurados
    }

    const repName = assignedRep?.name || 'Director Kenneth';
    const repPhone = assignedRep?.phone || (await OutreachRepo.getSettings()).adminWhatsAppPhone || process.env.ADMIN_WHATSAPP_PHONE || '';
    const cleanRepPhone = repPhone.replace(/[^0-9]/g, '');

    // 2. Registrar en Ghost CRM como QUALIFIED y activar HUMAN_TAKEOVER
    await GhostCRM.transitionStatus(cleanPhone, 'QUALIFIED', {
      assignedRepName: repName,
      assignedRepPhone: cleanRepPhone,
      handoffNotes: details.summary || `Calificado: ${details.need || 'Interés comercial'}`
    });

    // 3. Construir plantilla de alerta enriquecida para WhatsApp
    const needLabel = details.need || 'No especificada';
    const urgencyLabel = details.urgency || 'Inmediata / Esta semana';
    const budgetLabel = details.budget || 'Calificado';
    const lastMsgSnippet = details.lastMessage || 'El cliente solicita atención y cotización.';
    const compName = lead.companyName || 'Contacto Comercial';
    const cName = campaignName || lead.serviceName || lead.serviceId || 'Prospección Directa';

    const isImmediate = urgencyLabel.toLowerCase().includes('inmediat') || urgencyLabel.toLowerCase().includes('ahora') || urgencyLabel.toLowerCase().includes('ya');
    const scheduleDisplay = isImmediate ? '🔥 INMEDIATO / LLAMAR AHORA MISMO' : urgencyLabel;

    const alertMessage = 
      `🚨 *PROSPECTO CALIFICADO PIDE LLAMADA DE CIERRE*\n` +
      `━━━━━━━━━━━━━━━━━━━━\n` +
      `👤 *Prospecto:* ${compName}\n` +
      `📱 *WhatsApp:* wa.me/${cleanPhone} (+${cleanPhone})\n` +
      `🏢 *Rubro / Campaña:* ${cName}\n\n` +
      `📋 *Ficha de Calificación:*\n` +
      `• *Volumen / Necesidad:* ${needLabel}\n` +
      `• *⏰ Horario para Llamar:* ${scheduleDisplay}\n` +
      `• *🎯 Motivo / Objeción:* ${budgetLabel}\n\n` +
      `💬 *Último mensaje del prospecto:*\n` +
      `"${lastMsgSnippet}"\n` +
      `━━━━━━━━━━━━━━━━━━━━\n` +
      `👉 *Haz clic para abrir el chat o llamar:*\n` +
      `https://wa.me/${cleanPhone}\n` +
      `⚡ _La IA ha sido silenciada en esta conversación para tu llamada._`;

    // 4. Despachar mensaje privado al WhatsApp del vendedor o al Administrador
    try {
      const baileys = BaileysEngine.getInstance();
      if (cleanRepPhone) {
        await baileys.notifyPhone(cleanRepPhone, alertMessage);
      } else {
        await baileys.notifyAdmin(alertMessage);
      }
      console.log(`🚀 [SalesDispatcher] Lead +${cleanPhone} transferido a ${repName} (+${cleanRepPhone}) exitosamente.`);

      // 5. Copia informativa al Gerente (si el vendedor asignado no es el Gerente y las alertas están activas)
      const settings = await OutreachRepo.getSettings();
      const adminPhone = (settings.adminWhatsAppPhone || process.env.ADMIN_WHATSAPP_PHONE || '').replace(/[^0-9]/g, '');
      const alertsEnabled = settings.managerLeadAlertsEnabled !== false;

      if (alertsEnabled && adminPhone && adminPhone !== cleanRepPhone) {
        const managerNotification = 
          `📌 *NUEVO LEAD ASIGNADO*\n` +
          `━━━━━━━━━━━━━━━━━━━━\n` +
          `🏢 *Cliente:* ${compName} (+${cleanPhone})\n` +
          `👤 *Asesor:* ${repName} (+${cleanRepPhone})\n` +
          `🎯 *Necesidad:* ${needLabel}\n` +
          `⚡ *Urgencia:* ${urgencyLabel}\n` +
          `👉 _Escribe /lead ${cleanPhone} para ver la ficha o /alertas off para silenciar estas copias._`;

        await baileys.notifyPhone(adminPhone, managerNotification).catch((err: any) => {
          console.warn('[SalesDispatcher] No se pudo enviar copia al gerente:', err.message);
        });
      }
    } catch (err: any) {
      console.error(`❌ [SalesDispatcher] Error despachando alerta de WhatsApp a ${repName}:`, err.message);
    }

    return {
      success: true,
      assignedRep: assignedRep || undefined,
      message: `Lead transferido exitosamente a ${repName}`
    };
  }
}
