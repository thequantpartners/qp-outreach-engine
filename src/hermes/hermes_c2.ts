// =================================================================
// THE QUANT PARTNERS · HERMES C2 (WhatsApp Command & Control Copilot)
// =================================================================

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { OutreachRepo } from '../db/repo.js';
import { GhostCRM } from '../crm/ghost_crm.js';
import { BaileysEngine } from '../whatsapp/baileys_engine.js';
import { SalesRep } from '../types/index.js';
import { MetaCAPIClient } from '../crm/meta_capi.js';
import { OutscraperScraper } from '../scraper/outscraper_scraper.js';
import { NLPRouter } from '../whatsapp/nlp_router.js';
import { AutonomousPipeline } from '../pipeline/autonomous_pipeline.js';

export type HermesUserRole = 'master' | 'client_manager' | 'client_rep' | 'unauthorized';

export interface HermesUserIdentity {
  role: HermesUserRole;
  phone: string;
  name: string;
  repId?: string;
  companyName: string;
}

export interface HermesExecutionResult {
  handled: boolean;
  replyMessage?: string;
  actionExecuted?: string;
}

export class HermesC2 {
  private static morningReportSentToday = false;
  private static eveningReportSentToday = false;
  private static schedulerInterval: NodeJS.Timeout | null = null;
  private static cachedReadme: string | null = null;
  private static cachedReadmeTime = 0;

  /**
   * Obtiene la documentación maestra institucional (README.md) en memoria
   */
  public static getMasterDocumentation(): string {
    if (this.cachedReadme && (Date.now() - this.cachedReadmeTime < 10 * 60 * 1000)) {
      return this.cachedReadme;
    }

    try {
      const candidates = [
        path.resolve(process.cwd(), 'README.md'),
        path.resolve(process.cwd(), '../README.md'),
        '/app/README.md'
      ];
      for (const p of candidates) {
        if (fs.existsSync(p)) {
          this.cachedReadme = fs.readFileSync(p, 'utf-8');
          this.cachedReadmeTime = Date.now();
          console.log(`📘 [HermesC2] Documentación maestra README.md cargada en memoria (${this.cachedReadme.length} bytes).`);
          return this.cachedReadme;
        }
      }
    } catch (e: any) {
      console.warn('[HermesC2] No se pudo leer README.md:', e.message);
    }
    return '';
  }

  /**
   * Resuelve con precisión de 4 niveles el rol y la identidad del remitente
   */
  public static async getUserIdentity(phone: string): Promise<HermesUserIdentity> {
    const clean = phone.replace(/[^0-9]/g, '');
    const settings = await OutreachRepo.getSettings();
    const companyName = process.env.COMPANY_NAME || settings.companyName || 'The Quant Partners';
    const isClientMode = process.env.MODE === 'client';

    // 1. Master Kenneth (Siempre Master, incluso si prueba en un nodo satélite)
    if (clean === '269363907195002' || clean.endsWith('51902105668') || '51902105668'.endsWith(clean)) {
      return {
        role: 'master',
        phone: '51902105668',
        name: 'Kenneth (Director QP)',
        companyName: 'The Quant Partners'
      };
    }

    if (clean.length < 8) {
      return { role: 'unauthorized', phone: clean, name: 'Desconocido', companyName };
    }

    // 2. Gerente / Director del Cliente
    const adminPhone = (settings.adminWhatsAppPhone || process.env.ADMIN_WHATSAPP_PHONE || '').replace(/[^0-9]/g, '');
    if (adminPhone && (clean.endsWith(adminPhone) || adminPhone.endsWith(clean))) {
      return {
        role: isClientMode ? 'client_manager' : 'master',
        phone: clean,
        name: 'Gerente General',
        companyName
      };
    }

    // 3. Vendedor / Asesor Comercial Activo
    const reps = (settings.salesReps || []).filter(r => r.isActive);
    const foundRep = reps.find(r => {
      const repClean = (r.phone || '').replace(/[^0-9]/g, '');
      return repClean.length >= 8 && (clean.endsWith(repClean) || repClean.endsWith(clean));
    });

    if (foundRep) {
      return {
        role: 'client_rep',
        phone: clean,
        name: foundRep.name,
        repId: foundRep.id,
        companyName
      };
    }

    return { role: 'unauthorized', phone: clean, name: 'Desconocido', companyName };
  }

  /**
   * Determina si un número de WhatsApp corresponde al Administrador autorizado o a un Asesor de Ventas
   */
  public static async isAdminPhone(phone: string): Promise<boolean> {
    const identity = await HermesC2.getUserIdentity(phone);
    return identity.role !== 'unauthorized';
  }

  /**
   * Intercepta y procesa comandos u órdenes en lenguaje natural del Administrador o Asesor Comercial
   */
  public static async handleAdminMessage(incomingText: string, senderPhone: string): Promise<HermesExecutionResult> {
    const cleanText = incomingText.trim();
    let cmdText = cleanText;
    let lower = cleanText.toLowerCase();

    // 0. Autenticación y Resolución de Rol con Aislamiento Estricto
    const user = await HermesC2.getUserIdentity(senderPhone);
    if (user.role === 'unauthorized') {
      return { handled: false };
    }

    // 0.05. Enrutador de Lenguaje Natural (NLP): Si el mensaje no inicia con '/', resolver intención de comando
    if (!cleanText.startsWith('/')) {
      const intent = NLPRouter.resolveIntent(cleanText);
      if (intent) {
        cmdText = `/${intent.command}${intent.args.length > 0 ? ' ' + intent.args.join(' ') : ''}`;
        lower = cmdText.toLowerCase();
        console.log(`🧠 [HermesC2 NLP] Intención resuelta: "${cleanText}" -> Comando simulado: "${cmdText}"`);
      }
    }

    // 0.1. Menú de Comandos: /comandos o /help o /ayuda o /menu
    if (
      lower === '/comandos' || 
      lower === '/help' || 
      lower === '/ayuda' || 
      lower === '/menu' || 
      lower === 'comandos' || 
      lower === 'help' || 
      lower === 'ayuda' || 
      lower === 'menu'
    ) {
      let menuMsg = '';

      if (user.role === 'client_rep') {
        menuMsg = 
          `📱 *PANEL DE VENTAS · ${user.companyName.toUpperCase()}*\n` +
          `━━━━━━━━━━━━━━━━━━━━\n` +
          `¡Hola ${user.name}! Aquí tienes tus herramientas comerciales de WhatsApp:\n\n` +
          `📋 *TUS PROSPECTOS ASIGNADOS:*\n` +
          `• \`/leads\` : Tus prospectos calificados pendientes de atención.\n` +
          `• \`/lead <tel>\` : Ficha técnica, necesidad detectada y chat del prospecto.\n\n` +
          `💰 *CIERRE DE VENTAS:*\n` +
          `• \`/won <tel> <monto> [USD|PEN]\` : Registra tu venta ganada. Notifica a gerencia y optimiza Meta Ads.\n\n` +
          `📊 *TU RENDIMIENTO:*\n` +
          `• \`/status\` : Tu balance personal de ventas, cierres y efectividad.\n\n` +
          `📘 *GUÍA OPERATIVA:*\n` +
          `• \`/manual\` (o \`/sop\`) : Mejores prácticas de atención y cierre consultivo.\n\n` +
          `🤖 *COPILOT IA:*\n` +
          `Pregúntame cualquier duda sobre tus prospectos asignados o consejos de cierre.`;
      } else if (user.role === 'client_manager') {
        menuMsg = 
          `🏢 *PANEL DE CONTROL GERENCIAL · ${user.companyName.toUpperCase()}*\n` +
          `━━━━━━━━━━━━━━━━━━━━\n` +
          `Centro de Mando Comercial en WhatsApp. Herramientas disponibles:\n\n` +
          `📊 *PIPELINE Y EMBUDO:*\n` +
          `• \`/pipeline\` : Embudo completo de ventas, conversión y facturación global.\n` +
          `• \`/leads\` : Lista todos los prospectos calificados y su asesor asignado.\n` +
          `• \`/lead <tel>\` : Ficha técnica completa, notas de IA y último chat.\n` +
          `• \`/status\` : Estado de WhatsApp y métricas generales del equipo.\n\n` +
          `👥 *GESTIÓN DE EQUIPO COMERCIAL:*\n` +
          `• \`/equipo\` : Rendimiento de vendedores, ventas cerradas y conversión.\n` +
          `• \`/vendedor nuevo <Nombre> <Tel>\` : Registra un nuevo asesor y le da la bienvenida por WhatsApp.\n` +
          `• \`/vendedor baja <Tel> [Reasignar_A]\` : Liquida al asesor con dossier completo y reasigna sus leads.\n\n` +
          `🤖 *SETTER VIRTUAL Y CALIFICACIÓN:*\n` +
          `• \`/setter\` (o \`/prompt\`) : Directivas e instrucciones activas del Setter IA.\n` +
          `• \`/setsetter <instrucciones>\` : Modifica en caliente cómo califica el Setter a los clientes.\n\n` +
          `📡 *META ADS Y ALERTAS:*\n` +
          `• \`/setpixel <Pixel_ID> <Token> [TestCode]\` : Configura tu Pixel de Meta Ads con verificación en vivo.\n` +
          `• \`/pixel\` : Diagnóstico de salud y eventos enviados al Pixel/Dataset.\n` +
          `• \`/alertas on\` | \`/alertas off\` : Activa o silencia las copias de asignación de leads al gerente.\n\n` +
          `💰 *CIERRE DE VENTAS:*\n` +
          `• \`/won <tel> <monto> [USD|PEN]\` : Registra una venta ganada y optimiza Meta Ads.\n\n` +
          `📘 *GUÍA OPERATIVA:*\n` +
          `• \`/manual\` (o \`/sop\`) : Guía de atención y mejores prácticas comerciales.\n\n` +
          `🤖 *COPILOT IA:*\n` +
          `Escribe cualquier duda comercial en texto libre (ej. "¿cuántas ventas llevamos este mes?").`;
      } else {
        // Master Kenneth
        menuMsg = 
          `👑 *HERMES C2 · CATÁLOGO COMPLETO DE COMANDOS (MASTER)*\n` +
          `━━━━━━━━━━━━━━━━━━━━\n` +
          `📊 *SUPERVISIÓN Y CONTROL:*\n` +
          `• \`/status\` : Estado del gateway, campañas y métricas.\n` +
          `• \`/horarios\` : Horarios de prospección por país (USA y Perú) y bloque actual.\n` +
          `• \`/readme\` : Base de conocimiento institucional (README maestro del sistema).\n` +
          `• \`/saldo\` : Saldo y consumo en vivo de Outscraper y OpenRouter.\n` +
          `• \`/pipeline\` : Embudo comercial Ghost CRM e ingresos.\n` +
          `• \`/leads\` : Prospectos calientes pendientes de atención.\n` +
          `• \`/lead <tel>\` : Ficha técnica e historial de un prospecto.\n` +
          `• \`/pausa\` : Detener envíos de prospección en frío.\n` +
          `• \`/reanudar\` : Reactivar envíos de prospección.\n\n` +
          `🔍 *SCRAPING Y ADQUISICIÓN:*\n` +
          `• \`/scraper\` : Diagnóstico en vivo del auto-scraper de Outscraper y colas.\n` +
          `• \`/scrape <query> [max]\` : Extraer prospectos de Google Maps con Outscraper (USA y Perú).\n\n` +
          `✉️ *PROSPECCIÓN Y MENSAJES:*\n` +
          `• \`/mensaje\` : Previsualizar la plantilla activa y chequeo anti-ban.\n` +
          `• \`/setmensaje <texto>\` : Editar plantilla de prospección en caliente.\n\n` +
          `🤖 *SETTER VIRTUAL:*\n` +
          `• \`/setter\` : Ver prompt e instrucciones del Setter IA.\n` +
          `• \`/setsetter <texto>\` : Modificar instrucciones del Setter en caliente.\n\n` +
          `👥 *EQUIPO Y VENDEDORES:*\n` +
          `• \`/equipo\` : Desempeño consolidado del equipo de ventas.\n` +
          `• \`/vendedor nuevo <Nombre> <Tel>\` : Dar de alta vendedor con bienvenida por WhatsApp.\n` +
          `• \`/vendedor baja <Tel> [Reasignar_A]\` : Dossier de liquidación y reasignación anti-pérdida.\n\n` +
          `📡 *META CAPI Y ALERTAS:*\n` +
          `• \`/setpixel <Pixel_ID> <Token> [TestCode]\` : Configurar Pixel de Meta con ping en vivo.\n` +
          `• \`/pixel\` : Diagnóstico de eventos CAPI enviados.\n` +
          `• \`/alertas on|off\` : Muteo selectivo de copias de asignación al gerente.\n\n` +
          `💰 *CONVERSIONES Y CAPI:*\n` +
          `• \`/won <tel> <monto> [USD|PEN]\` : Registrar venta ganada y sincronizar con Meta CAPI.\n\n` +
          `🏢 *CLIENTES Y PROVISIÓN:*\n` +
          `• \`/provision "Empresa" <nicho> <tel_admin> "Vendedor:tel"\` : Generar nodo cliente en VPS en 60s.\n` +
          `• \`/sop\` : Manual paso a paso de onboarding de clientes.\n\n` +
          `🤖 *COPILOT IA:*\n` +
          `Escribe cualquier consulta técnica u operativa en lenguaje natural.`;
      }

      return { handled: true, replyMessage: menuMsg, actionExecuted: 'HELP_MENU' };
    }

    // 0.75. Aprobación y Validación de Pagos (Comprobantes / Vouchers / Yape / Plin / Transferencias)
    if (
      lower === 'aprobar pago' ||
      lower.startsWith('aprobar pago') ||
      lower === 'pago aprobado' ||
      lower === 'validar pago' ||
      lower.startsWith('/aprobar_pago')
    ) {
      const parts = cleanText.split(/\s+/);
      const targetPhone = parts.find(p => /^\+?\d{9,15}$/.test(p))?.replace(/[^0-9]/g, '');

      let lead: any = null;
      if (targetPhone) {
        lead = await OutreachRepo.getLeadByPhone(targetPhone);
      } else {
        const pendingLeads = await OutreachRepo.getLeads({ status: 'PAYMENT_PENDING', limit: 1 });
        if (pendingLeads && pendingLeads.length > 0) {
          lead = pendingLeads[0];
        }
      }

      if (!lead) {
        return {
          handled: true,
          replyMessage: '⚠️ No se encontró ningún prospecto con pago pendiente de verificación.\nSi deseas aprobar uno específico, escribe: *aprobar pago <teléfono>*.'
        };
      }

      await OutreachRepo.updateLeadStatus(lead.phone, 'CLOSED_WON');
      await OutreachRepo.updateLeadCustomFields(lead.phone, {
        paymentVerifiedAt: new Date().toISOString(),
        paymentStatus: 'VERIFIED'
      });

      const welcomeMsg = `¡Hola al equipo de ${lead.companyName}! 🙌 Le saluda Kenneth Herrera de The Quant Partners.\n\nConfirmamos la recepción de su comprobante. Nuestro equipo técnico ya está preparando la infraestructura de sus 4 Agentes de IA para iniciar el despliegue en las próximas 48 horas. ¡Bienvenidos a bordo! 🚀🤝`;

      try {
        const { BaileysEngine } = await import('../whatsapp/baileys_engine.js');
        await BaileysEngine.getInstance().sendMessage(lead.phone, welcomeMsg);
        await OutreachRepo.addChatMessage(lead.phone, 'assistant', welcomeMsg);
      } catch (sendErr: any) {
        console.error('[HermesC2] Error enviando mensaje de bienvenida al cliente:', sendErr.message);
      }

      const reply = 
        `✅ *PAGO VERIFICADO Y APROBADO EXITOSAMENTE*\n` +
        `━━━━━━━━━━━━━━━━━━━━\n` +
        `🏢 Cliente: *${lead.companyName}*\n` +
        `📱 Teléfono: *+${lead.phone}*\n` +
        `🕒 Aprobado: *${new Date().toLocaleTimeString('es-PE')}*\n` +
        `━━━━━━━━━━━━━━━━━━━━\n` +
        `🚀 Se despachó el mensaje de bienvenida institucional de The Quant Partners al WhatsApp del cliente.`;

      return { handled: true, replyMessage: reply, actionExecuted: 'PAYMENT_APPROVED' };
    }

    if (
      lower === 'rechazar pago' ||
      lower.startsWith('rechazar pago') ||
      lower === 'pago rechazado' ||
      lower.startsWith('/rechazar_pago')
    ) {
      const parts = cleanText.split(/\s+/);
      const targetPhone = parts.find(p => /^\+?\d{9,15}$/.test(p))?.replace(/[^0-9]/g, '');

      let lead: any = null;
      if (targetPhone) {
        lead = await OutreachRepo.getLeadByPhone(targetPhone);
      } else {
        const pendingLeads = await OutreachRepo.getLeads({ status: 'PAYMENT_PENDING', limit: 1 });
        if (pendingLeads && pendingLeads.length > 0) {
          lead = pendingLeads[0];
        }
      }

      if (!lead) {
        return {
          handled: true,
          replyMessage: '⚠️ No se encontró ningún prospecto con pago pendiente para rechazar.'
        };
      }

      await OutreachRepo.updateLeadStatus(lead.phone, 'HUMAN_TAKEOVER', {
        humanTakeoverAt: new Date().toISOString()
      });
      await OutreachRepo.updateLeadCustomFields(lead.phone, {
        paymentRejectedAt: new Date().toISOString(),
        paymentStatus: 'REJECTED'
      });

      const rejectMsg = 
        `Hola 🙌, estuvimos verificando el comprobante enviado pero no logramos validarlo en cuenta en este momento.\n\n` +
        `Kenneth de The Quant Partners se pondrá en contacto directo contigo por aquí en unos minutos para coordinar los detalles personalmente 🤝.`;

      try {
        const { BaileysEngine } = await import('../whatsapp/baileys_engine.js');
        await BaileysEngine.getInstance().sendMessage(lead.phone, rejectMsg);
        await OutreachRepo.addChatMessage(lead.phone, 'assistant', rejectMsg);
      } catch (sendErr: any) {
        console.error('[HermesC2] Error enviando aviso de rechazo al cliente:', sendErr.message);
      }

      const reply = 
        `🚨 *PAGO RECHAZADO & TAKEOVER HUMANO ACTIVADO*\n` +
        `━━━━━━━━━━━━━━━━━━━━\n` +
        `🏢 Cliente: *${lead.companyName}*\n` +
        `📱 Teléfono: *+${lead.phone}*\n` +
        `━━━━━━━━━━━━━━━━━━━━\n` +
        `Se le avisó al cliente que te comunicarás personalmente. El bot de IA ha sido silenciado para este prospecto.`;

      return { handled: true, replyMessage: reply, actionExecuted: 'PAYMENT_REJECTED' };
    }



    // 0.77. Control del Bot de IA / Reactivación post-Handoff (/bot on [tel], /bot off [tel], /bot status [tel])
    if (
      lower.startsWith('/bot') ||
      lower.startsWith('/ia') ||
      lower === 'bot on' ||
      lower === 'bot off' ||
      lower === 'ia on' ||
      lower === 'ia off'
    ) {
      const parts = cleanText.split(/\s+/);
      const action = (parts[1] || 'status').toLowerCase();
      const targetPhone = parts.find(p => /^\+?\d{9,15}$/.test(p))?.replace(/[^0-9]/g, '');

      let lead: any = null;
      if (targetPhone) {
        lead = await OutreachRepo.getLeadByPhone(targetPhone);
      } else {
        const recent = await OutreachRepo.getLeads({ limit: 10 });
        lead = recent.find(l => l.status === 'HUMAN_TAKEOVER' || !!l.humanTakeoverAt);
      }

      if (!lead) {
        return {
          handled: true,
          replyMessage: '⚠️ No se especificó ningún cliente o no hay prospectos recientes en control humano.\nUsa: */bot on <teléfono>* o */bot off <teléfono>*.'
        };
      }

      if (action === 'on' || action === 'activar' || action === 'prender' || action === 'start') {
        await OutreachRepo.updateLeadStatus(lead.phone, 'REPLIED', {
          humanTakeoverAt: null
        });
        await OutreachRepo.updateLeadCustomFields(lead.phone, {
          manualReactivationAt: new Date().toISOString()
        });

        const reply = 
          `🤖 *BOT DE IA REACTIVADO CON ÉXITO*\n` +
          `━━━━━━━━━━━━━━━━━━━━\n` +
          `👤 Cliente: *${lead.companyName}* (+${lead.phone})\n` +
          `🟢 Estado: *IA Activa (Respondiendo en 5s)*\n` +
          `━━━━━━━━━━━━━━━━━━━━\n` +
          `A partir del próximo mensaje que envíe el cliente, el bot volverá a atender automáticamente.`;
        return { handled: true, replyMessage: reply, actionExecuted: 'BOT_REACTIVATED' };
      }

      if (action === 'off' || action === 'pausar' || action === 'apagar' || action === 'stop') {
        await OutreachRepo.updateLeadStatus(lead.phone, 'HUMAN_TAKEOVER', {
          humanTakeoverAt: new Date().toISOString()
        });

        const reply = 
          `👤 *CONTROL HUMANO ACTIVADO (BOT SILENCIADO)*\n` +
          `━━━━━━━━━━━━━━━━━━━━\n` +
          `👤 Cliente: *${lead.companyName}* (+${lead.phone})\n` +
          `🔴 Estado: *Human Takeover (IA Silenciada)*\n` +
          `━━━━━━━━━━━━━━━━━━━━\n` +
          `El bot no responderá a este cliente hasta que envíes */bot on ${lead.phone}* o pasen 24h.`;
        return { handled: true, replyMessage: reply, actionExecuted: 'BOT_PAUSED' };
      }

      const isLocked = lead.status === 'HUMAN_TAKEOVER' || !!lead.humanTakeoverAt;
      const statusMsg = 
        `📊 *ESTADO DEL BOT PARA EL PROSPECTO*\n` +
        `━━━━━━━━━━━━━━━━━━━━\n` +
        `👤 Cliente: *${lead.companyName}* (+${lead.phone})\n` +
        `🤖 Estado: *${isLocked ? '🔴 Silenciado (Control Humano)' : '🟢 Activo (IA Atendiendo)'}*\n` +
        `━━━━━━━━━━━━━━━━━━━━\n` +
        `Comandos rápidos:\n` +
        `• */bot on ${lead.phone}* : Encender IA\n` +
        `• */bot off ${lead.phone}* : Silenciar IA`;
      return { handled: true, replyMessage: statusMsg, actionExecuted: 'BOT_STATUS' };
    }

    // 0.8. Aprobación y Gestión de Correos Corporativos (Zoho Mailer)
    if (
      lower === 'aprobar' || 
      lower === 'aprobar correo' || 
      lower === 'enviar correo' || 
      lower === 'enviar email' || 
      lower === 'si, envialo' || 
      lower === 'sí, envíalo' ||
      (lower.startsWith('/aprobar') && !lower.startsWith('/aprobar_pago') && !lower.startsWith('/aprobar pago')) ||
      lower.startsWith('/enviar_correo')
    ) {
      const parts = cleanText.split(/\s+/);
      const targetId = parts.length > 1 && !['correo', 'email'].includes(parts[1].toLowerCase()) ? parts[1] : undefined;
      const { EmailDispatcher } = await import('../email/email_dispatcher.js');
      const res = await EmailDispatcher.approvePendingEmail(targetId);
      if (res.success && res.draft) {
        const reply = 
          `✅ *CORREO CORPORATIVO ENVIADO CON ÉXITO*\n` +
          `━━━━━━━━━━━━━━━━━━━━\n` +
          `🏢 Empresa: *${res.draft.companyName}*\n` +
          `📧 Destinatario: *${res.draft.recipientEmail}*\n` +
          `📝 Asunto: *${res.draft.subject}*\n` +
          `🕒 Enviado: *${new Date().toLocaleTimeString('es-PE')}*\n` +
          `━━━━━━━━━━━━━━━━━━━━\n` +
          `💼 Despachado desde partners@thequantpartners.com vía Zoho Mail.`;
        return { handled: true, replyMessage: reply, actionExecuted: 'EMAIL_SENT' };
      } else {
        return { handled: true, replyMessage: `⚠️ ${res.message}` };
      }
    }

    if (
      lower === 'cancelar' || 
      lower === 'cancelar correo' || 
      lower === 'descartar' || 
      lower === 'descartar correo' ||
      lower.startsWith('/cancelar_correo')
    ) {
      const parts = cleanText.split(/\s+/);
      const targetId = parts.length > 1 && !['correo', 'email'].includes(parts[1].toLowerCase()) ? parts[1] : undefined;
      const { EmailDispatcher } = await import('../email/email_dispatcher.js');
      const res = await EmailDispatcher.cancelPendingEmail(targetId);
      return { handled: true, replyMessage: res.success ? `🗑️ ${res.message}` : `⚠️ ${res.message}` };
    }

    // 1. Comando: /status o "¿cómo vamos?"
    if (lower.startsWith('/status') || lower === 'status' || lower.includes('cómo vamos') || lower.includes('como vamos') || lower.includes('estado')) {
      if (user.role === 'client_rep') {
        const audit = await OutreachRepo.getSalesRepAudit(user.phone);
        const repMsg = 
          `👤 *MI PANEL COMERCIAL · ${user.name.toUpperCase()}*\n` +
          `━━━━━━━━━━━━━━━━━━━━\n` +
          `🏢 Empresa: *${user.companyName}*\n\n` +
          `📊 *Mi Rendimiento Comercial:*\n` +
          `• Prospectos Asignados: *${audit.totalAssigned}*\n` +
          `• En Negociación Activa: *${audit.activeNegotiations}*\n` +
          `• Ventas Cerradas Ganadas: *${audit.closedWon}*\n` +
          `• Efectividad de Cierre: *${audit.conversionRate}%*\n\n` +
          `💰 *Mi Facturación Lograda:*\n` +
          `• USD: *$${audit.revenueUSD.toLocaleString()}*\n` +
          `• PEN: *S/. ${audit.revenuePEN.toLocaleString()}*\n` +
          `━━━━━━━━━━━━━━━━━━━━\n` +
          `👉 _Escribe /leads para ver tus prospectos calientes pendientes de atención._`;
        return { handled: true, replyMessage: repMsg, actionExecuted: 'STATUS_CHECK' };
      }

      const summary = await GhostCRM.getFunnelSummary();
      const services = await OutreachRepo.getServices();
      const activeOutbound = services.filter(s => s.isActive && s.type === 'OUTBOUND');

      if (user.role === 'client_manager') {
        const msg = 
          `🏢 *SISTEMA COMERCIAL · ${user.companyName.toUpperCase()}*\n` +
          `━━━━━━━━━━━━━━━━━━━━\n` +
          `🟢 *Canal WhatsApp:* Conectado y Operativo\n\n` +
          `📊 *Métricas del Embudo de Ventas:*\n` +
          `• Total Prospectos: *${summary.totalLeads}*\n` +
          `• Contactados: *${summary.outreachSent}*\n` +
          `• Respuestas Recibidas: *${summary.replied}*\n` +
          `• Leads Calificados: *${summary.qualified}*\n` +
          `• Citas Agendadas: *${summary.meetingScheduled}*\n` +
          `• Ventas Cerradas: *${summary.closedWon}*\n` +
          `• Sincronizaciones Meta CAPI: *${summary.metaCapiEventsFired}*\n\n` +
          `💰 *Facturación Registrada:*\n` +
          `• USD: *$${summary.totalRevenueUSD.toLocaleString()}*\n` +
          `• PEN: *S/. ${summary.totalRevenuePEN.toLocaleString()}*\n` +
          `━━━━━━━━━━━━━━━━━━━━\n` +
          `💡 _Escribe /comandos para ver todas tus opciones comerciales._`;

        return { handled: true, replyMessage: msg, actionExecuted: 'STATUS_CHECK' };
      }

      // Master Kenneth
      const credits = await HermesC2.getCreditsInfo();
      let creditsSection = '';
      if (credits.outscraper) {
        const o = credits.outscraper;
        const icon = o.balance < 1 ? '⚠️' : '🗺️';
        creditsSection += `\n💳 *Consumo de Infraestructura:*\n• ${icon} Outscraper (Google Maps): *$${o.balance.toFixed(2)} USD* activo\n`;
      }
      if (credits.openrouter) {
        creditsSection += `• 🤖 OpenRouter: *$${credits.openrouter.remaining.toFixed(2)} USD* restante\n`;
      }

      const msg = 
        `🏛️ *HERMES C2 · ESTADO OPERATIVO*\n` +
        `━━━━━━━━━━━━━━━━━━━━\n` +
        `🟢 *WhatsApp Engine:* Conectado y Listo\n` +
        `📢 *Campañas Activas:* ${activeOutbound.length} outbound (${services.length} registradas)\n\n` +
        `📊 *Métricas del Ghost CRM:*\n` +
        `• Total Prospectos: *${summary.totalLeads}*\n` +
        `• Contactados en Frío: *${summary.outreachSent}*\n` +
        `• Respuestas Recibidas: *${summary.replied}*\n` +
        `• Leads Calificados: *${summary.qualified}*\n` +
        `• Citas Agendadas: *${summary.meetingScheduled}*\n` +
        `• Ventas Cerradas: *${summary.closedWon}*\n` +
        `• Rechazos / Descartados: *${summary.closedLost}*\n` +
        `• Requieren Seguimiento: *${(summary.dueConversationalFollowUp || 0) + (summary.dueColdFollowUp || 0)}* (${summary.dueConversationalFollowUp || 0} en visto / ${summary.dueColdFollowUp || 0} en frío)\n` +
        `• Conversiones Meta CAPI: *${summary.metaCapiEventsFired}*\n\n` +
        `💰 *Ingresos Registrados:*\n` +
        `• USD: *$${summary.totalRevenueUSD.toLocaleString()}*\n` +
        `• PEN: *S/. ${summary.totalRevenuePEN.toLocaleString()}*` +
        creditsSection +
        `\n━━━━━━━━━━━━━━━━━━━━\n` +
        `💡 _Escribe /comandos para ver el catálogo completo._`;

      return { handled: true, replyMessage: msg, actionExecuted: 'STATUS_CHECK' };
    }

    // 1.45. Comando: /horarios o /horario o /schedule (Rangos de prospección y adquisición)
    if (
      lower.startsWith('/horario') ||
      lower.startsWith('/horarios') ||
      lower.startsWith('/schedule') ||
      lower === 'horarios' ||
      lower === 'horario'
    ) {
      const lima = AutonomousPipeline.getLimaTime();
      const status = AutonomousPipeline.getStatus();
      let slotDesc = '🌙 Fuera de horario comercial (Outbound en pausa)';
      if (status.currentSlot === 'PERU_MORNING' || status.currentSlot === 'USA_MORNING') {
        slotDesc = '🇵🇪 *Bloque Mañanas Perú* (Activo ahora)';
      } else if (status.currentSlot === 'LUNCH_PAUSE') {
        slotDesc = '🍽️ *Pausa de Almuerzo Anti-Bot* (Activo ahora)';
      } else if (status.currentSlot === 'PERU_AFTERNOON') {
        slotDesc = '🇵🇪 *Bloque Tardes Perú* (Activo ahora)';
      }

      const msg =
        `🏛️ *HERMES C2 · HORARIOS DE ADQUISICIÓN Y OPERACIÓN*\n` +
        `━━━━━━━━━━━━━━━━━━━━\n` +
        `🕒 *Hora actual en Lima:* ${lima.timeStr} PET (UTC-5)\n` +
        `📍 *Bloque actual:* ${slotDesc}\n\n` +
        `⏰ *RANGOS HORARIOS OUTBOUND (Prospección en Frío - Todo el Perú):*\n` +
        `• 🇵🇪 *Mañanas Perú (09:00 AM – 01:00 PM PET):*\n` +
        `  ↳ Campañas para todo el Perú (Live Commerce TikTok/Instagram, tiendas moda/calzado/tech).\n` +
        `• 🍽️ *Pausa de Almuerzo (01:00 PM – 02:00 PM PET):*\n` +
        `  ↳ Cero envíos en frío. Pausa preventiva humana anti-bloqueo.\n` +
        `• 🇵🇪 *Tardes Perú (02:00 PM – 07:00 PM PET):*\n` +
        `  ↳ Segundo bloque de prospección y scraping en todo el Perú (hasta las 19:00).\n` +
        `• 🌙 *Pausa Nocturna (07:00 PM – 09:00 AM PET):*\n` +
        `  ↳ Cero envíos en frío. Apagado nocturno y reporte de cierre a las 19:00. IA Inbound 24/7 activa.\n\n` +
        `⚡ *ATENCIÓN INBOUND (Setter IA 24/7):*\n` +
        `• *Activa 24/7 sin excepción.* Si cualquier prospecto responde de día, noche o fin de semana, la IA le atiende al instante en segundos.\n\n` +
        `🛡️ *CADENCIA Y PROTECCIÓN ANTI-BAN:*\n` +
        `• Delays: 180s – 300s (3 a 5 min) aleatorio entre envíos.\n` +
        `• Límite Diario: 35 prospectos/día.\n` +
        `• Circuit Breaker: Pausa preventiva de 45 min si 10 mensajes seguidos no reciben respuesta.\n` +
        `━━━━━━━━━━━━━━━━━━━━`;

      return { handled: true, replyMessage: msg, actionExecuted: 'SCHEDULE_CHECK' };
    }

    // 1.48. Comando: /readme o /doc o /docs (Base de conocimiento institucional)
    if (
      lower.startsWith('/readme') ||
      lower.startsWith('/doc') ||
      lower.startsWith('/docs') ||
      lower === 'readme' ||
      lower === 'documentacion' ||
      lower === 'manual institucional'
    ) {
      const doc = HermesC2.getMasterDocumentation();
      const lineCount = doc ? doc.split('\n').length : 403;
      const msg = 
        `🏛️ *HERMES C2 · BASE DE CONOCIMIENTO INSTITUCIONAL*\n` +
        `━━━━━━━━━━━━━━━━━━━━\n` +
        `Tengo sincronizado el manual institucional maestro de *QP Outreach Engine & Hermes C2* (${lineCount} líneas, 10 bloques):\n\n` +
        `📚 *BLOQUES QUE PUEDES CONSULTARME POR AQUÍ:*\n` +
        `1. *Arquitectura Global:* Pipeline, scrapers y gateway Baileys/Meta Cloud.\n` +
        `2. *Horarios Duales:* Bloques USA (9-1pm) y Perú (2-6:30pm) con anti-ban.\n` +
        `3. *Comandos de Control:* Todos los comandos C2 y sintaxis operativa.\n` +
        `4. *Doctrina Comercial:* Precios ($350-$600), 4 pilares y 9 objeciones.\n` +
        `5. *Etiquetas WhatsApp:* Mapeo 1:1 de los 10 estados con Ghost CRM.\n` +
        `6. *Scraping:* Outscraper API v2 y Apify Places con deduplicación.\n` +
        `7. *Multi-Tenant SaaR:* Blueprints de nicho y provisión de clientes.\n` +
        `8. *Servidor MCP:* 24+ herramientas nativas para IAs externas.\n` +
        `9. *Despliegue:* Railway, persistencia y variables de entorno.\n` +
        `10. *Metodología SDD:* Ciclo de 4 fases para desarrollo seguro.\n\n` +
        `💡 _Escribe cualquier consulta técnica o comercial en texto libre (ej. "¿cómo funciona la pausa de almuerzo?" o "¿cuáles son los 4 pilares de venta?")._`;

      return { handled: true, replyMessage: msg, actionExecuted: 'DOCS_CHECK' };
    }

    // 1.5. Comando: /saldo o /balance o /outscraper (Consulta de créditos - Solo Master Kenneth)
    if (
      lower.startsWith('/saldo') || 
      lower.startsWith('/balance') || 
      lower.startsWith('/outscraper') || 
      lower.startsWith('/credito') || 
      lower.startsWith('/crédito') || 
      lower === 'saldo' || 
      lower === 'balance' || 
      lower.includes('saldo outscraper') || 
      lower.includes('cuanto saldo') || 
      lower.includes('cuánto saldo')
    ) {
      if (user.role !== 'master') {
        return { handled: true, replyMessage: '🔒 Comando exclusivo de infraestructura central. Escribe /comandos para ver tus opciones comerciales.' };
      }

      const credits = await HermesC2.getCreditsInfo();
      let msg = `💳 *HERMES C2 · BALANCE DE CRÉDITOS Y CONSUMO*\n━━━━━━━━━━━━━━━━━━━━\n`;

      if (credits.outscraper) {
        const o = credits.outscraper;
        const alertIcon = o.balance < 1 ? '🚨' : '🗺️';
        msg += 
          `${alertIcon} *Outscraper (Google Maps Scraping USA & Perú):*\n` +
          `• Saldo Disponible: *${o.balance < 1 ? '⚠️ ' : ''}$${o.balance.toFixed(2)} USD*\n` +
          `• Estado de Cuenta: *${o.status.toUpperCase()}*\n` +
          `• Motor: *Google Maps Search API v2 (Síncrono)*\n\n`;
      } else {
        msg += `🗺️ *Outscraper:* Token no configurado o no disponible.\n\n`;
      }

      if (credits.openrouter) {
        const op = credits.openrouter;
        msg += 
          `🤖 *OpenRouter (IA de Calificación / Setter):*\n` +
          `• Créditos Totales: *$${op.total.toFixed(2)} USD*\n` +
          `• Consumido: *$${op.used.toFixed(2)} USD* (${op.percent}%)\n` +
          `• Saldo Restante: *$${op.remaining.toFixed(2)} USD*\n\n`;
      }

      if (credits.outscraper && credits.outscraper.balance < 1) {
        msg += `⚠️ *ALERTA:* Te queda menos de $1.00 USD en Outscraper. Si vas a procesar lotes de prospección (+50 prospectos), se recomienda recargar fondos para mantener el flujo constante.`;
      } else {
        msg += `💡 _Escribe /status para ver métricas del embudo o /comandos para ver más opciones._`;
      }

      return { handled: true, replyMessage: msg, actionExecuted: 'CREDITS_CHECK' };
    }

    // 1.54. Comando: /scraper (Diagnóstico del Scraper Autónomo, Colas y Outscraper - Solo Master Kenneth)
    if (lower === '/scraper' || lower.startsWith('/scraper ') || lower === 'scraper') {
      if (user.role !== 'master') {
        return { handled: true, replyMessage: '🔒 El estado de infraestructura de scraping es exclusivo del Master Hub central.' };
      }

      const { AutonomousPipeline } = await import('../pipeline/autonomous_pipeline.js');
      const scraperInfo = await AutonomousPipeline.getScraperStatus();
      const credits = await HermesC2.getCreditsInfo();

      const isScraperActive = scraperInfo.isPipelineRunning && scraperInfo.isAutonomousConfigured;
      const statusIcon = isScraperActive ? '🟢' : '⏸️';
      const statusText = isScraperActive ? 'ACTIVO (Auto-recarga continua)' : 'PAUSADO';

      let lastScrapeSection = '• Sin extracciones en esta sesión aún.';
      if (scraperInfo.lastScrapeTime > 0) {
        const minutesAgo = Math.floor((Date.now() - scraperInfo.lastScrapeTime) / (60 * 1000));
        const dateObj = new Date(scraperInfo.lastScrapeTime);
        const timeStr = dateObj.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Lima' });
        lastScrapeSection = 
          `• *Campaña:* ${scraperInfo.lastScrapedService || 'General'}\n` +
          `• *Búsqueda:* "${scraperInfo.lastScrapedQuery}" en "${scraperInfo.lastScrapedLocation}"\n` +
          `• *Prospectos extraídos:* ${scraperInfo.lastScrapedCount} nuevos insertados\n` +
          `• *Hora:* ${timeStr} Lima (${minutesAgo === 0 ? 'hace unos momentos' : `hace ${minutesAgo} min`})`;
      }

      let buffersSection = '';
      if (scraperInfo.campaignBuffers.length === 0) {
        buffersSection = '• No hay campañas outbound activas.';
      } else {
        for (const b of scraperInfo.campaignBuffers) {
          const bufIcon = b.isBufferLow ? '⚠️' : '🟢';
          const flag = b.region === 'USA' ? '🇺🇸' : b.region === 'PERU' ? '🇵🇪' : '🌎';
          buffersSection += `• ${bufIcon} *${b.name}* (${flag}): *${b.uncontacted}* en cola ${b.isBufferLow ? '*(Recarga en próximo ciclo)*' : '*(Buffer OK)*'}\n`;
        }
      }

      const cbIcon = scraperInfo.circuitBreakerActive ? '🚨' : '🛡️';
      const cbStatus = scraperInfo.circuitBreakerActive
        ? `PAUSADO preventivo (${scraperInfo.circuitBreakerCooldownRemainingMinutes} min restantes)`
        : `Normal (${scraperInfo.consecutiveUnanswered}/10 sin respuesta)`;

      const outscraperBalance = credits.outscraper ? `$${credits.outscraper.balance.toFixed(2)} USD` : 'Token activo';

      const reply = 
        `📡 *HERMES C2 · ESTADO DEL SCRAPER Y ADQUISICIÓN*\n` +
        `━━━━━━━━━━━━━━━━━━━━\n` +
        `${statusIcon} *Estado del Scraper:* *${statusText}*\n` +
        `🗺️ *Motor Activo:* ${scraperInfo.engine}\n` +
        `💳 *Saldo Outscraper:* *${outscraperBalance}*\n\n` +
        `🔄 *Última Extracción de Prospectos:*\n` +
        `${lastScrapeSection}\n\n` +
        `📊 *Colas de Prospectos por Campaña (Buffers):*\n` +
        `${buffersSection}\n` +
        `${cbIcon} *Circuit Breaker Meta:* ${cbStatus}\n` +
        `━━━━━━━━━━━━━━━━━━━━\n` +
        `💡 _El scraper auto-recarga 25 prospectos cuando el buffer de una campaña baja de 15._\n` +
        `_Para extraer prospectos de inmediato escribe:_ \`/scrape <búsqueda> [cantidad]\``;

      return { handled: true, replyMessage: reply, actionExecuted: 'SCRAPER_STATUS' };
    }

    // 1.55. Comando: /scrape o /raspar <query> [max] (Extracción ad-hoc de comercios con Outscraper - Solo Master Kenneth)
    const scrapeMatch = cmdText.match(/^\/(?:scrape|raspar|extraer)\s+(.+)$/i);
    if (scrapeMatch) {
      if (user.role !== 'master') {
        return { handled: true, replyMessage: '🔒 El scraping de prospección es exclusivo del Master Hub central.' };
      }

      const activeService = await OutreachRepo.getActiveService();
      if (!activeService) {
        return { handled: true, replyMessage: '⚠️ No hay ninguna campaña activa para vincular los prospectos raspados. Revisa tus campañas con /status.' };
      }

      let rawQuery = scrapeMatch[1].trim();
      let limitNum = 20;

      // Detectar si el último token es una cantidad numérica (ej. "dentistas surco 30")
      const tokens = rawQuery.split(' ');
      const lastToken = tokens[tokens.length - 1];
      if (/^\d+$/.test(lastToken)) {
        limitNum = Math.min(50, Math.max(5, parseInt(lastToken, 10)));
        rawQuery = tokens.slice(0, -1).join(' ');
      }

      const isUSA = !!rawQuery.toLowerCase().match(/\b(usa|united states|eeuu|fl|florida|miami|doral|orlando|tampa|kissimmee|tx|texas|houston|dallas|austin|ny|new york|ca|california)\b/);
      const regionCode = isUSA ? 'US' : 'PE';

      try {
        console.log(`📡 [HermesC2] Iniciando scraping ad-hoc en Outscraper: "${rawQuery}" (Límite: ${limitNum}, Región: ${regionCode})...`);
        const scraped = await OutscraperScraper.scrapeGoogleMaps({
          query: rawQuery,
          limit: limitNum,
          region: regionCode
        });

        const { inserted, skipped } = await OutreachRepo.saveLeadsFromScraper(activeService.id, scraped);
        const reply = 
          `✅ *OUTSCRAPER SCRAPING FINALIZADO*\n` +
          `━━━━━━━━━━━━━━━━━━━━\n` +
          `🔍 Búsqueda: *"${rawQuery}"*\n` +
          `📥 Encontrados con teléfono válido: *${scraped.length}*\n` +
          `✨ Nuevos insertados al CRM: *${inserted}*\n` +
          `♻️ Omitidos o duplicados: *${skipped}*\n` +
          `📢 Campaña receptora: *${activeService.name}*\n` +
          `🌎 Región: *${regionCode === 'US' ? 'USA 🇺🇸' : 'Perú 🇵🇪'}*\n\n` +
          `🚀 Los nuevos prospectos entrarán ordenadamente en el pipeline de prospección autónoma.`;

        return { handled: true, replyMessage: reply, actionExecuted: 'OUTSCRAPER_SCRAPE' };
      } catch (err: any) {
        return { handled: true, replyMessage: `❌ *Error al raspar en Outscraper:* ${err.message}` };
      }
    }

    // 1.6. Comando: /mensaje o /preview o /plantilla (Previsualizar mensaje de prospección - Solo Master Kenneth)
    if (lower.startsWith('/mensaje') || lower.startsWith('/preview') || lower.startsWith('/plantilla') || lower === 'mensaje' || lower === 'plantilla') {
      if (user.role !== 'master') {
        return { handled: true, replyMessage: '🔒 *HERMES:* La configuración de plantillas outbound es gestionada centralmente desde la Matriz Maestra de The Quant Partners.' };
      }

      const activeService = await OutreachRepo.getActiveService();
      if (!activeService) {
        return { handled: true, replyMessage: '⚠️ *HERMES C2:* No hay ninguna campaña outbound activa en este momento. Escribe /status para revisar tus campañas.' };
      }

      const rawTemplate = activeService.outreachTemplate || 'Sin plantilla configurada.';
      const sampleExample = rawTemplate
        .replace(/\{\{\s*name\s*\}\}/gi, 'Clínica Estética San Isidro')
        .replace(/\{\{\s*empresa\s*\}\}/gi, 'Clínica Estética San Isidro');

      const msg = 
        `📝 *HERMES C2 · PLANTILLA DE PROSPECCIÓN ACTIVA*\n` +
        `━━━━━━━━━━━━━━━━━━━━\n` +
        `📢 *Campaña:* *${activeService.name}*\n` +
        `🆔 *ID:* \`${activeService.id}\`\n` +
        `🎯 *Mecanismo de Cierre:* \`${activeService.closingType || 'HUMAN_TAKEOVER'}\`\n\n` +
        `📋 *TEXTO VIRGEN CON VARIABLES:*\n` +
        `\`\`\`\n${rawTemplate}\n\`\`\`\n\n` +
        `👀 *EJEMPLO RENDERIZADO (Cómo lo ve el cliente real):*\n` +
        `━━━━━━━━━━━━━━━━━━━━\n` +
        `${sampleExample}\n` +
        `━━━━━━━━━━━━━━━━━━━━\n` +
        `🛡️ *Auditoría Anti-Baneo:* 0 enlaces en frío · Permiso en 2 pasos cumplido.\n\n` +
        `✏️ *Para editar esta plantilla desde WhatsApp:*\n` +
        `Escribe:\n` +
        `\`/setmensaje <tu nuevo mensaje aquí con {{name}}>\``;

      return { handled: true, replyMessage: msg, actionExecuted: 'PREVIEW_MESSAGE' };
    }

    // 1.7. Comando: /setmensaje <nuevo texto> (Editar plantilla en caliente desde WhatsApp - Solo Master Kenneth)
    const setMsgMatch = cleanText.match(/^\/setmensaje\s+([\s\S]+)$/i);
    if (setMsgMatch) {
      if (user.role !== 'master') {
        return { handled: true, replyMessage: '🔒 *HERMES:* La edición de plantillas de prospección es exclusiva del Master Hub de Kenneth.' };
      }

      const newTemplate = setMsgMatch[1].trim();

      // Regla Anti-Baneo Innegociable: Prohibido enviar links en frío
      if (/https?:\/\//i.test(newTemplate)) {
        return {
          handled: true,
          replyMessage: '🚫 *REGLA ANTI-BANEO VIOLADA:* El primer mensaje en frío NO debe contener enlaces (http/https). Debe usar la *Técnica del Permiso en 2 Pasos* pidiendo autorización para compartir el valor tras la respuesta del prospecto.'
        };
      }

      if (newTemplate.length < 30) {
        return { handled: true, replyMessage: '⚠️ El mensaje es demasiado corto (mínimo 30 caracteres para que sea persuasivo y profesional).' };
      }

      const activeService = await OutreachRepo.getActiveService();
      if (!activeService) {
        return { handled: true, replyMessage: '⚠️ No hay servicio activo para actualizar.' };
      }

      activeService.outreachTemplate = newTemplate;
      await OutreachRepo.saveService(activeService);

      const sample = newTemplate.replace(/\{\{\s*name\s*\}\}/gi, 'Clínica Dental San Isidro');

      const successMsg = 
        `✅ *HERMES C2 · PLANTILLA ACTUALIZADA EXITOSAMENTE*\n` +
        `━━━━━━━━━━━━━━━━━━━━\n` +
        `📢 Campaña: *${activeService.name}*\n\n` +
        `👀 *Nueva Previsualización:*\n` +
        `━━━━━━━━━━━━━━━━━━━━\n` +
        `${sample}\n` +
        `━━━━━━━━━━━━━━━━━━━━\n` +
        `🚀 Todos los nuevos prospectos contactados recibirán este mensaje.`;

      return { handled: true, replyMessage: successMsg, actionExecuted: 'SET_OUTREACH_MESSAGE' };
    }

    // 1.8. Comando: /pipeline o /etapas (Visualización visual del embudo de Ghost CRM)
    if (lower.startsWith('/pipeline') || lower.startsWith('/etapas') || lower === 'pipeline' || lower === 'etapas') {
      if (user.role === 'client_rep') {
        return {
          handled: true,
          replyMessage: '🔒 El embudo consolidado de la empresa es exclusivo de gerencia. Escribe /status para ver tu rendimiento personal o /leads para tus prospectos asignados.'
        };
      }

      const summary = await GhostCRM.getFunnelSummary();
      const total = summary.totalLeads || 1;
      const pct = (val: number) => Math.round((val / total) * 100);

      const msg = 
        `📊 *HERMES C2 · PIPELINE COMERCIAL (GHOST CRM)*\n` +
        `━━━━━━━━━━━━━━━━━━━━\n` +
        `📥 *1. Descubiertos (Base Fría):* ${summary.discovered} (${pct(summary.discovered)}%)\n` +
        `📨 *2. Outreach Enviado:* ${summary.outreachSent} (${pct(summary.outreachSent)}%)\n` +
        `💬 *3. Respondieron:* ${summary.replied} (${Math.round((summary.replied / (summary.outreachSent || 1)) * 100)}% resp.)\n` +
        `🎯 *4. Calificados (AI Setter):* ${summary.qualified}\n` +
        `📅 *5. Citas Agendadas:* ${summary.meetingScheduled}\n` +
        `🏆 *6. Ventas Ganadas:* ${summary.closedWon}\n` +
        `🛑 *7. Rechazos / Opt-Out:* ${summary.closedLost}\n` +
        `🔄 *8. Requieren Seguimiento:*\n` +
        `   • Anti-Ghosting (>24h en visto): *${summary.dueConversationalFollowUp || 0}*\n` +
        `   • En Frío (>48h sin respuesta): *${summary.dueColdFollowUp || 0}*\n` +
        `━━━━━━━━━━━━━━━━━━━━\n` +
        `💰 *Ingresos Totales:* *$${summary.totalRevenueUSD.toLocaleString()} USD* | *S/. ${summary.totalRevenuePEN.toLocaleString()} PEN*\n` +
        `📡 *Eventos Meta CAPI:* ${summary.metaCapiEventsFired} eventos offline sincronizados con el Pixel.\n\n` +
        `👉 _Escribe /lead <telefono> para consultar la ficha de un prospecto específico._`;

      return { handled: true, replyMessage: msg, actionExecuted: 'VIEW_PIPELINE' };
    }

    // 1.9. Comando: /lead <teléfono> (Consultar ficha técnica con aislamiento de vendedor)
    const leadDetailMatch = cleanText.match(/^\/lead\s+(\+?[0-9]{8,15})$/i);
    if (leadDetailMatch) {
      const queryPhone = leadDetailMatch[1].replace(/[^0-9]/g, '');
      const lead = await OutreachRepo.getLeadByPhone(queryPhone);

      if (!lead) {
        return { handled: true, replyMessage: `🔍 *HERMES C2:* No se encontró ningún prospecto con el número +${queryPhone}.` };
      }

      // Si es un vendedor, validar que el lead esté asignado a su cartera
      if (user.role === 'client_rep') {
        const repClean = (lead.assignedRepPhone || '').replace(/[^0-9]/g, '');
        const isAssigned = repClean.length >= 8 && (repClean.endsWith(user.phone) || user.phone.endsWith(repClean));
        if (!isAssigned) {
          return {
            handled: true,
            replyMessage: '🔒 Este prospecto no está asignado a tu cartera. Solo puedes consultar los expedientes transferidos a ti.'
          };
        }
      }

      const history = await OutreachRepo.getChatHistory(queryPhone, 2);
      const lastMsg = history[history.length - 1];

      const stageEmojis: Record<string, string> = {
        DISCOVERED: '📥 DESCUBIERTO',
        OUTREACH_SENT: '📨 MENSAJE ENVIADO',
        REPLIED: '💬 RESPONDIÓ',
        QUALIFIED: '🎯 CALIFICADO POR IA',
        MEETING_SCHEDULED: '📅 CITA AGENDADA',
        CLOSED_WON: '🏆 VENTA GANADA',
        CLOSED_LOST: '🛑 PERDIDO / OPT-OUT',
        HUMAN_TAKEOVER: '👤 CONTROL HUMANO ACTIVO'
      };

      const msg = 
        `👤 *FICHA DE PROSPECTO*\n` +
        `━━━━━━━━━━━━━━━━━━━━\n` +
        `🏢 *Empresa:* ${lead.companyName || 'Sin nombre'}\n` +
        `📱 *WhatsApp:* wa.me/${lead.phone}\n` +
        `🏷️ *Etapa Actual:* ${stageEmojis[lead.status] || lead.status}\n` +
        `📢 *Campaña:* ${lead.serviceId || 'General'}\n` +
        (lead.assignedRepName ? `👤 *Asesor Asignado:* ${lead.assignedRepName} (+${lead.assignedRepPhone})\n` : '') +
        (lead.saleAmount ? `💰 *Venta Registrada:* $${lead.saleAmount} ${lead.saleCurrency || 'USD'}\n` : '') +
        (lead.handoffNotes ? `📝 *Notas de Calificación:* "${lead.handoffNotes}"\n` : '') +
        (lastMsg ? `\n💬 *Último Mensaje:* _"${lastMsg.content.slice(0, 150)}"_\n` : '') +
        `━━━━━━━━━━━━━━━━━━━━\n` +
        `👉 _Para registrar cierre: /won ${lead.phone} <monto>_`;

      return { handled: true, replyMessage: msg, actionExecuted: 'LEAD_DETAILS' };
    }

    // 2. Comando: /pause o /pausa
    if (lower.startsWith('/pause') || lower.startsWith('/pausa') || lower === 'pausar') {
      if (user.role !== 'master') {
        return { handled: true, replyMessage: '🔒 La cadencia de prospección es administrada centralmente. Escribe /comandos para consultar tus prospectos.' };
      }

      const services = await OutreachRepo.getServices();
      let count = 0;
      for (const s of services) {
        if (s.isActive && s.type === 'OUTBOUND') {
          await OutreachRepo.toggleService(s.id, false);
          count++;
        }
      }
      const msg = `⏸️ *HERMES C2:* Se han pausado ${count} campañas outbound. Los envíos automáticos están detenidos de forma segura.`;
      return { handled: true, replyMessage: msg, actionExecuted: 'PAUSE_CAMPAIGNS' };
    }

    // 3. Comando: /resume o /reanudar
    if (lower.startsWith('/resume') || lower.startsWith('/reanudar') || lower === 'reanudar') {
      if (user.role !== 'master') {
        return { handled: true, replyMessage: '🔒 La cadencia de prospección es administrada centralmente. Escribe /comandos para consultar tus prospectos.' };
      }

      const services = await OutreachRepo.getServices();
      let count = 0;
      for (const s of services) {
        if (!s.isActive && s.type === 'OUTBOUND') {
          await OutreachRepo.toggleService(s.id, true);
          count++;
        }
      }
      const msg = `▶️ *HERMES C2:* Se han reactivado ${count} campañas outbound. El pipeline de prospección continuará con su cadencia anti-ban segura.`;
      return { handled: true, replyMessage: msg, actionExecuted: 'RESUME_CAMPAIGNS' };
    }

    // 4. Comando: /leads (Ver prospectos con aislamiento estricto de vendedor)
    if (lower.startsWith('/leads') || lower.includes('quienes respondieron') || lower.includes('quiénes respondieron')) {
      if (user.role === 'client_rep') {
        const myQualified = await OutreachRepo.getLeads({ assignedRepPhone: user.phone, status: 'QUALIFIED', limit: 5 });
        const myReplied = await OutreachRepo.getLeads({ assignedRepPhone: user.phone, status: 'REPLIED', limit: 5 });

        if (myQualified.length === 0 && myReplied.length === 0) {
          return { handled: true, replyMessage: '🔍 No tienes prospectos calientes pendientes de atención en este momento.' };
        }

        let listMsg = `📋 *TUS PROSPECTOS ASIGNADOS (${user.name.toUpperCase()}):*\n━━━━━━━━━━━━━━━━━━━━\n`;
        for (const l of myQualified) {
          listMsg += `⭐ *[CALIFICADO]* ${l.companyName}\n📱 wa.me/${l.phone}\n📝 ${l.handoffNotes ? l.handoffNotes.slice(0, 80) : 'Interesado'}\n\n`;
        }
        for (const l of myReplied) {
          listMsg += `💬 *[RESPONDIÓ]* ${l.companyName}\n📱 wa.me/${l.phone}\n\n`;
        }
        listMsg += `👉 _Escribe /won <telefono> <monto> al concretar una venta._`;
        return { handled: true, replyMessage: listMsg, actionExecuted: 'LIST_LEADS' };
      }

      // Client Manager or Master
      const repliedLeads = await OutreachRepo.getLeads({ status: 'REPLIED', limit: 5 });
      const qualifiedLeads = await OutreachRepo.getLeads({ status: 'QUALIFIED', limit: 5 });

      if (repliedLeads.length === 0 && qualifiedLeads.length === 0) {
        return { handled: true, replyMessage: '🔍 No hay prospectos calientes pendientes de atención en este momento.' };
      }

      let listMsg = `📋 *ÚLTIMOS PROSPECTOS CALIENTES:*\n━━━━━━━━━━━━━━━━━━━━\n`;
      for (const l of qualifiedLeads) {
        listMsg += `⭐ *[CALIFICADO]* ${l.companyName}\n📱 wa.me/${l.phone}\n👤 Asesor: ${l.assignedRepName || 'Gerencia'}\n\n`;
      }
      for (const l of repliedLeads) {
        listMsg += `💬 *[RESPONDIÓ]* ${l.companyName}\n📱 wa.me/${l.phone}\n\n`;
      }
      listMsg += `👉 _Escribe /won <telefono> <monto> cuando cierres una venta._`;

      return { handled: true, replyMessage: listMsg, actionExecuted: 'LIST_LEADS' };
    }

    // 5. Comando: /won <teléfono> <monto> [moneda] (Cierre de venta + Meta CAPI + Dual Alert a Gerencia)
    const wonMatch = cleanText.match(/^\/won\s+(\+?[0-9]{8,15})\s+([0-9]+(?:\.[0-9]+)?)(?:\s+(USD|PEN))?/i);
    if (wonMatch) {
      const targetPhone = wonMatch[1].replace(/[^0-9]/g, '');
      const amount = parseFloat(wonMatch[2]);
      const currency = (wonMatch[3]?.toUpperCase() as 'USD' | 'PEN') || 'USD';
      const closerName = user.name || (user.role === 'master' ? 'Director Kenneth' : 'Gerencia');

      const result = await GhostCRM.recordWonSale(targetPhone, amount, currency, closerName);

      if (!result.success) {
        return { handled: true, replyMessage: `⚠️ ${result.message}` };
      }

      // Atribuir venta al récord personal del vendedor en settings.salesReps
      const repPhoneForAttr = user.role === 'client_rep' ? user.phone : (result.lead?.assignedRepPhone || '');
      if (repPhoneForAttr) {
        await OutreachRepo.recordRepSale(repPhoneForAttr, amount, currency);
      }

      const capiStatus = result.capiSynced ? '✅ Sincronizado con Meta CAPI (Purchase)' : '⚠️ CAPI pendiente de configuración';
      const msg = 
        `🎉 *¡VENTA REGISTRADA EXITOSAMENTE!*\n` +
        `━━━━━━━━━━━━━━━━━━━━\n` +
        `👤 *Cliente:* ${result.lead?.companyName || targetPhone}\n` +
        `📱 *Teléfono:* +${targetPhone}\n` +
        `💰 *Monto:* $${amount.toLocaleString()} ${currency}\n` +
        `👤 *Cerrador:* ${closerName}\n` +
        `📡 *Meta Ads:* ${capiStatus}\n` +
        `━━━━━━━━━━━━━━━━━━━━\n` +
        `🚀 _El algoritmo de Meta Ads ha sido retroalimentado para buscar más compradores con este perfil._`;

      // Si fue vendido por un vendedor (client_rep), notificar inmediatamente al Gerente
      if (user.role === 'client_rep') {
        const settings = await OutreachRepo.getSettings();
        const managerPhone = (settings.adminWhatsAppPhone || process.env.ADMIN_WHATSAPP_PHONE || '').replace(/[^0-9]/g, '');
        if (managerPhone && managerPhone !== user.phone) {
          const alertManager = 
            `🎉 *¡NUEVA VENTA CERRADA POR ${user.name.toUpperCase()}!*\n` +
            `━━━━━━━━━━━━━━━━━━━━\n` +
            `👤 *Cliente:* ${result.lead?.companyName || targetPhone}\n` +
            `📱 *WhatsApp:* wa.me/${targetPhone}\n` +
            `💰 *Monto:* $${amount.toLocaleString()} ${currency}\n` +
            `📡 *Meta Ads:* ${capiStatus}\n` +
            `━━━━━━━━━━━━━━━━━━━━\n` +
            `👏 Gran trabajo del equipo comercial.`;
          try {
            await BaileysEngine.getInstance().sendDirectMessage(`${managerPhone}@s.whatsapp.net`, alertManager);
          } catch (mErr: any) {
            console.warn('[HermesC2] No se pudo alertar al gerente sobre la venta:', mErr.message);
          }
        }
      }

      return { handled: true, replyMessage: msg, actionExecuted: 'RECORD_SALE' };
    }

    // 5.1. Comando: /equipo (Rendimiento consolidado del equipo comercial - Gerente / Master)
    if (lower === '/equipo' || lower === 'equipo' || lower.includes('ver equipo') || lower.includes('lista de vendedores')) {
      if (user.role === 'client_rep') {
        return { handled: true, replyMessage: '🔒 La visualización del equipo completo es exclusiva de gerencia.' };
      }

      const settings = await OutreachRepo.getSettings();
      const reps = settings.salesReps || [];

      if (reps.length === 0) {
        return {
          handled: true,
          replyMessage: '👥 No hay vendedores registrados en el equipo. Usa `/vendedor nuevo <Nombre> <Tel>` para agregar uno.'
        };
      }

      let msg = `👥 *EQUIPO COMERCIAL · ${user.companyName.toUpperCase()}*\n━━━━━━━━━━━━━━━━━━━━\n`;
      for (const rep of reps) {
        const statusIcon = rep.isActive ? '🟢' : '🔴';
        const audit = await OutreachRepo.getSalesRepAudit(rep.phone);
        msg += 
          `${statusIcon} *${rep.name}* (+${rep.phone})\n` +
          `• Estado: ${rep.isActive ? 'Activo (En Round-Robin)' : 'Inactivo / Baja'}\n` +
          `• Leads Asignados: *${audit.totalAssigned}* (Activos: ${audit.activeNegotiations})\n` +
          `• Ventas Cerradas: *${audit.closedWon}* (${audit.conversionRate}% conv.)\n` +
          `• Facturación: *$${audit.revenueUSD.toLocaleString()} USD* | *S/. ${audit.revenuePEN.toLocaleString()} PEN*\n\n`;
      }
      msg += `━━━━━━━━━━━━━━━━━━━━\n`;
      msg += `➕ _Para agregar: /vendedor nuevo <Nombre> <Tel>_\n`;
      msg += `➖ _Para dar de baja: /vendedor baja <Tel> [Reasignar_A]_`;

      return { handled: true, replyMessage: msg, actionExecuted: 'VIEW_TEAM' };
    }

    // 5.2. Comando: /vendedor nuevo <Nombre> <Teléfono> (Alta de asesor comercial + Bienvenida WhatsApp)
    const newRepMatch = cleanText.match(/^\/vendedor\s+nuevo\s+(.+?)\s+(\+?[0-9]{8,15})$/i);
    if (newRepMatch) {
      if (user.role === 'client_rep') {
        return { handled: true, replyMessage: '🔒 La gestión de vendedores es exclusiva de gerencia.' };
      }

      const repName = newRepMatch[1].trim();
      const rawPhone = newRepMatch[2].replace(/[^0-9]/g, '');

      if (!repName || repName.length < 2) {
        return { handled: true, replyMessage: '⚠️ Por favor indica un nombre válido para el asesor.' };
      }

      if (rawPhone.length < 8) {
        return { handled: true, replyMessage: '⚠️ El número telefónico debe tener al menos 8 dígitos con código de país (ej. 51987654321).' };
      }

      const settings = await OutreachRepo.getSettings();
      const currentReps = settings.salesReps || [];

      // Verificar si ya existe
      const existing = currentReps.find(r => {
        const cleanExisting = (r.phone || '').replace(/[^0-9]/g, '');
        return cleanExisting && (rawPhone.endsWith(cleanExisting) || cleanExisting.endsWith(rawPhone));
      });

      if (existing) {
        if (existing.isActive) {
          return { handled: true, replyMessage: `⚠️ El asesor ${existing.name} (+${existing.phone}) ya está registrado y activo en el Round-Robin.` };
        } else {
          // Reactivar asesor inactivo
          existing.isActive = true;
          existing.name = repName;
          await OutreachRepo.updateSettings({ salesReps: currentReps });
          return { handled: true, replyMessage: `🟢 El asesor ${repName} (+${rawPhone}) ha sido reactivado en el Round-Robin.` };
        }
      }

      const newRep: SalesRep = {
        id: `rep_${Date.now()}`,
        name: repName,
        phone: rawPhone,
        isActive: true,
        leadsAssignedCount: 0,
        salesClosedCount: 0,
        totalRevenueClosed: 0,
        createdAt: new Date().toISOString()
      };

      currentReps.push(newRep);
      await OutreachRepo.updateSettings({ salesReps: currentReps });

      // Enviar mensaje de bienvenida automático al WhatsApp del nuevo asesor
      const welcomeMsg = 
        `👋 *¡HOLA ${repName.toUpperCase()}! BIENVENIDO/A AL EQUIPO*\n` +
        `━━━━━━━━━━━━━━━━━━━━\n` +
        `Has sido registrado/a como Asesor Comercial en el sistema inteligente de *${user.companyName}*.\n\n` +
        `🎯 *¿Cómo funciona tu canal de ventas?*\n` +
        `1. El Setter IA recibe a los prospectos, califica su interés y te transfiere los clientes más calientes a este chat.\n` +
        `2. Recibirás su ficha técnica y el enlace directo wa.me/ para contactarlo de inmediato y cerrar.\n` +
        `3. Al cerrar la venta, escribe aquí:\n` +
        `   \`/won <teléfono> <monto> USD\` (o PEN)\n\n` +
        `💡 _Escribe /comandos en cualquier momento para ver tu panel de ventas._`;

      try {
        await BaileysEngine.getInstance().sendDirectMessage(`${rawPhone}@s.whatsapp.net`, welcomeMsg);
      } catch (wErr: any) {
        console.warn('[HermesC2] No se pudo enviar bienvenida al vendedor:', wErr.message);
      }

      const confirmMsg = 
        `✅ *ASESOR REGISTRADO CON ÉXITO*\n` +
        `━━━━━━━━━━━━━━━━━━━━\n` +
        `👤 *Nombre:* ${repName}\n` +
        `📱 *WhatsApp:* +${rawPhone}\n` +
        `🟢 *Estado:* Activo en Round-Robin\n\n` +
        `📩 Se le ha enviado un mensaje de bienvenida con sus instrucciones comerciales.`;

      return { handled: true, replyMessage: confirmMsg, actionExecuted: 'ADD_SALES_REP' };
    }

    // 5.3. Comando: /vendedor baja <Teléfono> [tel_reasignar] (Offboarding + Dossier + Reasignación Anti-Pérdida)
    const bajaMatch = cleanText.match(/^\/vendedor\s+(?:baja|quitar)\s+(\+?[0-9]{8,15})(?:\s+(\+?[0-9]{8,15}))?$/i);
    if (bajaMatch) {
      if (user.role === 'client_rep') {
        return { handled: true, replyMessage: '🔒 La gestión de personal es exclusiva de gerencia.' };
      }

      const targetPhone = bajaMatch[1].replace(/[^0-9]/g, '');
      const reassignPhone = bajaMatch[2] ? bajaMatch[2].replace(/[^0-9]/g, '') : '';

      const settings = await OutreachRepo.getSettings();
      const currentReps = settings.salesReps || [];

      const repIndex = currentReps.findIndex(r => {
        const clean = (r.phone || '').replace(/[^0-9]/g, '');
        return clean && (targetPhone.endsWith(clean) || clean.endsWith(targetPhone));
      });

      if (repIndex === -1) {
        return { handled: true, replyMessage: `⚠️ No se encontró ningún asesor registrado con el teléfono +${targetPhone}.` };
      }

      const rep = currentReps[repIndex];

      // 1. Reporte de liquidación comercial auditando PostgreSQL
      const audit = await OutreachRepo.getSalesRepAudit(targetPhone);

      // 2. Determinar destino de reasignación
      let targetReassignPhone = '';
      let targetReassignName = '';

      if (reassignPhone) {
        const destRep = currentReps.find(r => {
          const clean = (r.phone || '').replace(/[^0-9]/g, '');
          return clean && (reassignPhone.endsWith(clean) || clean.endsWith(reassignPhone));
        });
        if (destRep) {
          targetReassignPhone = destRep.phone;
          targetReassignName = destRep.name;
        }
      }

      if (!targetReassignPhone) {
        // Fallback al Gerente
        targetReassignPhone = user.phone;
        targetReassignName = user.name || 'Gerencia General';
      }

      // 3. Reasignar prospectos en negociación activa
      const reassignedCount = await OutreachRepo.reassignLeads(targetPhone, targetReassignPhone, targetReassignName);

      // 4. Desactivar asesor en configuración
      currentReps[repIndex].isActive = false;
      await OutreachRepo.updateSettings({ salesReps: currentReps });

      // 5. Notificar al vendedor dado de baja de forma respetuosa
      const exitMsg = 
        `👋 Hola ${rep.name}. Te informamos que tu acceso al sistema comercial de ${user.companyName} ha sido desactivado. Agradecemos tu participación en el equipo.`;
      try {
        await BaileysEngine.getInstance().sendDirectMessage(`${targetPhone}@s.whatsapp.net`, exitMsg);
      } catch {}

      // 6. Enviar Dossier de Liquidación a Gerencia
      const dossierMsg = 
        `📋 *DOSSIER DE LIQUIDACIÓN COMERCIAL*\n` +
        `━━━━━━━━━━━━━━━━━━━━\n` +
        `👤 *Asesor:* ${rep.name} (+${targetPhone})\n` +
        `🔴 *Estado:* Desactivado del Round-Robin\n\n` +
        `📊 *Balance Histórico:*\n` +
        `• Total Leads Asignados: *${audit.totalAssigned}*\n` +
        `• Ventas Ganadas Cerradas: *${audit.closedWon}*\n` +
        `• Tasa de Conversión: *${audit.conversionRate}%*\n` +
        `• Facturación Lograda USD: *$${audit.revenueUSD.toLocaleString()}*\n` +
        `• Facturación Lograda PEN: *S/. ${audit.revenuePEN.toLocaleString()}*\n\n` +
        `🛡️ *Protocolo Anti-Pérdida de Leads:*\n` +
        `• Prospectos en Negociación Reasignados: *${reassignedCount}*\n` +
        `• Reasignados a: *${targetReassignName}* (+${targetReassignPhone})\n` +
        `━━━━━━━━━━━━━━━━━━━━\n` +
        `✅ Operación completada con éxito. Ningún prospecto se quedó sin seguimiento.`;

      return { handled: true, replyMessage: dossierMsg, actionExecuted: 'REMOVE_SALES_REP' };
    }

    // 5.4. Comando: /setter o /prompt (Consultar directivas del Setter IA)
    if (lower === '/setter' || lower === '/prompt' || lower === 'setter' || lower === 'prompt') {
      if (user.role === 'client_rep') {
        return { handled: true, replyMessage: '🔒 Las directivas del Setter IA son exclusivas de gerencia.' };
      }

      const activeService = (await OutreachRepo.getActiveService()) || ((await OutreachRepo.getServices())[0]);
      if (!activeService) {
        return { handled: true, replyMessage: '⚠️ No hay campaña configurada para revisar el Setter.' };
      }

      const promptText = activeService.aiSystemPrompt || 'Directivas por defecto: Setter consultivo anti-IVR, califica necesidad y transfiere al especialista humano.';

      const msg = 
        `🤖 *DIRECTIVAS ACTIVAS DEL SETTER IA*\n` +
        `━━━━━━━━━━━━━━━━━━━━\n` +
        `📢 *Campaña:* *${activeService.name}*\n` +
        `🎭 *Modo:* Conversacional Consultivo Anti-IVR\n` +
        `🎯 *Cierre:* ${activeService.closingType || 'HUMAN_TAKEOVER'}\n\n` +
        `📋 *INSTRUCCIONES / PROMPT:*\n` +
        `\`\`\`\n${promptText}\n\`\`\`\n\n` +
        `✏️ *Para modificar estas instrucciones en caliente:*\n` +
        `Escribe:\n` +
        `\`/setsetter <nuevas instrucciones para el bot>\``;

      return { handled: true, replyMessage: msg, actionExecuted: 'VIEW_SETTER_PROMPT' };
    }

    // 5.5. Comando: /setsetter <nuevas instrucciones>
    const setSetterMatch = cleanText.match(/^\/setsetter\s+([\s\S]+)$/i);
    if (setSetterMatch) {
      if (user.role === 'client_rep') {
        return { handled: true, replyMessage: '🔒 La modificación del Setter es exclusiva de gerencia.' };
      }

      const newPrompt = setSetterMatch[1].trim();
      if (newPrompt.length < 20) {
        return { handled: true, replyMessage: '⚠️ Las instrucciones deben tener al menos 20 caracteres para ser efectivas.' };
      }

      const activeService = (await OutreachRepo.getActiveService()) || ((await OutreachRepo.getServices())[0]);
      if (!activeService) {
        return { handled: true, replyMessage: '⚠️ No hay campaña activa para configurar.' };
      }

      activeService.aiSystemPrompt = newPrompt;
      await OutreachRepo.saveService(activeService);

      const msg = 
        `✅ *INSTRUCCIONES DEL SETTER IA ACTUALIZADAS*\n` +
        `━━━━━━━━━━━━━━━━━━━━\n` +
        `📢 Campaña: *${activeService.name}*\n\n` +
        `👀 *Nuevas Directivas en Caliente:*\n` +
        `\`\`\`\n${newPrompt.slice(0, 300)}${newPrompt.length > 300 ? '...' : ''}\n\`\`\`\n\n` +
        `🚀 El Setter aplicará estas directivas de inmediato a las nuevas interacciones.`;

      return { handled: true, replyMessage: msg, actionExecuted: 'SET_SETTER_PROMPT' };
    }

    // 5.6. Comando: /alertas on y /alertas off (Muteo de copias al Gerente)
    if (
      lower === '/alertas on' || 
      lower === '/alertas off' || 
      lower === '/mutear' || 
      lower === '/desmutear' || 
      lower.startsWith('/alertas')
    ) {
      if (user.role === 'client_rep') {
        return { handled: true, replyMessage: '🔒 El control de alertas es exclusivo de gerencia.' };
      }

      const enable = lower.includes('on') || lower.includes('desmutear') || lower.includes('activar');
      await OutreachRepo.updateSettings({ managerLeadAlertsEnabled: enable });

      if (enable) {
        const msg = 
          `🔔 *ALERTAS DE ASIGNACIÓN ACTIVADAS*\n` +
          `━━━━━━━━━━━━━━━━━━━━\n` +
          `Recibirás una notificación por WhatsApp cada vez que la IA califique un prospecto y se lo asigne a un asesor de tu equipo.`;
        return { handled: true, replyMessage: msg, actionExecuted: 'TOGGLE_ALERTS' };
      } else {
        const msg = 
          `🔕 *ALERTAS DE ASIGNACIÓN SILENCIADAS*\n` +
          `━━━━━━━━━━━━━━━━━━━━\n` +
          `Se han pausado las notificaciones de copia al asignar prospectos a los vendedores (ideal para horas pico).\n\n` +
          `⚠️ *Nota importante:* Las notificaciones de *Ventas Ganadas (/won)* permanecerán SIEMPRE activas para asegurar el control de ingresos.`;
        return { handled: true, replyMessage: msg, actionExecuted: 'TOGGLE_ALERTS' };
      }
    }

    // 5.7. Comando: /setpixel <Pixel_ID> <Token> [TestCode] (Configurar Meta Pixel con ping en vivo)
    const setPixelMatch = cleanText.match(/^\/setpixel\s+([0-9]{10,25})\s+(\S+)(?:\s+(\S+))?$/i);
    if (setPixelMatch) {
      if (user.role === 'client_rep') {
        return { handled: true, replyMessage: '🔒 La configuración de Meta Ads es exclusiva de gerencia.' };
      }

      const pixelId = setPixelMatch[1].trim();
      const token = setPixelMatch[2].trim();
      const testCode = setPixelMatch[3]?.trim();

      // Probar conexión en vivo con Meta Graph API
      const testResult = await MetaCAPIClient.testConnection(pixelId, token, testCode);

      // Persistir credenciales en CampaignSettings
      await OutreachRepo.updateSettings({
        metaDatasetId: pixelId,
        metaCapiToken: token,
        metaTestEventCode: testCode || ''
      });

      let statusMsg = '';
      if (testResult.success) {
        statusMsg = `🟢 *Conexión Verificada:* Ping exitoso contra Meta Graph API (v21.0). Eventos listos para sincronización en tiempo real.`;
      } else {
        statusMsg = `⚠️ *Credenciales Guardadas, pero Meta reportó:* "${testResult.error}". Verifica que el token tenga el permiso \`ads_management\` o que el Dataset ID pertenezca a tu cuenta comercial.`;
      }

      const msg = 
        `📡 *CONFIGURACIÓN META CAPI / PIXEL*\n` +
        `━━━━━━━━━━━━━━━━━━━━\n` +
        `🆔 *Dataset / Pixel ID:* \`${pixelId}\`\n` +
        `🔑 *Access Token:* \`${token.slice(0, 10)}...${token.slice(-5)}\`\n` +
        (testCode ? `🧪 *Código de Testeo:* \`${testCode}\`\n` : '') +
        `\n${statusMsg}\n━━━━━━━━━━━━━━━━━━━━\n` +
        `🚀 Ahora cada vez que registres una venta con \`/won\`, Meta Ads aprenderá a buscar más compradores con ese perfil exacto.`;

      return { handled: true, replyMessage: msg, actionExecuted: 'SET_PIXEL' };
    }

    // 5.8. Comando: /pixel (Consultar diagnóstico del Pixel de Meta Ads)
    if (lower === '/pixel' || lower === 'pixel') {
      if (user.role === 'client_rep') {
        return { handled: true, replyMessage: '🔒 La información de Meta Ads es exclusiva de gerencia.' };
      }

      const settings = await OutreachRepo.getSettings();
      const summary = await GhostCRM.getFunnelSummary();
      const pixelId = settings.metaDatasetId || process.env.META_DATASET_ID || process.env.META_PIXEL_ID;
      const hasToken = !!(settings.metaCapiToken || process.env.META_CAPI_ACCESS_TOKEN);

      if (!pixelId) {
        return {
          handled: true,
          replyMessage: 
            `📡 *META CAPI · NO CONFIGURADO*\n` +
            `━━━━━━━━━━━━━━━━━━━━\n` +
            `Aún no has vinculado tu Pixel de Meta Ads.\n\n` +
            `👉 *Para activarlo por WhatsApp, escribe:*\n` +
            `\`/setpixel <Pixel_ID> <Access_Token> [TestCode]\``
        };
      }

      const msg = 
        `📡 *DIAGNÓSTICO META CAPI / PIXEL*\n` +
        `━━━━━━━━━━━━━━━━━━━━\n` +
        `🆔 *Dataset / Pixel ID:* \`${pixelId}\`\n` +
        `🔑 *Token:* ${hasToken ? '✅ Configurado' : '❌ Falta Token'}\n` +
        (settings.metaTestEventCode ? `🧪 *Código Test:* \`${settings.metaTestEventCode}\`\n` : '') +
        `📊 *Eventos Offline Sincronizados:* *${summary.metaCapiEventsFired}*\n` +
        `━━━━━━━━━━━━━━━━━━━━\n` +
        `💡 _Para actualizar credenciales: /setpixel <ID> <Token>_`;

      return { handled: true, replyMessage: msg, actionExecuted: 'VIEW_PIXEL' };
    }

    // 6. Comando: /sop o /manual o /guia
    if (
      lower === '/sop' || 
      lower === 'sop' || 
      lower === '/manual' || 
      lower === 'manual' || 
      lower === '/guia' || 
      lower === 'guia' || 
      lower.includes('dame el sop') || 
      lower.includes('manual') || 
      lower.includes('cómo instalo')
    ) {
      if (user.role === 'client_rep') {
        const sopMsg = 
          `📘 *GUÍA OPERATIVA · ASESOR DE VENTAS*\n` +
          `━━━━━━━━━━━━━━━━━━━━\n` +
          `*1. Alerta de Lead Calificado:*\n` +
          `Cuando la IA detecta que un prospecto quiere cotizar o agendar, recibirás un mensaje privado con su necesidad y su enlace directo wa.me/.\n\n` +
          `*2. Contacto Inmediato:*\n` +
          `Abre el enlace de inmediato y salúdalo de forma consultiva. Los primeros 5 minutos definen el 80% de la conversión.\n\n` +
          `*3. Consulta de Expediente:*\n` +
          `Escribe \`/lead <teléfono>\` para ver qué respondió previamente a la IA.\n\n` +
          `*4. Registro de Venta Ganada:*\n` +
          `Apenas cierre la compra, escribe en este chat:\n` +
          `\`/won <teléfono> <monto> USD\` (o PEN)\n` +
          `Esto registrará tu comisión y notificará a gerencia.\n\n` +
          `━━━━━━━━━━━━━━━━━━━━\n` +
          `💡 _Escribe /status para ver tus ventas cerradas acumuladas._`;
        return { handled: true, replyMessage: sopMsg, actionExecuted: 'REP_SOP' };
      }

      if (user.role === 'client_manager') {
        const portalUrl = process.env.PUBLIC_URL || '';
        const sopMsg = 
          `📘 *GUÍA OPERATIVA GERENCIAL · ${user.companyName.toUpperCase()}*\n` +
          `━━━━━━━━━━━━━━━━━━━━\n` +
          `*1. Supervisión en Tiempo Real:*\n` +
          `Consulta el embudo global con \`/pipeline\` y los últimos leads con \`/leads\`.\n\n` +
          `*2. Gestión del Equipo:*\n` +
          `Usa \`/equipo\` para ver métricas por vendedor, \`/vendedor nuevo\` para dar de alta y \`/vendedor baja\` para liquidar y reasignar prospectos.\n\n` +
          `*3. Calibración del Setter IA:*\n` +
          `Revisa las instrucciones del bot con \`/setter\` y ajústalas en caliente con \`/setsetter <texto>\`.\n\n` +
          `*4. Meta Ads CAPI:*\n` +
          `Conecta tu Pixel con \`/setpixel\` para que las ventas ganadas con \`/won\` optimicen tus anuncios de Meta automáticamente.\n\n` +
          `*5. Notificaciones:*\n` +
          `Usa \`/alertas off\` para pausar copias de prospectos en horas punta.\n\n` +
          (portalUrl ? `*6. Dashboard Web:*\nVisualiza tu pipeline en: https://${portalUrl}/portal\n\n` : '') +
          `━━━━━━━━━━━━━━━━━━━━\n` +
          `💡 _Escribe /comandos para ver todas tus herramientas._`;
        return { handled: true, replyMessage: sopMsg, actionExecuted: 'CLIENT_SOP' };
      }

      const sopMsg = 
        `📘 *HERMES C2 · SOP DE INSTALACIÓN RÁPIDA*\n` +
        `━━━━━━━━━━━━━━━━━━━━\n` +
        `*1. Pide al cliente:* IP y SSH de su VPS ($4-$6 Hetzner/DigitalOcean), celular del gerente y lista de vendedores.\n\n` +
        `*2. Aprovisiona aquí por WhatsApp:*\n` +
        `\`/provision "Nombre Empresa" clinicas_salud 51999888777 "Carlos:519111222"\`\n\n` +
        `*3. Pega en su VPS por SSH:*\n` +
        `El comando curl generado (tarda < 2 min).\n\n` +
        `*4. Escanea WhatsApp:*\n` +
        `Entran a su dashboard con el PIN generado y escanean QR en 30s.\n\n` +
        `*5. Entrega el Portal:*\n` +
        `Le pasas su enlace: \`http://IP:3100/portal\` (solo lectura).\n` +
        `━━━━━━━━━━━━━━━━━━━━\n` +
        `💡 _Guía completa en docs/SOP_ONBOARDING_CLIENTES.md_`;
      return { handled: true, replyMessage: sopMsg, actionExecuted: 'SOP_HELP' };
    }

    // 7. Comando: /provision <nombre> <nicho> <adminPhone> <vendedores>
    if (lower.startsWith('/provision')) {
      if (user.role !== 'master') {
        return { handled: true, replyMessage: '🔒 Comando no disponible. Escribe /comandos para ver tus opciones comerciales.' };
      }
      try {
        const { Deployer } = await import('../master/deployer.js');
        const regex = /^\/provision\s+"([^"]+)"\s+([a-zA-Z0-9_-]+)\s+([0-9+]+)\s+"([^"]+)"/i;
        const match = cleanText.match(regex);

        if (!match) {
          const help = 
            `⚠️ *Uso correcto del comando /provision:*\n\n` +
            `\`/provision "Nombre Empresa" nicho adminPhone "Nombre1:Tel1,Nombre2:Tel2"\`\n\n` +
            `*Ejemplo:*\n` +
            `\`/provision "Clínica Sonrisas" clinicas_salud 51999888777 "Dr. Carlos:51911122233,Dra. Maria:51944455566"\`\n\n` +
            `*Nichos disponibles:* clinicas_salud, inmobiliarias, estudios_abogados, construccion_b2b, live_commerce, custom`;
          return { handled: true, replyMessage: help, actionExecuted: 'PROVISION_HELP' };
        }

        const companyName = match[1].trim();
        const niche = match[2].trim();
        const adminPhone = match[3].replace(/[^0-9]/g, '');
        const salesRepsRaw = match[4].trim();

        const salesReps = salesRepsRaw.split(',').map(r => {
          const [name, phone] = r.split(':');
          return {
            name: name?.trim() || 'Asesor',
            phone: (phone || '').replace(/[^0-9]/g, '')
          };
        }).filter(r => r.phone.length >= 8);

        if (salesReps.length === 0) {
          return { handled: true, replyMessage: '⚠️ Debe incluir al menos un vendedor con formato "Nombre:Telefono".' };
        }

        const provisionResult = await Deployer.provisionClient({
          companyName,
          niche,
          adminPhone,
          salesReps,
          deployTarget: 'vps'
        });

        const masterBase = process.env.PUBLIC_URL || 'https://gateway-production-2264.up.railway.app';
        const installUrl = `${masterBase.startsWith('http') ? masterBase : 'https://' + masterBase}/api/install/${provisionResult.clientId}/${provisionResult.clientPin}`;

        const successMsg = 
          `🚀 *¡CLIENTE APROVISIONADO EXITOSAMENTE!*\n` +
          `━━━━━━━━━━━━━━━━━━━━\n` +
          `🏢 *Empresa:* ${provisionResult.companyName}\n` +
          `🆔 *ID:* \`${provisionResult.clientId}\`\n` +
          `🔑 *PIN Maestro:* \`${provisionResult.clientPin}\`\n` +
          `👥 *Vendedores:* ${provisionResult.salesRepsCount}\n\n` +
          `📋 *COMANDO PARA PEGAR EN EL VPS POR SSH:*\n` +
          `\`curl -sSL ${installUrl} | bash\`\n` +
          `━━━━━━━━━━━━━━━━━━━━\n` +
          `👉 *Próximo paso:* Conéctate por SSH al VPS del cliente y pega este comando. Todo quedará corriendo en 120s con Zero Leakage.`;

        return { handled: true, replyMessage: successMsg, actionExecuted: 'PROVISION_CLIENT' };
      } catch (err: any) {
        return { handled: true, replyMessage: `❌ Error aprovisionando cliente: ${err.message}` };
      }
    }

    // 8. Lenguaje Natural Copilot vía OpenRouter (Gemini Flash) contextualizado por Rol
    return await this.handleNaturalLanguageQuery(cleanText, user);
  }

  /**
   * Procesa consultas en lenguaje natural según el rol e identidad del usuario
   */
  private static async handleNaturalLanguageQuery(query: string, user: HermesUserIdentity): Promise<HermesExecutionResult> {
    const summary = await GhostCRM.getFunnelSummary();
    const settings = await OutreachRepo.getSettings();
    const apiKey = settings.aiApiKey || process.env.OPENROUTER_API_KEY || '';

    let systemPrompt = '';

    if (user.role === 'client_rep') {
      const audit = await OutreachRepo.getSalesRepAudit(user.phone);
      systemPrompt = 
        `Eres el Asistente Comercial de WhatsApp para el asesor comercial ${user.name} en la empresa ${user.companyName}.
Hablas con tono motivador, consultivo, ágil y profesional.
Tu misión es ayudarle a responder dudas sobre técnicas de ventas, cómo dar seguimiento a sus prospectos o cómo usar sus herramientas de WhatsApp.

DATOS PERSONALES DEL ASESOR:
- Asesor: ${user.name}
- Leads asignados: ${audit.totalAssigned}
- Negociaciones activas: ${audit.activeNegotiations}
- Ventas cerradas: ${audit.closedWon}
- Facturación cerrada: $${audit.revenueUSD} USD / S/. ${audit.revenuePEN} PEN

INSTRUCCIONES:
- Responde de forma clara y directa (máximo 2 párrafos breves).
- Si te pide ver sus leads, sugiérele /leads. Si te pide ver un lead, /lead <tel>. Si cerró una venta, /won <tel> <monto>.
- NUNCA menciones facturación global de la empresa, scraping, Apify ni infraestructura técnica interna.`;
    } else if (user.role === 'client_manager') {
      systemPrompt = 
        `Eres el Asistente Comercial Inteligente para la Dirección de ${user.companyName}.
Hablas con el gerente comercial por WhatsApp con tono consultivo, respetuoso, conciso y profesional.

DATOS ACTUALES DEL EMBUDO DE VENTAS (GHOST CRM):
- Total Prospectos: ${summary.totalLeads}
- Prospectos Contactados: ${summary.outreachSent}
- Respondieron (Mostraron interés inicial): ${summary.replied}
- Calificados por IA: ${summary.qualified}
- Citas Agendadas: ${summary.meetingScheduled}
- Ventas Cerradas: ${summary.closedWon}
- Rechazos / No interesados / Opt-Out: ${summary.closedLost}
- Leads que requieren seguimiento HOY: ${(summary.dueConversationalFollowUp || 0) + (summary.dueColdFollowUp || 0)} (${summary.dueConversationalFollowUp || 0} anti-ghosting en visto, ${summary.dueColdFollowUp || 0} en frío)
- Ingresos USD: $${summary.totalRevenueUSD}
- Ingresos PEN: S/. ${summary.totalRevenuePEN}
- Sincronizaciones Meta CAPI: ${summary.metaCapiEventsFired}

INSTRUCCIONES:
- Responde de forma clara y directa (máximo 2 párrafos breves).
- Si te preguntan por interesados, respuestas, rechazos o seguimientos pendientes, responde de inmediato con las cifras exactas del embudo.
- Si te piden acciones, sugiéreles los comandos disponibles: /pipeline, /equipo, /vendedor nuevo, /vendedor baja, /setter, /setpixel, /alertas, /leads, /lead <tel>, /won <tel> <monto>, /status, /manual.
- NUNCA menciones scraping, Outscraper, proxies ni costos de infraestructura técnica interna.`;
    } else {
      // Master Kenneth
      const credits = await HermesC2.getCreditsInfo();
      let creditsPrompt = '';
      if (credits.outscraper) {
        creditsPrompt += `\n- Outscraper (Scraping Google Maps USA & Perú): Saldo disponible $${credits.outscraper.balance.toFixed(2)} USD (Estado: ${credits.outscraper.status}).`;
      }
      if (credits.openrouter) {
        creditsPrompt += `\n- OpenRouter (IA): Créditos totales $${credits.openrouter.total.toFixed(2)} USD, Consumido: $${credits.openrouter.used.toFixed(2)} USD, Saldo restante: $${credits.openrouter.remaining.toFixed(2)} USD.`;
      }

      const { AutonomousPipeline } = await import('../pipeline/autonomous_pipeline.js');
      const pipelineStatus = AutonomousPipeline.getStatus();
      const limaTime = AutonomousPipeline.getLimaTime();

      let slotDescription = 'Fuera de Horario (Pausa Nocturna 7:00 PM - 9:00 AM). Prospección saliente y scraping apagados; setter inbound 24/7 activo.';
      if (pipelineStatus.currentSlot === 'PERU_MORNING' || pipelineStatus.currentSlot === 'USA_MORNING') {
        slotDescription = 'Bloque Mañanas Perú (9:00 AM - 1:00 PM). Prospección y scraping activos en todo el Perú.';
      } else if (pipelineStatus.currentSlot === 'LUNCH_PAUSE') {
        slotDescription = 'Pausa de Almuerzo Anti-Bot (1:00 PM - 2:00 PM). Envíos en frío y scraping pausados.';
      } else if (pipelineStatus.currentSlot === 'PERU_AFTERNOON') {
        slotDescription = 'Bloque Tardes Perú (2:00 PM - 7:00 PM). Prospección y scraping activos en todo el Perú.';
      }

      const masterDoc = HermesC2.getMasterDocumentation();
      const docPrompt = masterDoc
        ? `\n\nBASE DE CONOCIMIENTO INSTITUCIONAL MAESTRA (README.md DEL SISTEMA):\n"""\n${masterDoc}\n"""`
        : '';

      systemPrompt = 
        `Eres Hermes, el copiloto estratégico y socio de operaciones de Kenneth Herrera en The Quant Partners 🤝🚀.
Hablas directamente con Kenneth por WhatsApp con energía de socio co-fundador: 100% humano, ágil, cercano, espontáneo y resolutivo.

HORA Y ESTADO EN VIVO DEL SISTEMA (ZONA OFICIAL LIMA, PERÚ - UTC-5):
- Hora actual exacta: ${limaTime.timeStr} (PET)
- Bloque horario en curso: ${slotDescription}
- Motor de Prospección Autónomo: ${pipelineStatus.isRunning ? 'ACTIVO Y DESPACHANDO' : 'PAUSADO'}
- Prospectos contactados hoy: ${pipelineStatus.sentToday} (Mañanas: ${pipelineStatus.sentMorning})
- Atención Inbound WhatsApp: ACTIVA 24/7 (nunca duerme)

REGLAS DE HORARIOS Y SCRAPING (COMPRENSIÓN NATURAL DE OPERACIONES):
1. BLOQUES COMERCIALES OFICIALES (PET - TODO EL PERÚ):
   - Mañanas Perú: 9:00 AM a 1:00 PM (13:00).
   - Pausa de Almuerzo Anti-Bot: 1:00 PM a 2:00 PM (14:00). Cero prospección en frío.
   - Tardes Perú: 2:00 PM a 7:00 PM (19:00).
2. APAGADO EXACTO A LAS 19:00 (7:00 PM):
   - A las 19:00 PET en punto, TODO el motor de prospección saliente y el scraping autónomo SE APAGAN por la noche hasta las 9:00 AM del día siguiente, y se despacha el reporte nocturno de cierre.
   - Si Kenneth te pregunta si a las 19:00 se apaga el scraper u outbound, la respuesta es SÍ: a las 19:00 se detiene el outbound y el scraper por la noche.
3. CÓMO OPERA EL SCRAPER DE OUTSCRAPER:
   - Se activa de forma autónoma ÚNICAMENTE si el buffer de prospectos de una campaña baja de 15 leads Y SIEMPRE dentro de las horas comerciales activas (nunca de noche ni en hora de almuerzo).

DATOS ACTUALES DEL GHOST CRM:
- Total Leads: ${summary.totalLeads}
- Prospectos Contactados: ${summary.outreachSent}
- Respondieron (Mostraron interés inicial): ${summary.replied}
- Calificados por IA (Alta intención de compra / agendamiento): ${summary.qualified}
- Citas Agendadas: ${summary.meetingScheduled}
- Ventas Cerradas (Ganadas): ${summary.closedWon}
- Rechazos / No interesados / Opt-Out: ${summary.closedLost}
- Leads que requieren seguimiento HOY:
  * Seguimiento Anti-Ghosting (>24h sin contestar en chat activo): ${summary.dueConversationalFollowUp || 0}
  * Seguimiento en frío (>48h sin responder primer mensaje): ${summary.dueColdFollowUp || 0}
  * Total requiriendo seguimiento: ${(summary.dueConversationalFollowUp || 0) + (summary.dueColdFollowUp || 0)}
- Ingresos USD: $${summary.totalRevenueUSD}
- Ingresos PEN: S/. ${summary.totalRevenuePEN}
- Eventos Meta CAPI Disparados: ${summary.metaCapiEventsFired}

SALDOS Y CONSUMO EN TIEMPO REAL:${creditsPrompt}
${docPrompt}

ARQUITECTURA DE 4 AGENTES DE IA EN PARALELO & ESTRATEGIA COMERCIAL:
1. LOS 4 AGENTES OPERANDO EN PARALELO:
   - Agente 1 (Prospección Activa): Mapeo y contacto continuo de prospectos calificados en Google Maps/Meta para inyectar flujo constante semana a semana.
   - Agente 2 (Atención 24/7 en 5s con IA): Respuesta inmediata día y noche, precalificación de presupuesto e intención real, filtrado de curiosos.
   - Agente 3 (Seguimiento Anti-Ghosting): Recontacto automático tras 24h a prospectos en REPLIED que dejaron de contestar a mitad de chat (recupera hasta un 40% de ventas).
   - Agente 4 (Sincronización CRM & Alertas): Sus asesores reciben directo en WhatsApp las alertas listas para cerrar con el cliente listo.
2. MATRIZ OFICIAL DE PRECIOS REGIONAL:
   - PERÚ Y LATAM (+51):
     * Mensualidad plana: $450 a $800 USD/mes según volumen de prospección y conversaciones.
     * Setup / Instalación: Llave en mano en 48h ($350 - $500 USD en llamada de Meet, bonificable con pago trimestral).
   - USA COMUNIDAD LATINA (+1 / Florida, Texas, etc.):
     * Mensualidad plana: $850 a $1,500 USD/mes según volumen.
     * Setup / Instalación: Llave en mano en 48h ($750 - $1,200 USD en llamada de Meet, bonificable con pago trimestral).
   - AS BAJO LA MANGA DE KENNETH (COSTE DE TRANSFERENCIA / ÉXITO):
     * $25 - $50 USD por cita calificada agendada.
     * ESTRICTAMENTE PROHIBIDO mencionarlo de inicio en WhatsApp por el bot. Es tu carta ganadora exclusiva en el Meet si el cliente pide pagar por resultados.

PERSONALIDAD Y TONO DE COMUNICACIÓN (CERO ACARTONAMIENTO):
1. CERO FORMALISMOS ROBÓTICOS: NUNCA empieces con encabezados fríos de carta tipo "Kenneth," ni termines con "Saludos." o firmas burocráticas.
2. SÉ NATURAL, CERCANO Y DIRECTO: Habla como un socio inteligente chateando por WhatsApp. Respuestas ágiles de 1 a 2 párrafos concisos.
3. USA EMOJIS: Incorpora siempre 1 a 2 emojis naturales (🤝, ⚡, 🎯, 🚀, 🌙, 💡, 🙌) para dinamizar la conversación.
4. COMPRENSIÓN DE LENGUAJE NATURAL:
   - Responde con sentido común a preguntas cotidianas teniendo en cuenta la hora actual (${limaTime.timeStr}) y el estado del negocio.
   - Si te preguntan si algo se pausa o arranca, evalúa la hora actual contra los horarios del sistema y responde claro.
   - Si te preguntan cómo vamos, dales un pulso rápido con métricas y saldo.
   - Si Kenneth te pregunta cuántas personas interesadas tenemos, cuántos mostraron interés, cuántos nos rechazaron o cuántos requieren seguimiento:
     * Mostraron interés / Respondieron (abrieron conversación en frío): ${summary.replied} prospectos.
     * Calificados con alta intención de compra (listos para Meet / cierre): ${summary.qualified} prospectos.
     * Rechazos / No interesados / Opt-Out: ${summary.closedLost} prospectos (descartados limpiamente sin insistir).
     * Requieren seguimiento HOY: ${(summary.dueConversationalFollowUp || 0) + (summary.dueColdFollowUp || 0)} prospectos en total (${summary.dueConversationalFollowUp || 0} anti-ghosting que nos dejaron en visto en chat activo >24h, y ${summary.dueColdFollowUp || 0} en frío que no respondieron el primer mensaje >48h).
     Responde siempre con estas cifras exactas, de forma conversacional y enérgica.
   - Si te piden comandos de acción (/status, /saldo, /pipeline, /pausa, /reanudar, /leads, /won, /provision), ejecútalos o indícales el comando rápido.
   - Si piden tocar código o git, recuérdale con buen humor que esas tareas de ingeniería las ejecuta Smith / Antigravity en la consola, mientras tú cuidas la operación en caliente por WhatsApp.`;
    }

    try {
      const resp = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://thequantpartners.com',
          'X-Title': user.role !== 'master' ? `QP Outreach Engine - ${user.companyName}` : 'QP Outreach Engine - Hermes C2'
        },
        body: JSON.stringify({
          model: settings.aiModel || 'google/gemini-2.5-flash',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: query }
          ],
          temperature: 0.3,
          max_tokens: 800
        })
      });

      if (resp.ok) {
        const json = await resp.json() as any;
        const answer = json?.choices?.[0]?.message?.content || 'Mensaje procesado.';
        const badge = user.role !== 'master' ? `📱 *ASISTENTE COMERCIAL:*` : `🏛️ *HERMES C2:*`;
        return { handled: true, replyMessage: `${badge}\n\n${answer}`, actionExecuted: 'NATURAL_LANGUAGE' };
      }
    } catch (err: any) {
      console.warn('[HermesC2] Error consultando LLM para admin:', err.message);
    }

    const fallback = user.role !== 'master'
      ? `📱 *ASISTENTE COMERCIAL:* Recibido. Escribe /comandos para ver tus opciones comerciales (/leads, /won, /status, /manual).`
      : `🏛️ *HERMES C2:* Recibido. Comandos disponibles: /status, /saldo, /pipeline, /leads, /won, /provision.`;

    return {
      handled: true,
      replyMessage: fallback
    };
  }

  /**
   * Inicia el planificador de briefings automáticos diarios (9:00 AM y 7:00 PM)
   */
  public static initScheduler(): void {
    if (this.schedulerInterval) return;

    console.log('⏰ [HermesC2] Planificador de briefings automáticos iniciado (9:00 AM y 7:00 PM).');

    this.schedulerInterval = setInterval(async () => {
      const now = new Date();
      // Hora local Perú (GMT-5)
      const peruHour = (now.getUTCHours() - 5 + 24) % 24;
      const peruMinute = now.getUTCMinutes();

      // Morning Briefing: 9:00 AM
      if (peruHour === 9 && peruMinute < 5 && !this.morningReportSentToday) {
        this.morningReportSentToday = true;
        await this.dispatchMorningBriefing();
      }

      // Evening Closing Report: 7:00 PM (19:00)
      if (peruHour === 19 && peruMinute < 5 && !this.eveningReportSentToday) {
        this.eveningReportSentToday = true;
        await this.dispatchEveningReport();
      }

      // Reset flags a medianoche
      if (peruHour === 0 && peruMinute < 5) {
        this.morningReportSentToday = false;
        this.eveningReportSentToday = false;
      }
    }, 60000);
  }

  /**
   * Despacha el Briefing Matutino (9:00 AM) al WhatsApp de Kenneth
   */
  public static async dispatchMorningBriefing(): Promise<void> {
    const summary = await GhostCRM.getFunnelSummary();
    const message = 
      `🌅 *HERMES C2 · BRIEFING MATUTINO (9:00 AM)*\n` +
      `━━━━━━━━━━━━━━━━━━━━\n` +
      `¡Buenos días Kenneth! El sistema de adquisición está activo y listo para la jornada.\n\n` +
      `📊 *Resumen del Pipeline:*\n` +
      `• Leads en Seguimiento: *${summary.replied}*\n` +
      `• Leads Calificados: *${summary.qualified}*\n` +
      `• Citas Registradas: *${summary.meetingScheduled}*\n` +
      `• Ingresos Acumulados: *$${summary.totalRevenueUSD.toLocaleString()} USD*\n\n` +
      `🎯 *Plan del Día:*\n` +
      `1. Prospección PyMEs Perú (Mañana: 9am - 1pm)\n` +
      `2. Prospección SMBs USA Latina (Tarde: 2pm - 6pm)\n\n` +
      `👉 _Escribe /status en cualquier momento para ver avances en vivo._`;

    await BaileysEngine.getInstance().notifyAdmin(message);
  }

  /**
   * Despacha el Reporte de Cierre Vespertino (7:00 PM) al WhatsApp de Kenneth
   */
  public static async dispatchEveningReport(): Promise<void> {
    const summary = await GhostCRM.getFunnelSummary();
    const message = 
      `🌆 *HERMES C2 · REPORTE DE CIERRE (7:00 PM)*\n` +
      `━━━━━━━━━━━━━━━━━━━━\n` +
      `Resumen de actividad comercial del día:\n\n` +
      `• Prospectos Contactados: *${summary.outreachSent}*\n` +
      `• Nuevas Respuestas: *${summary.replied}*\n` +
      `• Calificados por AI Setter: *${summary.qualified}*\n` +
      `• Ventas Cerradas: *${summary.closedWon}*\n` +
      `• Eventos Meta CAPI Transmitidos: *${summary.metaCapiEventsFired}*\n\n` +
      `💤 _El pipeline de envíos pausará automáticamente hasta las 9:00 AM de mañana._`;

    await BaileysEngine.getInstance().notifyAdmin(message);
  }

  /**
   * Consulta el saldo en tiempo real de Outscraper y OpenRouter
   */
  public static async getCreditsInfo(): Promise<{
    outscraper?: { balance: number; status: string; currency: string };
    openrouter?: { total: number; used: number; remaining: number; percent: string };
  }> {
    const settings = await OutreachRepo.getSettings();
    const openRouterKey = settings.aiApiKey || process.env.OPENROUTER_API_KEY || '';

    let outscraper: { balance: number; status: string; currency: string } | undefined = undefined;
    try {
      outscraper = await OutscraperScraper.getCredits();
    } catch (e: any) {
      console.warn('[HermesC2] Error consultando saldo Outscraper:', e.message);
    }

    let openrouter: { total: number; used: number; remaining: number; percent: string } | undefined = undefined;
    if (openRouterKey) {
      try {
        const res = await fetch('https://openrouter.ai/api/v1/credits', {
          headers: { Authorization: `Bearer ${openRouterKey}` }
        });
        if (res.ok) {
          const d: any = await res.json();
          const total = d?.data?.total_credits || 0;
          const used = d?.data?.total_usage || 0;
          const remaining = Math.max(0, total - used);
          openrouter = {
            total,
            used,
            remaining,
            percent: total > 0 ? ((used / total) * 100).toFixed(1) : '0'
          };
        }
      } catch (e: any) {
        console.warn('[HermesC2] Error consultando saldo OpenRouter:', e.message);
      }
    }

    return { outscraper, openrouter };
  }
}
