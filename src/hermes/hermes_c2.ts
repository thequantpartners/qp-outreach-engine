// =================================================================
// THE QUANT PARTNERS · HERMES C2 (WhatsApp Command & Control Copilot)
// =================================================================

import { OutreachRepo } from '../db/repo.js';
import { GhostCRM } from '../crm/ghost_crm.js';
import { BaileysEngine } from '../whatsapp/baileys_engine.js';

export interface HermesExecutionResult {
  handled: boolean;
  replyMessage?: string;
  actionExecuted?: string;
}

export class HermesC2 {
  private static morningReportSentToday = false;
  private static eveningReportSentToday = false;
  private static schedulerInterval: NodeJS.Timeout | null = null;

  /**
   * Determina si un número de WhatsApp corresponde al Administrador autorizado
   */
  public static async isAdminPhone(phone: string): Promise<boolean> {
    const clean = phone.replace(/[^0-9]/g, '');
    if (clean === '269363907195002') return true;
    const settings = await OutreachRepo.getSettings();
    const adminPhone = (settings.adminWhatsAppPhone || process.env.ADMIN_WHATSAPP_PHONE || '51902105668').replace(/[^0-9]/g, '');
    return clean.endsWith(adminPhone) || adminPhone.endsWith(clean);
  }

  /**
   * Intercepta y procesa comandos u órdenes en lenguaje natural del Administrador
   */
  public static async handleAdminMessage(incomingText: string, senderPhone: string): Promise<HermesExecutionResult> {
    const cleanText = incomingText.trim();
    const lower = cleanText.toLowerCase();

    console.log(`👑 [HermesC2] Mensaje de control recibido de Kenneth (+${senderPhone}): "${cleanText}"`);

    // 1. Comando: /status o "¿cómo vamos?"
    if (lower.startsWith('/status') || lower === 'status' || lower.includes('cómo vamos') || lower.includes('como vamos') || lower.includes('estado')) {
      const summary = await GhostCRM.getFunnelSummary();
      const services = await OutreachRepo.getServices();
      const activeOutbound = services.filter(s => s.isActive && s.type === 'OUTBOUND');
      const credits = await HermesC2.getCreditsInfo();

      let creditsSection = '';
      if (credits.apify) {
        const a = credits.apify;
        const icon = a.remaining < 1 ? '⚠️' : '🕷️';
        creditsSection += `\n💳 *Consumo de Infraestructura:*\n• ${icon} Apify: *$${a.remaining.toFixed(2)} USD* restante (${a.percent}% usado de $${a.max})\n`;
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
        `• Contactados: *${summary.outreachSent}*\n` +
        `• Respuestas Recibidas: *${summary.replied}*\n` +
        `• Leads Calificados: *${summary.qualified}*\n` +
        `• Citas Agendadas: *${summary.meetingScheduled}*\n` +
        `• Ventas Cerradas: *${summary.closedWon}*\n` +
        `• Conversiones Meta CAPI: *${summary.metaCapiEventsFired}*\n\n` +
        `💰 *Ingresos Registrados:*\n` +
        `• USD: *$${summary.totalRevenueUSD.toLocaleString()}*\n` +
        `• PEN: *S/. ${summary.totalRevenuePEN.toLocaleString()}*` +
        creditsSection +
        `\n━━━━━━━━━━━━━━━━━━━━\n` +
        `💡 _Escribe /saldo, /leads, /pausa, /reanudar o /sop_`;

      return { handled: true, replyMessage: msg, actionExecuted: 'STATUS_CHECK' };
    }

    // 1.5. Comando: /saldo o /balance o /apify (Consulta de créditos)
    if (
      lower.startsWith('/saldo') || 
      lower.startsWith('/balance') || 
      lower.startsWith('/apify') || 
      lower.startsWith('/credito') || 
      lower.startsWith('/crédito') || 
      lower === 'saldo' || 
      lower === 'balance' || 
      lower.includes('saldo apify') || 
      lower.includes('cuanto saldo') || 
      lower.includes('cuánto saldo')
    ) {
      const credits = await HermesC2.getCreditsInfo();
      let msg = `💳 *HERMES C2 · BALANCE DE CRÉDITOS Y CONSUMO*\n━━━━━━━━━━━━━━━━━━━━\n`;

      if (credits.apify) {
        const a = credits.apify;
        const alertIcon = a.remaining < 1 ? '🚨' : '🕷️';
        msg += 
          `${alertIcon} *Apify (Scraping Google Maps / B2B):*\n` +
          `• Límite Mensual: *$${a.max.toFixed(2)} USD*\n` +
          `• Consumido: *$${a.used.toFixed(2)} USD* (${a.percent}%)\n` +
          `• Saldo Restante: *${a.remaining < 1 ? '⚠️ ' : ''}$${a.remaining.toFixed(2)} USD*\n` +
          `• Próxima Renovación: *${a.reset}*\n\n`;
      } else {
        msg += `🕷️ *Apify:* Token no configurado o no disponible.\n\n`;
      }

      if (credits.openrouter) {
        const o = credits.openrouter;
        msg += 
          `🤖 *OpenRouter (IA de Calificación / Setter):*\n` +
          `• Créditos Totales: *$${o.total.toFixed(2)} USD*\n` +
          `• Consumido: *$${o.used.toFixed(2)} USD* (${o.percent}%)\n` +
          `• Saldo Restante: *$${o.remaining.toFixed(2)} USD*\n\n`;
      }

      if (credits.apify && credits.apify.remaining < 1) {
        msg += `⚠️ *ALERTA:* Te queda menos de $1.00 USD en Apify. Si vas a lanzar un lote grande de scraping (+50 prospectos), se recomienda recargar fondos para evitar pausas.`;
      } else {
        msg += `💡 _Escribe /status para ver métricas del embudo o /sop para el manual._`;
      }

      return { handled: true, replyMessage: msg, actionExecuted: 'CREDITS_CHECK' };
    }

    // 1.6. Comando: /mensaje o /preview o /plantilla (Previsualizar mensaje de prospección - Solo Master Kenneth)
    if (lower.startsWith('/mensaje') || lower.startsWith('/preview') || lower.startsWith('/plantilla') || lower === 'mensaje' || lower === 'plantilla') {
      const isClientNode = process.env.MODE === 'client';
      if (isClientNode) {
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
      const isClientNode = process.env.MODE === 'client';
      if (isClientNode) {
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

      // Actualizar en base de datos
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
        `━━━━━━━━━━━━━━━━━━━━\n` +
        `💰 *Ingresos Totales:* *$${summary.totalRevenueUSD.toLocaleString()} USD* | *S/. ${summary.totalRevenuePEN.toLocaleString()} PEN*\n` +
        `📡 *Eventos Meta CAPI:* ${summary.metaCapiEventsFired} eventos offline sincronizados con el Pixel.\n\n` +
        `👉 _Escribe /lead <telefono> para consultar la ficha de un prospecto específico._`;

      return { handled: true, replyMessage: msg, actionExecuted: 'VIEW_PIPELINE' };
    }

    // 1.9. Comando: /lead <teléfono> (Consultar ficha técnica de un prospecto específico)
    const leadDetailMatch = cleanText.match(/^\/lead\s+(\+?[0-9]{8,15})$/i);
    if (leadDetailMatch) {
      const queryPhone = leadDetailMatch[1].replace(/[^0-9]/g, '');
      const lead = await OutreachRepo.getLeadByPhone(queryPhone);

      if (!lead) {
        return { handled: true, replyMessage: `🔍 *HERMES C2:* No se encontró ningún prospecto con el número +${queryPhone}.` };
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
        `👤 *HERMES C2 · FICHA DE PROSPECTO*\n` +
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
        `👉 _Para marcar como venta: /won ${lead.phone} <monto>_`;

      return { handled: true, replyMessage: msg, actionExecuted: 'LEAD_DETAILS' };
    }

    // 2. Comando: /pause o /pausa
    if (lower.startsWith('/pause') || lower.startsWith('/pausa') || lower === 'pausar') {
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

    // 4. Comando: /leads (Ver prospectos recientes en seguimiento)
    if (lower.startsWith('/leads') || lower.includes('quienes respondieron') || lower.includes('quiénes respondieron')) {
      const repliedLeads = await OutreachRepo.getLeads({ status: 'REPLIED', limit: 5 });
      const qualifiedLeads = await OutreachRepo.getLeads({ status: 'QUALIFIED', limit: 5 });

      if (repliedLeads.length === 0 && qualifiedLeads.length === 0) {
        return { handled: true, replyMessage: '🔍 *HERMES C2:* No hay prospectos pendientes de atención en este momento.' };
      }

      let listMsg = `📋 *HERMES C2 · ÚLTIMOS LEADS CALIENTES:*\n━━━━━━━━━━━━━━━━━━━━\n`;
      for (const l of qualifiedLeads) {
        listMsg += `⭐ *[CALIFICADO]* ${l.companyName}\n📱 wa.me/${l.phone}\n👤 Asesor: ${l.assignedRepName || 'Kenneth'}\n\n`;
      }
      for (const l of repliedLeads) {
        listMsg += `💬 *[RESPONDIÓ]* ${l.companyName}\n📱 wa.me/${l.phone}\n\n`;
      }
      listMsg += `👉 _Escribe /won <telefono> <monto> cuando cierres una venta._`;

      return { handled: true, replyMessage: listMsg, actionExecuted: 'LIST_LEADS' };
    }

    // 5. Comando: /won <teléfono> <monto> [moneda] (Cierre de venta + Meta CAPI)
    const wonMatch = cleanText.match(/^\/won\s+(\+?[0-9]{8,15})\s+([0-9]+(?:\.[0-9]+)?)(?:\s+(USD|PEN))?/i);
    if (wonMatch) {
      const targetPhone = wonMatch[1].replace(/[^0-9]/g, '');
      const amount = parseFloat(wonMatch[2]);
      const currency = (wonMatch[3]?.toUpperCase() as 'USD' | 'PEN') || 'USD';

      const result = await GhostCRM.recordWonSale(targetPhone, amount, currency, 'Director Kenneth');

      if (!result.success) {
        return { handled: true, replyMessage: `⚠️ *HERMES C2:* ${result.message}` };
      }

      const capiStatus = result.capiSynced ? '✅ Sincronizado con Meta CAPI (Purchase)' : '⚠️ CAPI pendiente de configuración';
      const msg = 
        `🎉 *¡VENTA REGISTRADA EXITOSAMENTE!*\n` +
        `━━━━━━━━━━━━━━━━━━━━\n` +
        `👤 *Cliente:* ${result.lead?.companyName || targetPhone}\n` +
        `📱 *Teléfono:* +${targetPhone}\n` +
        `💰 *Monto:* $${amount.toLocaleString()} ${currency}\n` +
        `📡 *Meta Ads:* ${capiStatus}\n` +
        `━━━━━━━━━━━━━━━━━━━━\n` +
        `🚀 _El algoritmo de Meta Ads ha sido retroalimentado para buscar más compradores con este perfil._`;

      return { handled: true, replyMessage: msg, actionExecuted: 'RECORD_SALE' };
    }

    // 6. Comando: /sop o "sop"
    if (lower === '/sop' || lower === 'sop' || lower.includes('dame el sop') || lower.includes('sop de instalacion') || lower.includes('cómo instalo')) {
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
            `*Nichos disponibles:* clinicas_salud, inmobiliarias, estudios_abogados, construccion_b2b, custom`;
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

    // 8. Lenguaje Natural Copilot vía OpenRouter (Gemini Flash)
    return await this.handleNaturalLanguageQuery(cleanText);
  }

  /**
   * Procesa consultas en lenguaje natural del Administrador usando OpenRouter
   */
  private static async handleNaturalLanguageQuery(query: string): Promise<HermesExecutionResult> {
    const summary = await GhostCRM.getFunnelSummary();
    const settings = await OutreachRepo.getSettings();
    const apiKey = settings.aiApiKey || process.env.OPENROUTER_API_KEY || '';
    const credits = await HermesC2.getCreditsInfo();

    let creditsPrompt = '';
    if (credits.apify) {
      creditsPrompt += `\n- Apify (Scraping): Límite $${credits.apify.max} USD, Consumido: $${credits.apify.used.toFixed(2)} USD, Saldo restante: $${credits.apify.remaining.toFixed(2)} USD (${credits.apify.percent}% consumido). Reinicia: ${credits.apify.reset}.`;
    }
    if (credits.openrouter) {
      creditsPrompt += `\n- OpenRouter (IA): Créditos totales $${credits.openrouter.total.toFixed(2)} USD, Consumido: $${credits.openrouter.used.toFixed(2)} USD, Saldo restante: $${credits.openrouter.remaining.toFixed(2)} USD.`;
    }

    const systemPrompt = 
      `Eres Hermes, el Agente Copiloto de Operaciones y C2 de Kenneth Herrera en The Quant Partners.
Hablas directamente con Kenneth por WhatsApp con tono ejecutivo, ultra-analítico, conciso y respetuoso.

DATOS ACTUALES DEL GHOST CRM:
- Total Leads: ${summary.totalLeads}
- Prospectos Contactados: ${summary.outreachSent}
- Respondieron: ${summary.replied}
- Calificados: ${summary.qualified}
- Citas Agendadas: ${summary.meetingScheduled}
- Ventas Cerradas: ${summary.closedWon}
- Ingresos USD: $${summary.totalRevenueUSD}
- Ingresos PEN: S/. ${summary.totalRevenuePEN}
- Eventos Meta CAPI Disparados: ${summary.metaCapiEventsFired}

SALDOS Y CONSUMO DE PLATAFORMAS EN TIEMPO REAL:${creditsPrompt}

INSTRUCCIONES:
- Responde a su pregunta de forma clara y directa (máximo 2 párrafos breves).
- Si te pregunta por saldos de Apify o OpenRouter, dale los números exactos con tono ejecutivo y alerta si Apify está bajo ($< 1 USD).
- Si te pide realizar una acción que tiene un comando (/status, /saldo, /pausa, /reanudar, /won <tel> <monto>, /leads, /sop, /provision), indícale el resultado o recomiéndale el comando exacto.`;

    try {
      const resp = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://thequantpartners.com',
          'X-Title': 'QP Outreach Engine - Hermes C2'
        },
        body: JSON.stringify({
          model: settings.aiModel || 'google/gemini-2.5-flash',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: query }
          ],
          temperature: 0.3,
          max_tokens: 350
        })
      });

      if (resp.ok) {
        const json = await resp.json() as any;
        const answer = json?.choices?.[0]?.message?.content || 'Comando recibido por Hermes.';
        return { handled: true, replyMessage: `🏛️ *HERMES C2:*\n\n${answer}`, actionExecuted: 'NATURAL_LANGUAGE' };
      }
    } catch (err: any) {
      console.warn('[HermesC2] Error consultando LLM para admin:', err.message);
    }

    return {
      handled: true,
      replyMessage: `🏛️ *HERMES C2:* Recibido. Comandos disponibles: /status, /pausa, /reanudar, /leads, /won <tel> <monto>.`
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
   * Consulta el saldo en tiempo real de Apify y OpenRouter
   */
  public static async getCreditsInfo(): Promise<{
    apify?: { max: number; used: number; remaining: number; reset: string; percent: string };
    openrouter?: { total: number; used: number; remaining: number; percent: string };
  }> {
    const settings = await OutreachRepo.getSettings();
    const apifyToken = settings.apifyToken || process.env.APIFY_TOKEN || '';
    const openRouterKey = settings.aiApiKey || process.env.OPENROUTER_API_KEY || '';

    let apify: { max: number; used: number; remaining: number; reset: string; percent: string } | undefined = undefined;
    if (apifyToken) {
      try {
        const res = await fetch('https://api.apify.com/v2/users/me/limits', {
          headers: { Authorization: `Bearer ${apifyToken}` }
        });
        if (res.ok) {
          const d: any = await res.json();
          const max = d?.data?.limits?.maxMonthlyUsageUsd || 5;
          const used = d?.data?.current?.monthlyUsageUsd || 0;
          const remaining = Math.max(0, max - used);
          const endAt = d?.data?.monthlyUsageCycle?.endAt;
          const reset = endAt ? new Date(endAt).toLocaleDateString('es-PE', { day: '2-digit', month: 'short' }) : 'Próximo mes';
          apify = {
            max,
            used,
            remaining,
            reset,
            percent: ((used / max) * 100).toFixed(1)
          };
        }
      } catch (e: any) {
        console.warn('[HermesC2] Error consultando saldo Apify:', e.message);
      }
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

    return { apify, openrouter };
  }
}
