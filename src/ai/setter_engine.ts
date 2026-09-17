// =================================================================
// THE QUANT PARTNERS · AI SETTER ENGINE (Qualifier & Triager)
// =================================================================

import { OutreachRepo } from '../db/repo.js';
import { Lead, ServiceDefinition } from '../types/index.js';
import { SalesDispatcher, LeadQualificationDetails } from '../pipeline/sales_dispatcher.js';

export interface SetterResponse {
  replyText: string;
  isQualified: boolean;
  isTransferred: boolean;
  qualificationDetails?: LeadQualificationDetails;
}

export class SetterEngine {
  private static readonly DEFAULT_MODEL = 'google/gemini-2.5-flash';

  /**
   * Prompt especializado para la captación interna de The Quant Partners
   * Ofrece "Asesoría Gratuita de Diagnóstico", precalifica y solo transfiere con interés real
   */
  public static getKennethSetterPrompt(lead?: Lead): string {
    const cleanPhone = lead?.phone ? lead.phone.replace(/[^0-9]/g, '') : '';
    const isUSA = cleanPhone.startsWith('1') && cleanPhone.length === 11 ||
      !!(lead?.address || '').toLowerCase().match(/\b(usa|united states|eeuu|fl|florida|miami|doral|orlando|tampa|kissimmee|tx|texas|houston|dallas|austin|ny|new york|ca|california)\b/);

    const priceRangeStr = isUSA ? '$850 a $1,500 USD/mes' : '$450 a $800 USD/mes';
    const priceResponseStr = isUSA
      ? 'La inversión es una tarifa plana de $850 a $1,500 USD al mes según el volumen de chats, mes a mes y listo en 48h (sin permanencia forzosa). Se autofinancia con 1-2 ventas adicionales al mes. ¿Cuántas consultas al mes manejan aproximadamente en su empresa?'
      : 'La inversión es una tarifa plana de $450 a $800 USD al mes según el volumen de chats, mes a mes y listo en 48h (sin permanencia forzosa). Se autofinancia con 2-3 ventas o citas recuperadas al mes. ¿Cuántas consultas al mes manejan aproximadamente por WhatsApp?';

    return `Eres el asistente virtual de Kenneth Herrera en The Quant Partners.
Hablas con directores y gerentes de empresas en ${isUSA ? 'USA (Comunidad Latina)' : 'Perú y Latinoamérica'} por WhatsApp en representación del equipo de Kenneth.

REGLA DE ORO DE CONCISIÓN Y CERO TESTAMENTOS (INNEGOCIABLE):
- EN WHATSAPP LOS MENSAJES LARGOS ESPANTAN. MÁXIMO 2 A 3 LÍNEAS O MENOS DE 45 PALABRAS POR MENSAJE.
- Sé ultra-breve, claro, empático y directo al grano. Cero cartas formales, cero discursos en bloque, cero listas interminables.

IDENTIDAD Y RESPETO PROFESIONAL:
1. IDENTIDAD OBLIGATORIA: Eres el asistente virtual de Kenneth Herrera en The Quant Partners. NUNCA te hagas pasar por Kenneth en primera persona ("¡Hola! Te escribe el asistente virtual de Kenneth 🙌").
2. RESPETO PROFESIONAL: Cero modismos callejeros ("hermano", "bro", "pata", "mi rey"). Trato respetuoso, cálido y ejecutivo.
3. CERO PLACEHOLDERS: Jamás emitir corchetes como [Tu Nombre], [Nombre], [Empresa].
4. CORREO OFICIAL: partners@thequantpartners.com (PROHIBIDO mencionar kenneth@thequantpartners.com).

REGLA DE CONVERSIÓN Y MEET (CUÁNDO SÍ Y CUÁNDO NO):
- ANTES NO: Si el cliente solo pregunta "de qué trata", pide información, precios o resuelve dudas: responde su duda en 2 líneas cortas y haz una pregunta de sondeo sobre su negocio. ESTRICTAMENTE PROHIBIDO OFRECER MEET O LLAMADA EN ESTA ETAPA.
- AHÍ RECIÉN: ÚNICAMENTE cuando el prospecto, ya informado, diga explícitamente "sí me interesa", "cómo hago para empezar", "quiero contratar", "dónde pago", "me interesa implementarlo" o pida agendar para arrancar:
  Responde:
  "¡Excelente! 🙌 Para definir los accesos técnicos, afinar el método de pago y dejar tu infraestructura operando esta misma semana, coordinemos una breve sesión de 10 min por Meet con Kenneth. ¿Qué día y hora te viene mejor?"
  y agrega al final: [ACTION:TRANSFER_KENNETH:necesidad|urgencia|presupuesto]

RESPUESTAS ULTRA-CORTAS Y AL GRANO:

1. SI PREGUNTAN DE QUÉ TRATA / CÓMO FUNCIONA / PIDEN INFORMACIÓN O FICHA:
"Implementamos 4 agentes de IA en paralelo que atienden tus chats en 5 segundos (24/7), filtran a los curiosos sin presupuesto y le entregan citas listas a tus vendedores para no perder ventas por demoras ni vistos 🙌.
¿Cuántas consultas o prospectos al mes manejan aproximadamente por WhatsApp?"

2. SI PREGUNTAN PRECIO O INVERSIÓN:
"${priceResponseStr}"

3. SI PREGUNTAN POR ANUNCIOS / PAUTA / META ADS:
"Si ya invierten en anuncios conectamos el sistema nativamente a Meta Ads (CAPI) para abaratar el costo por lead, pero además les inyectamos prospección activa continua para tener clientes garantizados sin depender del algoritmo 🙌. ¿Actualmente invierten en pauta digital?"

4. SI DICEN "YA TENEMOS RECEPCIONISTA / SECRETARIA / ASESOR":
"¡Buenísimo! El sistema no los reemplaza, los potencia. Filtra a los preguntones y atiende de noche y feriados para que tus asesores solo reciban clientes listos para pagar. ¿Te gustaría ver cómo se integraría con tu equipo actual?"

5. SI PREGUNTAN SI ES RESPUESTA PREDETERMINADA O RESUELVE DUDAS:
"No usa respuestas predeterminadas fijas; conversa con el cliente como un humano, responde dudas de tus servicios y guía al prospecto para agendar cita directamente en tu calendario 🙌. ¿Qué consultas les hacen más seguido?"

6. SI DICEN QUE NO LES INTERESA O ES NÚMERO PRIVADO:
"Entendido perfectamente y muchas gracias por su tiempo. ¡Muchos éxitos en su empresa! 🙌" -> [ACTION:OPT_OUT:no_interesado]

LÍNEAS ROJAS INMUTABLES:
- Cero testamentos: Si tu mensaje tiene más de 50 palabras, córtalo y hazlo más conciso.
- ESTRICTAMENTE PROHIBIDO mencionar coste de transferencia por cita agendada ($25 USD) en WhatsApp (as bajo la manga exclusivo de Kenneth en el Meet).
- NUNCA ofrecer el Meet antes de que el prospecto confirme que le interesa empezar.`;
  }

  /**
   * Procesa el mensaje entrante del prospecto a través del LLM en modo Setter
   */
  public static async processMessage(
    lead: Lead,
    incomingText: string,
    service?: ServiceDefinition | null
  ): Promise<SetterResponse> {
    const cleanPhone = lead.phone.replace(/[^0-9]/g, '');
    const settings = await OutreachRepo.getSettings();
    const apiKey = settings.aiApiKey || process.env.OPENROUTER_API_KEY || '';
    const model = settings.aiModel || process.env.OPENROUTER_MODEL || this.DEFAULT_MODEL;

    // Obtener historial reciente de chat
    const chatHistory = await OutreachRepo.getChatHistory(cleanPhone, 8);
    const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [];

    // 1. Determinar System Prompt (Propio de Kenneth o del Servicio del Cliente)
    const isMasterKenneth = !process.env.MODE || process.env.MODE !== 'client';
    const isGeneralInbound = !lead.serviceId || lead.serviceId === 'inbound-general';

    let systemPrompt = '';
    if (isMasterKenneth && isGeneralInbound) {
      systemPrompt = this.getKennethSetterPrompt(lead);
    } else if (service?.aiSystemPrompt) {
      systemPrompt = 
        `Eres el Asesor Comercial y Setter de Adquisición para ${service.name}.
${service.aiSystemPrompt}

REGLAS CONVERSACIONALES ESTRICTAS (CERO TESTAMENTOS - ULTRA CONCISO):
1. Tono 100% natural, empático, espontáneo y profesional en WhatsApp (cero frialdad robótica ni respuestas de contestadora).
2. Usa siempre de 1 a 2 emojis naturales por mensaje para dar calidez y dinamismo (ej: 🙌, 🤝, ✨, 💡, 🚀, 👌, 😄).
3. CERO TESTAMENTOS O MONÓLOGOS: En WhatsApp los mensajes largos espantan y se ignoran. Responde SIEMPRE en MÁXIMO 2 A 3 LÍNEAS o menos de 45 palabras.
4. ESTRICTAMENTE PROHIBIDO usar menús numéricos o listas interminables.
5. REGLA DE CONVERSIÓN Y MEET (CUÁNDO SÍ Y CUÁNDO NO):
   - ANTES NO: Si el cliente solo pide información, de qué trata, precios o detalles, responde su duda en 2 líneas cortas y haz una pregunta de sondeo sobre su empresa. ESTRICTAMENTE PROHIBIDO ofrecer el Meet o proponer llamada en esta etapa.
   - AHÍ RECIÉN: ÚNICAMENTE cuando el prospecto, ya informado, diga explícitamente "sí me interesa", "cómo hago para empezar", "quiero contratar", "dónde pago" o pida agendar para arrancar:
     "¡Excelente! 🙌 Para definir los accesos técnicos, afinar el método de pago y dejar tu infraestructura operando esta misma semana, coordinemos una breve sesión de 10 min por Meet con Kenneth. ¿Qué día y hora te viene mejor?" -> [ACTION:TRANSFER_KENNETH:necesidad|urgencia|presupuesto]
6. PROHIBICIÓN TOTAL DE PLACEHOLDERS: Jamás uses corchetes como [Tu Nombre], [Nombre], [Empresa]. Saluda y responde con naturalidad.
7. REGLA ANTI-INSISTENCIA ABSOLUTA: Si el prospecto indica que no le interesa o que es canal privado, despídete amablemente en 1 frase corta y agrega: [ACTION:OPT_OUT:motivo_del_rechazo]`;
    } else {
      systemPrompt = this.getKennethSetterPrompt();
    }

    messages.push({ role: 'system', content: systemPrompt });

    // 2. Cargar historial formateado
    for (const msg of chatHistory) {
      if (msg.role === 'user' || msg.role === 'assistant') {
        messages.push({ role: msg.role, content: msg.content });
      }
    }

    // Asegurar que incomingText esté al final sin duplicarse si ya fue persistido previamente
    const lastMsg = messages[messages.length - 1];
    if (!lastMsg || lastMsg.role !== 'user' || lastMsg.content !== incomingText) {
      messages.push({ role: 'user', content: incomingText });
    }

    // 3. Consultar OpenRouter
    try {
      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://thequantpartners.com',
          'X-Title': 'QP Outreach Engine - AI Setter'
        },
        body: JSON.stringify({
          model,
          messages,
          temperature: 0.3,
          max_tokens: 800
        })
      });

      if (!response.ok) {
        throw new Error(`OpenRouter Error ${response.status}`);
      }

      const json = await response.json() as any;
      const rawReply = json?.choices?.[0]?.message?.content || '';

      // 4. Analizar si la IA activó el trigger de transferencia o agendamiento
      const transferMatch = rawReply.match(/\[ACTION:(TRANSFER_KENNETH|QUALIFIED|SCHEDULED):(.*?)\]/);
      let isQualified = false;
      let isTransferred = false;
      let cleanReply = rawReply;
      let details: LeadQualificationDetails | undefined;

      if (transferMatch) {
        const actionType = transferMatch[1];
        cleanReply = rawReply.replace(transferMatch[0], '').trim();
        const parts = (transferMatch[2] || '').split('|');

        if (actionType === 'SCHEDULED') {
          const { GhostCRM } = await import('../crm/ghost_crm.js');
          await GhostCRM.transitionStatus(cleanPhone, 'MEETING_SCHEDULED', {
            handoffNotes: `Cita coordinada con prospecto: "${incomingText}"`
          });
        } else {
          isQualified = true;
          details = {
            need: parts[0]?.trim() || 'Automatización y triaje en WhatsApp',
            urgency: parts[1]?.trim() || 'Inmediata / Esta semana',
            budget: parts[2]?.trim() || 'Calificado',
            lastMessage: incomingText
          };

          // Ejecutar traspaso y transición a QUALIFIED
          await SalesDispatcher.dispatchQualifiedLead(cleanPhone, details, service?.name);
          isTransferred = true;
        }
      }

      // 4.1. Analizar si la IA activó Opt-Out / Rechazo por falta de interés o canal no comercial
      const optOutMatch = rawReply.match(/\[ACTION:OPT_OUT:(.*?)\]/);
      if (optOutMatch) {
        const reason = optOutMatch[1]?.trim() || 'Rechazo respetuoso indicado por prospecto';
        cleanReply = rawReply.replace(optOutMatch[0], '').trim();

        await OutreachRepo.updateLeadStatus(cleanPhone, 'CLOSED_LOST', {
          humanTakeoverAt: new Date().toISOString(),
          handoffNotes: `Rechazo respetuoso detectado por Setter IA: "${reason}"`
        });
        await OutreachRepo.updateLeadCustomFields(cleanPhone, {
          rejectionAcknowledged: true,
          rejectionReason: reason
        });
        await OutreachRepo.addChatMessage(cleanPhone, 'system', `🔒 Prospecto declinó la propuesta (${reason}). Se desactivó el bot y se blindó el contacto.`);

        try {
          const { WhatsAppLabelManager } = await import('../whatsapp/label_manager.js');
          const { BaileysEngine } = await import('../whatsapp/baileys_engine.js');
          const sock = (BaileysEngine as any).getInstance?.()?.getSocket?.() || null;
          await WhatsAppLabelManager.syncLeadLabel(sock, cleanPhone, 'CLOSED_LOST', lead.status);
        } catch {}

        return {
          replyText: cleanReply,
          isQualified: false,
          isTransferred: false
        };
      }

      // Sanitizar cualquier placeholder accidental [Tu Nombre], [Nombre], corchetes residuales
      cleanReply = cleanReply
        .replace(/\[(?:Tu\s+Nombre|Tu\s+Nombre\s+Aqu[ií]|Nombre\s+del\s+Asistente|Asistente)\]/gi, isMasterKenneth ? 'Kenneth' : '')
        .replace(/\[(?:Nombre|Empresa|Cliente)\]/gi, (lead.companyName || '').trim())
        .replace(/\[(?!(?:ACTION:))[A-Za-z0-9_\s\-|áéíóúÁÉÍÓÚñÑ]+\]/g, '')
        .replace(/\s{2,}/g, ' ')
        .trim();

      return {
        replyText: cleanReply,
        isQualified,
        isTransferred,
        qualificationDetails: details
      };
    } catch (err: any) {
      console.error('[SetterEngine] Error procesando con OpenRouter:', err.message);
      return {
        replyText: 'Buenas tardes. Recibimos tu mensaje con gusto. Un asesor comercial especializado revisará tu requerimiento a la brevedad para brindarte los detalles.',
        isQualified: false,
        isTransferred: false
      };
    }
  }
}
