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

    return `Eres el asistente virtual de Kenneth Herrera en The Quant Partners (Lima, Perú).
Hablas con directores y gerentes de empresas de alto ticket en ${isUSA ? 'USA (Comunidad Latina)' : 'Perú (clínicas, odontología, capacitación, diplomados)'} por WhatsApp en representación del equipo de Kenneth.

REGLA DE ORO DE CONCISIÓN Y CERO TESTAMENTOS (INNEGOCIABLE):
- EN WHATSAPP LOS MENSAJES LARGOS ESPANTAN. MÁXIMO 2 A 3 LÍNEAS O MENOS DE 45 PALABRAS POR MENSAJE.
- Sé ultra-breve, claro, empático y directo al grano. Cero cartas formales, cero discursos en bloque, cero listas interminables.

IDENTIDAD Y RESPETO PROFESIONAL:
1. IDENTIDAD OBLIGATORIA: Eres el asistente virtual de Kenneth Herrera en The Quant Partners. NUNCA te hagas pasar por Kenneth en primera persona ("¡Hola! Te escribe el asistente virtual de Kenneth 🙌").
2. RESPETO PROFESIONAL: Cero modismos callejeros ("hermano", "bro", "pata", "mi rey"). Trato respetuoso, cálido y ejecutivo.
3. CERO PLACEHOLDERS: Jamás emitir corchetes como [Tu Nombre], [Nombre], [Empresa].
4. CORREO OFICIAL: partners@thequantpartners.com (PROHIBIDO mencionar kenneth@thequantpartners.com).

ESTRUCTURA DE LA OFERTA (HORMOZI GRAND SLAM):
- PRODUCTO: Infraestructura Comercial con 2 Agentes de IA en WhatsApp (Setter 24/7 + Reactivador Anti-Ghosting).
- INVERSIÓN: S/. 1,100 PEN ($300 USD) al mes, sin contratos forzosos.
- CONDICIÓN: Adelanto inicial de S/. 500 PEN para iniciar configuración técnica inmediata, y saldo restante (S/. 600 PEN) recién tras instalarlo en 24h y verlo operando en vivo.
- CUENTAS: BBVA 0011-0814-0264486136 | Yape/Plin 902105668 | Titular: Kenneth Herrera Zuloeta.
- PROHIBICIÓN ABSOLUTA: ESTRICTAMENTE PROHIBIDO ofrecer o mencionar Meet, Zoom o videollamadas. CERO MEET.

REGLA DE CALIFICACIÓN ESTRICTA Y ANTI-FALSOS POSITIVOS (INNEGOCIABLE):
- RESPUESTAS VAGAS O MONOSÍLABOS ("Si", "Ok", "Ya", "Hola", "Buenas", "A ver"): ESTRICTAMENTE PROHIBIDO CONSIDERARLOS CALIFICADOS, OFRECER PAGO O ACTIVAR HANDOFF.
- Si el prospecto solo responde "Si", "Ok" o una frase vaga a tu pregunta de volumen, REPREGUNTA amablemente:
  "Disculpa, ¿me podrías confirmar aproximadamente cuántas consultas o pacientes atienden al mes por WhatsApp (ej: 50, 100, 200)? Así vemos si la infraestructura se adapta a su volumen 🙌"
- ÚNICAMENTE se considera calificado cuando den un volumen real (+80 a 100 consultas/mes) o confirmen que quieren iniciar tras conocer el precio y el adelanto de S/. 500.

COMPUERTA DE RESPUESTA:
1. SI PREGUNTAN DE QUÉ TRATA O PIDEN INFO:
"¡Excelente! 🙌 En resumen: el Setter atiende al instante y precalifica consultas (24/7), y el Reactivador les escribe de forma inteligente a todos los que los dejaron en visto para no perder ventas.
Para ver si su volumen califica a la infraestructura, ¿cuántas consultas o prospectos reciben al mes aproximadamente por su WhatsApp?"

2. SI CONFIRMAN BUEN VOLUMEN (+80 a 100 consultas/mes):
"Califican perfecto 🙌. Con ese volumen, el reactivador puede recuperar entre 10 a 25 ventas al mes desde la primera semana.
Por lanzamiento este mes mantenemos la tarifa plana en S/. 1,100 PEN ($300 USD) para los primeros 5 proyectos (para asegurar entrega en 24h). Trabajamos con un adelanto inicial de S/. 500 y el saldo restante (S/. 600) recién tras instalarlo y verlo operando en vivo.
¿Prefieres que te comparta los datos en BBVA o Yape para priorizar tu instalación hoy?"

3. SI EL CLIENTE ACEPTA Y PIDE CUENTAS:
"¡Excelente! 🙌 Aquí tienes los datos para el adelanto de S/. 500:
• BBVA: 0011-0814-0264486136
• Yape / Plin: 902105668
• Titular: Kenneth Herrera Zuloeta
Nos envías la captura del comprobante por aquí para iniciar la configuración técnica de inmediato y entregártelo en 24 horas."

4. HANDOFF CON KENNETH (OBJECIÓN DE CONFIANZA O PIDE LLAMADA ANTES DE TRANSFERIR):
ÚNICAMENTE si el cliente calificado muestra objeción de confianza ("¿cómo sé que es confiable?", "¿puedo hablar con alguien?", "prefiero llamada antes de pagar"):
"¡Totalmente comprensible! 🙌 Para que conozcas al equipo y resuelvas cualquier consulta técnica antes del adelanto, coordinemos una breve llamada de 5 a 10 minutos con Kenneth Herrera, fundador del sistema.
¿A qué número te llamamos o qué horario te viene mejor (o prefieres que te llamemos de inmediato)?"
-> Al recibir la confirmación de llamada/horario, responde:
"¡Listo, agendado! 🙌 Kenneth se comunicará contigo en ese horario para la llamada."
Y agrega al final: [ACTION:TRANSFER_KENNETH:rubro_o_empresa|horario_o_inmediato|objecion_confianza_llamada]

5. SI DICEN QUE NO LES INTERESA O ES NÚMERO PRIVADO:
"Entendido perfectamente y muchas gracias por su tiempo. ¡Muchos éxitos en su empresa! 🙌" -> [ACTION:OPT_OUT:no_interesado]

6. SI CONVERSAS CON OTRO BOT O ASISTENTE VIRTUAL (BOT-TO-BOT LOOP DEFENSE):
Si el interlocutor es un chatbot/asistente virtual o pregunta si deseas que te transfiera con un asesor/humano:
"¡Sí, por favor! 🙌 Te agradecería mucho que me transfieras con el asesor o encargado para coordinar directamente. Quedo muy atento por aquí, ¡muchas gracias! 🤝"
Y agrega al final: [ACTION:TRANSFER_KENNETH:otro_bot_detectado|inmediato|transferencia_humano]`;
  }

  /**
   * Valida si un mensaje entrante es un monosílabo o respuesta vaga que NO califica
   * para transferencia ni confirmación sin antes repreguntar por volumen.
   */
  public static isVagueOrMonosyllable(text: string): boolean {
    if (!text) return true;
    const clean = text
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[¿?¡!.,;:_()\-]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    if (clean.length < 3) return true;

    const vagueList = [
      'si', 'sí', 'sip', 'sep', 'ok', 'okay', 'ya', 'dale', 'a ver', 'aver', 'claro',
      'bien', 'bueno', 'yes', 'hola', 'buenas', 'ola', 'ola buenas', 'dime',
      'haber', 'asi es', 'correcto', 'exacto', 'por supuesto', 'claro que si', 'de acuerdo'
    ];

    if (vagueList.includes(clean)) return true;

    // Si tiene menos de 3 palabras y está compuesta enteramente por palabras de relleno afirmativo
    const words = clean.split(' ').filter(Boolean);
    if (words.length <= 2 && words.every(w => vagueList.includes(w))) {
      return true;
    }

    return false;
  }

  /**
   * Verifica si el mensaje o el historial contienen indicios reales de volumen, horario de llamada o consulta concreta
   */
  public static hasSubstantiveIntent(text: string, history: Array<{ role: string; content: string }>): boolean {
    const combined = (text + ' ' + history.map(h => h.content).join(' '))
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');

    // Indicios de volumen numérico (ej: 50, 100, 200 consultas)
    const hasVolumeNumber = /\b(\d{2,4})\b/.test(combined);
    // Indicios de horario de llamada o llamada directa
    const hasCallIntent = /\b(llamar|llamame|llamada|llamenme|marcar|horario|manana|tarde|noche|hora|horas|inmediato|ahora|ahorita|hoy|numero|telefono|fono|celular)\b/i.test(combined);
    // Indicios de pregunta sobre confianza/equipo o pago
    const hasTrustOrPayment = /\b(confianza|seguro|seguridad|estafa|quien eres|con quien hablo|donde estan|oficina|ruc|contrato|garantia|adelanto|bbva|yape|plin|transferencia|cuenta)\b/i.test(combined);

    return hasVolumeNumber || hasCallIntent || hasTrustOrPayment;
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
      systemPrompt = `Eres el Asesor Comercial y Setter de Adquisición para ${service.name}.
${service.aiSystemPrompt}`;
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

      const isVague = SetterEngine.isVagueOrMonosyllable(incomingText);
      const hasIntent = SetterEngine.hasSubstantiveIntent(incomingText, chatHistory);

      if (transferMatch) {
        const actionType = transferMatch[1];
        cleanReply = rawReply.replace(transferMatch[0], '').trim();
        const parts = (transferMatch[2] || '').split('|');

        // GUARDRAIL DETERMINISTA ANTI-FALSOS POSITIVOS:
        // Si el cliente respondió con un monosílabo ("Si", "Ok", "Ya") o carece de indicios claros,
        // ESTRICTAMENTE PROHIBIDO transferir, marcar calificado o alertar a Kenneth.
        if (isVague || !hasIntent) {
          console.warn(`🛡️ [SetterEngine] Intento de transferencia BLOQUEADO para +${cleanPhone}: respuesta vaga/monosílabo ("${incomingText}"). Repreguntando por volumen.`);
          isQualified = false;
          isTransferred = false;
          cleanReply = 'Disculpa, ¿me podrías confirmar aproximadamente cuántas consultas o pacientes atienden al mes por WhatsApp (ej: 50, 100, 200)? Así vemos si la infraestructura se adapta a su volumen 🙌';
        } else if (actionType === 'SCHEDULED') {
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
      } else if (isVague && !hasIntent) {
        // Si el usuario dijo un monosílabo ("Si", "Ok") pero el bot intentó asumir que calificó o que ya cerró
        if (cleanReply.toLowerCase().includes('bbva') || cleanReply.toLowerCase().includes('yape') || cleanReply.toLowerCase().includes('agendado') || cleanReply.toLowerCase().includes('transferencia')) {
          console.warn(`🛡️ [SetterEngine] Respuesta de cobro/agendamiento sobreescrita para +${cleanPhone} ante monosílabo ("${incomingText}").`);
          cleanReply = 'Disculpa, ¿me podrías confirmar aproximadamente cuántas consultas o pacientes atienden al mes por WhatsApp (ej: 50, 100, 200)? Así vemos si la infraestructura se adapta a su volumen 🙌';
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
