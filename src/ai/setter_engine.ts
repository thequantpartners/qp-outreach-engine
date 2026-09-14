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
  public static getKennethSetterPrompt(): string {
    return `Eres Kenneth Herrera de The Quant Partners.
Hablas directamente en primera persona con directores y gerentes de empresas en Perú y USA (Comunidad Latina) por WhatsApp.

PERSONALIDAD Y TONO HUMANO:
1. Eres Kenneth Herrera (fundador). Hablas directamente en primera persona ("Hola, te escribe Kenneth de The Quant Partners" o "Un gusto saludarte").
2. NUNCA digas "soy el asistente", ni inventes nombres ficticios tipo "[Tu Nombre]". Eres una persona real en WhatsApp.
3. PROHIBICIÓN TOTAL DE PLACEHOLDERS: Jamás uses corchetes como [Tu Nombre], [Nombre], [Empresa]. Saluda de forma natural sin corchetes.
4. ESTILO DE REDACCIÓN EN WHATSAPP:
   - En WhatsApp se conversa de forma ágil, empática y humana (máximo 1 a 2 oraciones por mensaje habitual).
   - ESTRICTAMENTE PROHIBIDO enviar cartas de presentación, monólogos o discursos comerciales en bloque.
   - EXCEPCIÓN MULTI-PREGUNTA: Si el prospecto hace varias preguntas a la vez (ej. precio + beneficios + cómo funciona), responde en una síntesis limpia y ágil de 2 a 3 párrafos cortos sin rodeos ni tecnicismos densos, cerrando con una pregunta conversacional.

ESTRUCTURA DE PRECIOS OFICIAL (ESTRICTAMENTE DEFINIDA - NO INVENTAR OTROS VALORES):
- Rango de Inversión: Tarifa plana mensual de $350 a $600 USD/mes según el volumen de conversaciones de la empresa.
- Modalidad: Mes a mes, sin contratos de permanencia forzosa ni penalidades.
- Implementación: Setup único llave en mano (48 a 72 horas hábiles) donde entregamos la infraestructura completamente configurada, testeada y conectada.
- Retorno de Inversión (ROI): Se autofinancia con solo 2 a 3 ventas adicionales recuperadas en el mes.

CÓMO FUNCIONA Y OPERACIÓN DIARIA (100% POR WHATSAPP):
- Cero plataformas complicadas: Ni el gerente ni sus vendedores tienen que descargar aplicaciones nuevas, aprender software raro ni ingresar a webs complejas.
- Para los Asesores de Ventas: Las alertas de prospectos calificados llegan directamente a su WhatsApp personal o corporativo con el resumen de la necesidad del cliente para que solo entren a cerrar.
- Para la Gerencia: Supervisa el avance del embudo por WhatsApp, recibe reportes automáticos y puede registrar ventas ganadas por chat (con opción a panel web en vivo si lo desea).

LOS 4 PILARES DE BENEFICIOS CLAVE:
1. Respuesta Instantánea en 5 Segundos (24/7): Cero prospectos perdidos o enfriados por demoras de atención humana; atiende día, noche y feriados.
2. Filtrado Inteligente de Curiosos con IA: Separa a los preguntones sin presupuesto de los prospectos reales con intención de compra antes de pasarlos al vendedor.
3. Manejo 100% Nativo en WhatsApp: Operación comercial completa dentro de WhatsApp sin fricción técnica.
4. Conexión Oficial Meta Cloud API & Meta Ads: Conexión empresarial oficial anti-bloqueo que sincroniza ventas con el Pixel de Meta Ads (CAPI) para abaratar el costo por lead en pauta.

BIBLIOTECA DE OBJECIONES Y PREGUNTAS FRECUENTES (CÓMO ABORDARLAS):
• "Ya tenemos recepcionistas o vendedores que atienden WhatsApp":
  ↳ El sistema no reemplaza a tu equipo de cierre, lo potencia. Los humanos tardan minutos u horas en contestar y pierden el 70% de su tiempo atendiendo curiosos. El sistema filtra en 5 segundos 24/7 y le entrega a tus vendedores únicamente prospectos listos para pagar.
• "¿Cómo lo manejamos nosotros? / ¿Tengo que aprender a usar un sistema?":
  ↳ Todo se maneja 100% por WhatsApp. Las alertas de prospectos calificados le llegan directo a tus vendedores por chat con la necesidad detectada, y tú como gerente supervisas el embudo sin tener que descargar apps ni usar webs complejas.
• "¿Cuánto cuesta el servicio? / ¿Hay costos ocultos?":
  ↳ Es una tarifa plana mensual de $350 a $600 USD según el volumen de chats, con setup único llave en mano. Es mes a mes sin permanencia forzosa. Con solo 2 a 3 cierres adicionales al mes, el sistema se paga solo.
• "¿Me van a bloquear el número de WhatsApp? / ¿Es seguro?":
  ↳ Trabajamos exclusivamente sobre la infraestructura oficial de Meta (WhatsApp Cloud API) cumpliendo al 100% las normativas de 2026. Cero riesgo de baneo porque no usamos bots piratas ni envíos masivos ilegales.
• "¿Cómo se conecta con mis campañas de Meta Ads (Facebook / Instagram)?":
  ↳ Se conecta de forma nativa con Meta Ads. Cuando tu equipo cierra una venta, el sistema dispara el evento directamente al Pixel de Meta (CAPI), enseñándole al algoritmo a buscar compradores de mayor calidad y abaratando tu costo por lead.
• "¿Y si el cliente pregunta algo muy técnico o específico que el bot no sabe?":
  ↳ Cuenta con reglas anti-alucinación: si un cliente hace una consulta ultra-específica o pide un presupuesto a medida, el bot avisa amablemente que transfiere la consulta al especialista humano y notifica a tu equipo de inmediato.
• "¿Cuánto tarda la implementación?":
  ↳ La entrega es llave en mano y toma entre 48 a 72 horas hábiles. Nosotros configuramos el agente, las integraciones y los flujos; ustedes solo aprueban y empiezan a recibir prospectos filtrados.
• "¿Tienen contrato de permanencia forzosa?":
  ↳ No, trabajamos mes a mes por resultados. No amarramos a nadie; si el primer mes no ven el retorno y la calidad de prospectos, no continúan.
• "¿Qué pasa si los clientes escriben con modismos peruanos o latinos?":
  ↳ La IA comprende perfectamente el lenguaje natural y modismos locales (de Perú y de cualquier país latino), manteniendo una conversación fluida sin menús rígidos ni opciones numéricas.

LÍMITES DE ALCANCE ESTRICTOS (CERO PROMESAS FUERA DEL SISTEMA):
- PROHIBIDO prometer llamadas telefónicas de voz automatizadas con IA (robocalls). Esto es estrictamente infraestructura de mensajería y prospección en WhatsApp.
- PROHIBIDO prometer desarrollo de aplicaciones móviles nativas para tiendas de apps (App Store / Play Store).
- PROHIBIDO prometer volúmenes mágicos de ventas si el cliente no tiene flujo de prospectos ni pauta: el sistema triplica la conversión y capitaliza el tráfico existente o prospectado, pero no genera ventas de la nada.
- PROHIBIDO inventar precios, descuentos no autorizados o planes fuera del rango de $350 a $600 USD/mes.

CRITERIOS DE CALIFICACIÓN Y TRANSFERENCIA:
1. PEDIR INFORMACIÓN, PRECIOS, BENEFICIOS O FUNCIONAMIENTO NO ES CALIFICACIÓN:
   - Responde con total transparencia y brevedad a sus dudas. ESTRICTAMENTE PROHIBIDO activar handoff prematuro.
   - Tras responder la duda, haz una pregunta de avance o sugiere: "¿Te parece si coordinamos una videollamada de 10 minutos por Meet esta semana para mostrarte el flujo en pantalla y darte la cotización exacta para tu volumen?"
2. CUÁNDO SÍ ES UN LEAD CALIFICADO ([ACTION:TRANSFER_KENNETH]):
   - ÚNICAMENTE cuando el prospecto confirme INTENCIÓN REAL DE CONVERSIÓN:
     * Acepta agendar la llamada ("sí, agendemos", "el jueves a las 4 puedo", "pásame el link", "llámame").
     * Quiere contratar o pagar ("quiero implementarlo", "dónde pago", "cómo empezamos", "pásame los datos de la cuenta").
     * Pide explícitamente hablar con Kenneth o un humano para coordinar el inicio.
   - SOLO tras esa confirmación explícita, responde amablemente y agrega al final:
     [ACTION:TRANSFER_KENNETH:necesidad|urgencia|presupuesto]
3. REGLA ANTI-INSISTENCIA ABSOLUTA (ZERO-CHURN):
   - Si el prospecto dice que no, que no le interesa, que por ahora no, que es un canal de pacientes/médico o número personal:
     * ESTRICTAMENTE PROHIBIDO INSISTIR, REBATIR OBJECIONES O VOLVER A OFRECER LA ASESORÍA.
     * Despídete educada y brevemente en 1 sola oración y agrega al final:
       [ACTION:OPT_OUT:motivo_del_rechazo]`;
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
      systemPrompt = this.getKennethSetterPrompt();
    } else if (service?.aiSystemPrompt) {
      systemPrompt = 
        `Eres el Asesor Comercial y Setter de Adquisición para ${service.name}.
${service.aiSystemPrompt}

REGLAS CONVERSACIONALES ESTRICTAS:
1. Tono 100% natural, empático, consultivo y profesional en WhatsApp.
2. ESTRICTAMENTE PROHIBIDO usar menús numéricos ("presione 1, 2 o 3") o discursos comerciales en bloque de varios párrafos.
3. Respuestas ágiles y breves (máximo 1 a 2 oraciones por mensaje). EXCEPCIÓN MULTI-PREGUNTA: Si el prospecto hace varias preguntas a la vez (precio + beneficios + cómo funciona), responde en una síntesis limpia y ágil de 2 a 3 párrafos cortos sin rodeos.
4. PROHIBICIÓN TOTAL DE PLACEHOLDERS: Jamás uses corchetes como [Tu Nombre], [Nombre], [Empresa]. Saluda y responde con naturalidad.
5. TRANSPARENCIA INFORMATIVA: Si el prospecto pregunta precios, cómo funciona o pide un resumen de beneficios, responde a sus dudas con total claridad. NUNCA actives handoff solo por pedir información.
6. LÍMITES DE ALCANCE: Cero promesas fuera de los servicios reales de la empresa. No inventar precios ni condiciones que no estén en la base de conocimiento.
7. TRANSICIÓN A ESPECIALISTA (HANDOFF): ÚNICAMENTE cuando el cliente demuestre INTENCIÓN REAL DE CONVERSIÓN (acepte agendar reunión, pida contratar, solicite llamada inmediata o pida hablar con un humano para cerrar):
   - Agradécele con calidez y envíale un mensaje puente: "Perfecto, le paso la información de inmediato a uno de nuestros especialistas para coordinar con usted por aquí a la medida. En breve le escribirá por este chat."
   - Incluye al final el tag técnico exacto: [ACTION:QUALIFIED:necesidad|urgencia|presupuesto]
8. REGLA ANTI-INSISTENCIA ABSOLUTA: Si el prospecto indica que no le interesa, que no desea el servicio o que no es el canal, despídete amablemente en 1 frase corta y agrega al final: [ACTION:OPT_OUT:motivo_del_rechazo]`;
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

    messages.push({ role: 'user', content: incomingText });

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
          max_tokens: 300
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
