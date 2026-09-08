import dotenv from 'dotenv';
import { Lead, ServiceDefinition, ChatMessage } from '../types/index.js';
import { OutreachRepo } from '../db/repo.js';
import { RoundRobinManager } from '../pipeline/round_robin.js';

dotenv.config();

export interface CloserResult {
  shouldRespond: boolean;
  replyText?: string;
  intent?: 'CONVERSATION' | 'CLOSING_DELIVERED' | 'READY_TO_BUY' | 'REQUEST_HUMAN' | 'NOT_INTERESTED' | 'HUMAN_TAKEOVER';
  adminAlertText?: string;
  reason?: string;
}

export interface CopilotSuggestion {
  label: string;
  badgeColor: 'amber' | 'sky' | 'emerald' | 'purple';
  text: string;
  explanation: string;
}

export class OpenRouterCloser {
  public static async getAiConfig(): Promise<{ provider: 'openrouter' | 'gemini' | 'openai'; apiKey: string; model: string }> {
    try {
      const settings = await OutreachRepo.getSettings();
      const provider = (settings.aiProvider as any) || 'openrouter';
      const apiKey = settings.aiApiKey || process.env.OPENROUTER_API_KEY || process.env.GEMINI_API_KEY || process.env.OPENAI_API_KEY || '';
      
      let defaultModel = 'google/gemini-2.5-flash';
      if (provider === 'gemini') defaultModel = 'gemini-2.0-flash';
      if (provider === 'openai') defaultModel = 'gpt-4o-mini';

      const model = settings.aiModel || defaultModel;
      return { provider, apiKey, model };
    } catch {
      return {
        provider: 'openrouter',
        apiKey: process.env.OPENROUTER_API_KEY || '',
        model: 'google/gemini-2.5-flash'
      };
    }
  }

  public static getEndpoint(provider: string): string {
    if (provider === 'gemini') {
      return 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions';
    }
    if (provider === 'openai') {
      return 'https://api.openai.com/v1/chat/completions';
    }
    return 'https://openrouter.ai/api/v1/chat/completions';
  }

  public static async testConnection(
    provider: 'openrouter' | 'gemini' | 'openai',
    apiKey: string,
    model?: string
  ): Promise<{ success: boolean; latencyMs?: number; error?: string; modelUsed?: string }> {
    const startTime = Date.now();
    const url = OpenRouterCloser.getEndpoint(provider);
    
    let chosenModel = model;
    if (!chosenModel) {
      if (provider === 'gemini') chosenModel = 'gemini-2.0-flash';
      else if (provider === 'openai') chosenModel = 'gpt-4o-mini';
      else chosenModel = 'google/gemini-2.5-flash';
    }

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
          ...(provider === 'openrouter' ? {
            'HTTP-Referer': 'https://qp-outreach-engine.vercel.app',
            'X-Title': 'QP Outreach Engine'
          } : {})
        },
        body: JSON.stringify({
          model: chosenModel,
          messages: [{ role: 'user', content: 'Ping. Responde brevemente con OK.' }],
          max_tokens: 10
        })
      });

      const data: any = await res.json();
      const latencyMs = Date.now() - startTime;

      if (res.ok && (data.choices?.[0]?.message?.content || data.candidates?.[0])) {
        return { success: true, latencyMs, modelUsed: chosenModel };
      } else {
        const errorMsg = data.error?.message || data.error || `HTTP ${res.status}: Respuesta inesperada del proveedor`;
        return { success: false, error: typeof errorMsg === 'string' ? errorMsg : JSON.stringify(errorMsg) };
      }
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  private static getApiKey(): string | undefined {
    return process.env.OPENROUTER_API_KEY;
  }

  private static getModel(): string {
    return process.env.OPENROUTER_MODEL || 'google/gemini-2.5-flash';
  }

  /**
   * Procesa un mensaje entrante de un prospecto y genera la respuesta comercial óptima
   */
  public static async processInbound(
    lead: Lead,
    incomingText: string,
    service: ServiceDefinition
  ): Promise<CloserResult> {
    // 1. Validar regla de Human Takeover (24h re-engagement)
    if (lead.humanTakeoverAt) {
      const takeoverTime = new Date(lead.humanTakeoverAt).getTime();
      const elapsedHours = (Date.now() - takeoverTime) / (1000 * 60 * 60);

      if (elapsedHours < 24) {
        console.log(`[OpenRouterCloser] Lead ${lead.phone} está bajo control humano (${elapsedHours.toFixed(1)}h transcurridas). IA en silencio.`);
        return {
          shouldRespond: false,
          reason: 'human_takeover_active'
        };
      } else {
        console.log(`[OpenRouterCloser] Reenganche automático para ${lead.phone}: pasaron >24h desde la última intervención humana.`);
        // Reenganchar: limpiar humanTakeoverAt
        await OutreachRepo.updateLeadStatus(lead.phone, 'REPLIED', { humanTakeoverAt: null });
      }
    }

    // 2. Obtener historial de la conversación
    const history = await OutreachRepo.getChatHistory(lead.phone, 15);

    const apiKey = OpenRouterCloser.getApiKey();

    if (!apiKey) {
      console.warn('⚠️ [OpenRouterCloser] OPENROUTER_API_KEY no detectada. Ejecutando motor heurístico de contingencia.');
      return OpenRouterCloser.heuristicFallback(lead, incomingText, service);
    }

    try {
      return await OpenRouterCloser.callOpenRouter(lead, incomingText, service, history);
    } catch (err: any) {
      console.error('[OpenRouterCloser] Error llamando a OpenRouter:', err.message);
      return OpenRouterCloser.heuristicFallback(lead, incomingText, service);
    }
  }

  private static async callOpenRouter(
    lead: Lead,
    incomingText: string,
    service: ServiceDefinition,
    history: ChatMessage[]
  ): Promise<CloserResult> {
    const apiKey = OpenRouterCloser.getApiKey();
    const model = OpenRouterCloser.getModel();

    // Construcción del System Prompt de Ventas Incorruptible
    const systemPrompt = `
Eres Kenneth, consultor principal de The Quant Partners representando a "${service.name}".
Objetivo comercial: ${service.description}
Público objetivo: ${service.targetPersona}
Directivas de contexto: ${service.aiSystemPrompt}

REGLAS INCORRUPTIBLES (OBLIGATORIAS Y SIN EXCEPCIÓN):
1. NUNCA ALUCINES NI INVENTES DATOS: Si no tienes una información específica en tus directivas, NUNCA la supongas ni la improvises.
2. PROHIBIDO INVENTAR PRECIOS O DESCUENTOS: No menciones montos en soles, dólares ni promociones bajo ninguna circunstancia.
   - Si el cliente pregunta "¿Cuánto cuesta?", "¿Qué precio tiene?" o pide cotización:
     Explica brevemente qué contempla la solución (atención 24/7, agendamiento de pacientes y filtro de consultas) e indícale que para darle la propuesta económica a la medida de su sede, le estás pasando la conversación a Kenneth para que le envíe la cotización directamente por este chat. (Clasifica como "READY_TO_BUY").
3. CRITERIOS ESTRICTOS DE HANDOFF A KENNETH:
   - SOLO haz handoff en dos casos:
     a) Cuando el cliente muestre CLARO INTERÉS EN CONTRATAR, COMPRAR O COTIZAR (ej. "quiero empezar", "cómo contratamos", "¿dónde pago?", "cuánto cuesta"):
        Responde confirmando que Kenneth le enviará la cotización y pasos de activación por aquí, y clasifica como intent "READY_TO_BUY".
     b) Cuando el cliente haga una pregunta técnica, médica, legal o específica que NO puedas responder con total certeza, o si pide hablar con una persona:
        Reconoce con profesionalismo y dile que le transfieres la consulta a Kenneth para que le dé el dato exacto por este chat, y clasifica como intent "REQUEST_HUMAN".
   - En cualquier otra interacción donde pregunten cómo funciona, de qué se trata o tengan dudas normales:
     Responde la duda con amabilidad, precisión y brevedad (1 a 3 oraciones tipo chat de WhatsApp), y haz una pregunta consultiva de avance. (Clasifica como "CONVERSATION"). ¡NO hagas handoff en este punto!
4. RECHAZOS ("no me interesa", "no gracias", "sáquenme de la lista"):
   Agradece con educación y respeto, y clasifica como "NOT_INTERESTED".
5. ESTILO DE MENSAJE:
   Escribe como una persona real por WhatsApp: máximo 1 a 3 frases cortas. Nada de párrafos enormes ni lenguaje robótico.

RESPONDE ESTRICTAMENTE EN FORMATO JSON VÁLIDO:
{
  "reply": "Tu mensaje para enviar al prospecto",
  "intent": "CONVERSATION" | "READY_TO_BUY" | "REQUEST_HUMAN" | "NOT_INTERESTED",
  "reason": "Breve explicación de la decisión comercial"
}
`.trim();

    // Mapear historial
    const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
      { role: 'system', content: systemPrompt }
    ];

    for (const msg of history) {
      messages.push({
        role: msg.role === 'assistant' ? 'assistant' : 'user',
        content: msg.content
      });
    }

    // Agregar el mensaje entrante
    messages.push({ role: 'user', content: incomingText });

    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://quantpartners.pe',
        'X-Title': 'QP Outreach Engine'
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: 0.2,
        response_format: { type: 'json_object' }
      })
    });

    const data: any = await response.json();
    if (!data.choices || !data.choices[0]?.message?.content) {
      throw new Error(`Respuesta inválida de OpenRouter: ${JSON.stringify(data)}`);
    }

    const rawContent = data.choices[0].message.content.trim();
    let parsed: { reply: string; intent: string; reason: string };

    try {
      parsed = JSON.parse(rawContent);
    } catch {
      const match = rawContent.match(/\{[\s\S]*\}/);
      if (match) {
        parsed = JSON.parse(match[0]);
      } else {
        parsed = {
          reply: rawContent,
          intent: 'CONVERSATION',
          reason: 'Respuesta sin formato JSON estricto'
        };
      }
    }

    const intent = (parsed.intent as any) || 'CONVERSATION';
    let adminAlertText: string | undefined;

    if (intent === 'REQUEST_HUMAN') {
      const { rep } = await RoundRobinManager.assignAndAlertLead(
        lead,
        'Consulta específica / Solicitud humana',
        incomingText,
        'PHONE_HANDOFF'
      );
      adminAlertText = `🚨 *CONSULTA ESPECÍFICA ASIGNADA A ${rep.name}*\n\nEmpresa: *${lead.companyName}*\nTeléfono: *+${lead.phone}*\nPregunta: "${incomingText}"\nAcción: ${rep.name} ha sido alertado a su WhatsApp.`;
      await OutreachRepo.updateLeadStatus(lead.phone, 'HUMAN_TAKEOVER', {
        humanTakeoverAt: new Date().toISOString()
      });
    } else if (intent === 'READY_TO_BUY' || intent === 'CLOSING_DELIVERED') {
      const { rep } = await RoundRobinManager.assignAndAlertLead(
        lead,
        'Lead listo para cotizar / comprar',
        incomingText,
        'HYBRID_SMART'
      );
      adminAlertText = `🎯 *LEAD LISTO PARA COTIZAR ASIGNADO A ${rep.name}*\n\nEmpresa: *${lead.companyName}*\nTeléfono: *+${lead.phone}*\nMensaje: "${incomingText}"\nAcción: ${rep.name} ha recibido la ficha para cerrar.`;
      await OutreachRepo.updateLeadStatus(lead.phone, 'HUMAN_TAKEOVER', {
        humanTakeoverAt: new Date().toISOString()
      });
    } else if (intent === 'NOT_INTERESTED') {
      await OutreachRepo.updateLeadStatus(lead.phone, 'CLOSED_LOST');
    } else {
      await OutreachRepo.updateLeadStatus(lead.phone, 'REPLIED');
    }

    return {
      shouldRespond: true,
      replyText: parsed.reply,
      intent,
      adminAlertText,
      reason: parsed.reason
    };
  }

  /**
   * Fallback heurístico inteligente e incorruptible
   */
  private static heuristicFallback(
    lead: Lead,
    incomingText: string,
    service: ServiceDefinition
  ): CloserResult {
    const lower = incomingText.toLowerCase();

    // 1. Solicitud de asesor humano explícita
    if (
      lower.includes('humano') ||
      lower.includes('persona') ||
      lower.includes('asesor') ||
      lower.includes('llámame') ||
      lower.includes('llamada') ||
      lower.includes('número directo')
    ) {
      return {
        shouldRespond: true,
        replyText: 'Entendido. Le transfiero la conversación de inmediato a Kenneth de nuestro equipo para que lo atienda directamente por este chat en unos minutos.',
        intent: 'REQUEST_HUMAN',
        adminAlertText: `🚨 *SOLICITUD DE ASESOR HUMANO*\n\nEmpresa: *${lead.companyName}*\nTeléfono: *+${lead.phone}*\nMensaje: "${incomingText}"\nAcción: Abre el chat de WhatsApp para atenderlo.`
      };
    }

    // 2. Intención de compra, precio o contratación (Handoff a Kenneth)
    if (
      lower.includes('cuánto cuesta') ||
      lower.includes('cuanto cuesta') ||
      lower.includes('precio') ||
      lower.includes('costo') ||
      lower.includes('tarifa') ||
      lower.includes('cotización') ||
      lower.includes('cotizacion') ||
      lower.includes('quiero contratar') ||
      lower.includes('cómo empezamos') ||
      lower.includes('como empezamos') ||
      lower.includes('dónde pago') ||
      lower.includes('donde pago') ||
      lower.includes('datos de pago')
    ) {
      return {
        shouldRespond: true,
        replyText: 'Con gusto. El servicio incluye la configuración e integración de un agente de IA en su WhatsApp oficial para calificar y agendar pacientes 24/7. Para brindarle la cotización formal según el volumen de consultas de su clínica, le aviso a Kenneth para que le comparta la propuesta por este chat en breve.',
        intent: 'READY_TO_BUY',
        adminAlertText: `🎯 *LEAD LISTO PARA COMPRAR / COTIZAR*\n\nEmpresa: *${lead.companyName}*\nTeléfono: *+${lead.phone}*\nMensaje: "${incomingText}"\nAcción: Escríbele a su WhatsApp para coordinar la cotización y cierre.`
      };
    }

    // 3. Rechazo tajante
    if (
      lower.includes('no gracias') ||
      lower.includes('no me interesa') ||
      lower.includes('no estoy interesado') ||
      lower.includes('no estamos interesados') ||
      lower.includes('dejen de escribir') ||
      lower.includes('eliminen')
    ) {
      return {
        shouldRespond: true,
        replyText: 'Comprendo perfectamente. Muchas gracias por su tiempo y que tengan un excelente día.',
        intent: 'NOT_INTERESTED'
      };
    }

    // 4. Preguntas generales sobre el servicio / Interés inicial (El bot atiende sin hacer handoff)
    if (
      /(^|\W)(si|sí|claro|dale|de acuerdo|pásalo|pasamelo|comparte|compartir|cuéntame|resumen)(\W|$)/i.test(incomingText) ||
      lower.includes('de qué trata') ||
      lower.includes('de que trata') ||
      lower.includes('cómo funciona') ||
      lower.includes('como funciona') ||
      lower.includes('más información') ||
      lower.includes('mas informacion')
    ) {
      return {
        shouldRespond: true,
        replyText: 'Con gusto. Desarrollamos agentes de IA que se integran directo al WhatsApp de su clínica para responder dudas de tratamientos 24/7 y agendar citas automáticamente en su sistema. ¿Actualmente pierden pacientes fuera de horario o tienen personal dedicado todo el día?',
        intent: 'CONVERSATION'
      };
    }

    // 5. Pregunta desconocida o compleja -> Handoff a Kenneth para no alucinar
    return {
      shouldRespond: true,
      replyText: 'Para brindarle el dato exacto con la precisión que merece, le transfiero la consulta a Kenneth de nuestro equipo comercial para que le responda directamente por este medio en breve.',
      intent: 'REQUEST_HUMAN',
      adminAlertText: `🚨 *PREGUNTA ESPECÍFICA DE CLIENTE (REQUIERE INTERVENCIÓN)*\n\nEmpresa: *${lead.companyName}*\nTeléfono: *+${lead.phone}*\nPregunta: "${incomingText}"\nAcción: Escríbele a su WhatsApp para responderle con precisión.`
    };
  }

  /**
   * MODO CO-PILOTO (QPARTNER):
   * Genera 3 sugerencias tácticas en tiempo real para que el asesor humano (Kenneth)
   * pueda elegir y enviar en 1 solo clic o editar desde el dashboard.
   */
  public static async generateCopilotSuggestions(
    lead: Lead,
    service?: ServiceDefinition
  ): Promise<CopilotSuggestion[]> {
    const history = await OutreachRepo.getChatHistory(lead.phone, 12);
    const aiConfig = await OpenRouterCloser.getAiConfig();

    if (!aiConfig.apiKey) {
      return OpenRouterCloser.heuristicCopilotSuggestions(lead, history, service);
    }

    try {
      const model = aiConfig.model;
      const endpoint = OpenRouterCloser.getEndpoint(aiConfig.provider);
      const serviceName = service?.name || 'The Quant Partners';
      const serviceDesc = service?.description || 'Soluciones B2B de IA y Licitaciones';
      const targetPersona = service?.targetPersona || 'Decisores de compra';

      const lastClientMsg = [...history].reverse().find(m => m.role === 'user')?.content || '';
      const isMetaAd = lead.source === 'meta_ads' || (lead.category && lead.category.includes('MetaAds'));
      const isInboundGeneral = lead.serviceId === 'inbound-general' || lead.source === 'direct_whatsapp';

      const adContextNotice = isMetaAd 
        ? `🔥 CANAL DE ORIGEN: META ADS (Click-to-WhatsApp). Este prospecto hizo clic en un anuncio de Facebook/Instagram y escribió voluntariamente. Tiene interés directo y alta intención de compra; requiere respuesta rápida, empatía y cualificación.`
        : (isInboundGeneral 
            ? `💬 CANAL DE ORIGEN: INBOUND ORGÁNICO / CONTACTO DIRECTO. Este prospecto escribió por primera vez a la línea de WhatsApp de la empresa de forma independiente. NO viene de una campaña de prospección en frío ni de licitaciones. Requiere un saludo profesional, cálido y consultivo para identificar su interés o necesidad.`
            : `CANAL DE ORIGEN: Prospección Comercial B2B.`);

      const optionsDirective = isMetaAd
        ? `1. "💬 Empatía + Cualificación Inmediata": Agradece su mensaje del anuncio, responde a lo que pregunta de forma directa y haz 1 pregunta de filtro (ej. requerimiento, presupuesto o distrito).
2. "🎯 Cierre y Agendamiento": Invita a una breve llamada de 10 min o demostración para cotizarle a su medida.
3. "📄 Envío de Catálogo / Folleto": Ofrece compartir el folleto/catálogo técnico en PDF o ficha comercial con 1 clic.`
        : (isInboundGeneral
            ? `1. "💬 Saludo & Diagnóstico": Saluda con calidez y cortesía, agradécele por comunicarse con The Quant Partners y haz una pregunta abierta para conocer en qué solución o servicio desea información.
2. "💼 Presentación & Filtro": Preséntate brevemente como parte del equipo de The Quant Partners (soluciones de IA y adquisición B2B) y consulta el requerimiento puntual de su empresa.
3. "🎯 Agendar Llamada Breve": Ofrece coordinar una breve llamada de 10 minutos para conocer su caso o resolver sus dudas directamente.`
            : `1. "🎯 Cierre y Agendamiento": Para avanzar hacia una llamada breve (10 min), reunión o confirmación formal de fecha/hora.
2. "📄 Entrega de Valor / Documento": Para compartir un dictamen pericial, PDF técnico, video o resolver una duda técnica con solvencia.
3. "🤝 Seguimiento Cortés": Breve, educado, de bajo compromiso (ideal si el cliente fue escueto como "ok gracias" o si no queremos atosigarlo).`);

      const systemPrompt = `
Eres QPartner, el Co-Piloto de Asistencia Comercial en Vivo para el equipo de ventas de The Quant Partners.
El asesor está chateando por WhatsApp con un cliente potencial.

${adContextNotice}

DATOS DEL PROSPECTO:
- Empresa/Contacto: ${lead.companyName}
- Teléfono: +${lead.phone}
- Campaña / Solución: ${isInboundGeneral ? 'The Quant Partners (Atención General)' : `${serviceName} (${serviceDesc})`}
- Perfil: ${targetPersona}
- Etiqueta: ${lead.category || 'General'}

ÚLTIMO MENSAJE DEL PROSPECTO: "${lastClientMsg}"

TU TAREA:
Genera exactamente 3 opciones tácticas de respuesta diferentes para que el asesor elija con 1 clic:
${optionsDirective}

REGLAS DE ORO:
- Respuestas naturales para WhatsApp en Perú (tono profesional, cálido, directo, sin párrafos eternos: máximo 1 a 3 oraciones cortas).
- No inventes precios ni enlaces ficticios.
- Si el cliente saludó por primera vez, sé cortés y dale la bienvenida inmediatamente.

FORMATO DE RESPUESTA:
Devuelve ÚNICAMENTE un JSON array con 3 elementos:
[
  {
    "label": "${isMetaAd ? '💬 Empatía & Filtro' : (isInboundGeneral ? '💬 Saludo & Diagnóstico' : '🎯 Cierre y Agendamiento')}",
    "badgeColor": "amber",
    "text": "Texto del mensaje para WhatsApp",
    "explanation": "Por qué es efectiva esta opción"
  },
  {
    "label": "${isMetaAd ? '🎯 Agendar Llamada' : (isInboundGeneral ? '💼 Presentación & Filtro' : '📄 Entrega de Dictamen')}",
    "badgeColor": "sky",
    "text": "Texto del mensaje para WhatsApp",
    "explanation": "Por qué es efectiva esta opción"
  },
  {
    "label": "${isMetaAd ? '📄 Enviar Catálogo' : (isInboundGeneral ? '🎯 Agendar Llamada' : '🤝 Seguimiento Cortés')}",
    "badgeColor": "emerald",
    "text": "Texto del mensaje para WhatsApp",
    "explanation": "Por qué es efectiva esta opción"
  }
]
`.trim();

      const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
        { role: 'system', content: systemPrompt }
      ];

      for (const msg of history) {
        messages.push({
          role: msg.role === 'assistant' ? 'assistant' : 'user',
          content: msg.content
        });
      }

      messages.push({
        role: 'user',
        content: `Genera las 3 sugerencias tácticas para responder a: "${lastClientMsg || 'Conversación en curso'}"`
      });

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${aiConfig.apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://qp-outreach-engine.vercel.app',
          'X-Title': 'QP Outreach Engine - QPartner Co-Pilot'
        },
        body: JSON.stringify({
          model,
          messages,
          temperature: 0.3,
          response_format: { type: 'json_object' }
        })
      });

      const data: any = await response.json();
      const rawContent = data.choices?.[0]?.message?.content?.trim();

      if (rawContent) {
        let parsed: any;
        try {
          parsed = JSON.parse(rawContent);
        } catch {
          const match = rawContent.match(/\[[\s\S]*\]/) || rawContent.match(/\{[\s\S]*\}/);
          if (match) parsed = JSON.parse(match[0]);
        }

        const list = Array.isArray(parsed) ? parsed : (parsed?.suggestions || parsed?.options || []);
        if (Array.isArray(list) && list.length >= 2) {
          return list.map((item: any) => ({
            label: item.label || '💡 Sugerencia Táctica',
            badgeColor: item.badgeColor || 'amber',
            text: item.text || item.reply || item.message || '',
            explanation: item.explanation || 'Opción optimizada para conversión'
          }));
        }
      }

      return OpenRouterCloser.heuristicCopilotSuggestions(lead, history, service);
    } catch (err: any) {
      console.warn('[OpenRouterCloser] Error en QPartner Co-Pilot:', err.message);
      return OpenRouterCloser.heuristicCopilotSuggestions(lead, history, service);
    }
  }

  /**
   * Fallback heurístico para QPartner Co-Pilot si OpenRouter está offline
   */
  private static heuristicCopilotSuggestions(
    lead: Lead,
    history: ChatMessage[],
    service?: ServiceDefinition
  ): CopilotSuggestion[] {
    const lastMsg = [...history].reverse().find(m => m.role === 'user')?.content || '';
    const lower = lastMsg.toLowerCase().trim();

    const serviceName = service?.name || 'The Quant Partners';
    const isLicitaciones = service?.id === 'licitaciones-qp' || serviceName.toLowerCase().includes('licitacion');
    const isClinicas = service?.id?.includes('clinica') || serviceName.toLowerCase().includes('clinica');
    const isInmobiliarias = service?.id?.includes('inmobiliari') || serviceName.toLowerCase().includes('inmobiliari');

    let deliverableName = 'diagnóstico preliminar y resumen ejecutivo';
    let deliverableActionText = `Buenos días. Tal como acordamos, le comparto la información preparada por el equipo de ${serviceName}. Quedo atento a cualquier consulta puntual.`;

    if (isLicitaciones) {
      deliverableName = 'dictamen técnico de 3 páginas (EsSalud Piura CP-03)';
      deliverableActionText = `Buenos días. Tal como acordamos, le adjunto el dictamen técnico de 3 páginas preparado por Licitaciones QP con las 2 observaciones clave del pliego de EsSalud Piura (CP-03). Quedo atento a cualquier duda de su equipo técnico.`;
    } else if (isClinicas) {
      deliverableName = 'video de 3 minutos con la arquitectura de agendamiento';
      deliverableActionText = `Buenos días. Con todo gusto le comparto el video demostrativo de 3 minutos donde explicamos cómo el agente de IA en WhatsApp califica y agenda pacientes 24/7: https://thequantpartners.com/demo. ¿Me confirma si pudo visualizarlo?`;
    } else if (isInmobiliarias) {
      deliverableName = 'resumen del sistema de calificación y filtro crediticio';
      deliverableActionText = `Buenos días. Tal como conversamos, le comparto la ficha técnica de cómo el agente filtra el presupuesto de los prospectos antes de pasarlos a su equipo de ventas. Quedo a su disposición.`;
    }

    const isMetaAdLead = lead.source === 'meta_ads' || (lead.category && lead.category.includes('MetaAds')) || lower.includes('anuncio');
    if (isMetaAdLead && history.length <= 3) {
      return [
        {
          label: '💬 Bienvenida + Filtro',
          badgeColor: 'amber',
          text: `¡Hola! Un gusto saludarte. Qué bueno que nos escribes desde nuestro anuncio de ${serviceName}. Cuéntame, ¿para qué requerimiento o proyecto puntual te gustaría implementarlo?`,
          explanation: 'Acuse de recibo inmediato del anuncio + filtro amigable para entender la necesidad exacta.'
        },
        {
          label: '🎯 Agendar Llamada (10 min)',
          badgeColor: 'sky',
          text: `¡Hola! Gracias por escribirnos desde nuestro anuncio. Para cotizarte con precisión y mostrarte cómo funciona, ¿te parece bien coordinar una breve llamada de 10 minutos hoy o mañana?`,
          explanation: 'Propuesta directa para pasar el prospecto a una llamada de cierre.'
        },
        {
          label: '📄 Enviar Ficha / Catálogo',
          badgeColor: 'emerald',
          text: `¡Hola! Con mucho gusto. Tenemos una ficha técnica y catálogo preparado con los detalles de ${serviceName}. ¿Me permites compartírtelo por aquí para que lo revises?`,
          explanation: 'Técnica de permiso de 2 pasos para compartir información de alto valor.'
        }
      ];
    }

    const isInboundGeneral = lead.serviceId === 'inbound-general' || lead.source === 'direct_whatsapp';
    if (isInboundGeneral && history.length <= 3) {
      return [
        {
          label: '💬 Saludo & Diagnóstico',
          badgeColor: 'amber',
          text: `¡Hola! 👋 Un gusto saludarte. Le escribe el equipo de The Quant Partners. ¿En qué podemos asesorarte hoy o qué solución estás buscando para tu negocio?`,
          explanation: 'Saludo cálido y pregunta de diagnóstico abierta para conocer la necesidad real del contacto.'
        },
        {
          label: '💼 Presentación & Filtro',
          badgeColor: 'sky',
          text: `¡Hola! Gracias por comunicarte con The Quant Partners. Desarrollamos motores de adquisición B2B e IA aplicada para empresas. ¿Tienes algún requerimiento comercial puntual que te gustaría revisar?`,
          explanation: 'Presentación ejecutiva de alto nivel y filtro amigable para orientar la conversación.'
        },
        {
          label: '🎯 Agendar Llamada Breve',
          badgeColor: 'emerald',
          text: `¡Hola! Con mucho gusto te atendemos. Si gustas podemos coordinar una breve llamada de 10 minutos para conocer tu caso puntual y orientarte con el especialista indicado. ¿Te vendría bien hoy?`,
          explanation: 'Propuesta de avance directo a llamada de 10 minutos sin presiones.'
        }
      ];
    }

    // Caso 1: El cliente fue escueto ("ok", "gracias", "ok gracias", "entendido", "dale")
    if (
      lower.includes('ok') ||
      lower.includes('gracias') ||
      lower.includes('dale') ||
      lower.includes('de acuerdo') ||
      lower.includes('entendido') ||
      lower === 'gracias' ||
      lower === 'ok'
    ) {
      return [
        {
          label: '📄 Entrega de Valor / Entregable',
          badgeColor: 'sky',
          text: deliverableActionText,
          explanation: 'Entrega directa del valor o documento prometido sin rodeos, generando credibilidad inmediata.'
        },
        {
          label: '🎯 Agendamiento de Revisión (10 min)',
          badgeColor: 'amber',
          text: `Buenos días. ¿Le parecería bien coordinar una breve llamada de 10 minutos hoy a las 11:00 AM o a las 3:30 PM para revisar los puntos clave con nuestro socio consultor?`,
          explanation: 'Técnica de doble opción horaria para cerrar una llamada ejecutiva.'
        },
        {
          label: '🤝 Seguimiento Cortés (Bajo Compromiso)',
          badgeColor: 'emerald',
          text: `Un gusto saludarlos al equipo de ${lead.companyName}. Quedamos a su disposición en caso requieran profundizar en la propuesta. ¡Que tengan una excelente jornada!`,
          explanation: 'Respuesta cordial y sin presión que mantiene abierta la relación comercial.'
        }
      ];
    }

    // Caso 2: Pregunta por precio o cotización
    if (lower.includes('cuanto') || lower.includes('precio') || lower.includes('costo') || lower.includes('cotiz')) {
      return [
        {
          label: '🎯 Calificación y Alcance a la Medida',
          badgeColor: 'amber',
          text: `Con todo gusto le comparto la estructura de costos de ${serviceName}. Para dimensionar el alcance exacto a la medida de su empresa, ¿cuántos procesos o sedes gestionan habitualmente?`,
          explanation: 'Califica el tamaño del cliente antes de anclar una cifra.'
        },
        {
          label: '📄 Propuesta de Retainer + Éxito',
          badgeColor: 'sky',
          text: `Trabajamos bajo un modelo SaaR (Software as a Result) con una base accesible y un componente variable ligado 100% a resultados medibles. Si le parece, le preparo una propuesta preliminar hoy mismo.`,
          explanation: 'Ancla el modelo de resultados comerciales antes de discutir números finales.'
        },
        {
          label: '🤝 Sesión de Diagnóstico Sin Costo',
          badgeColor: 'emerald',
          text: `Podemos revisar su caso puntual sin costo en una llamada de 15 minutos para que evalúen la solución antes de cualquier compromiso comercial. ¿Tienen disponibilidad hoy?`,
          explanation: 'Elimina el riesgo financiero invitando a una sesión de diagnóstico.'
        }
      ];
    }

    // Caso 3: Por defecto
    return [
      {
        label: '🎯 Cierre Consultivo',
        badgeColor: 'amber',
        text: `Hola, un gusto saludarle al equipo de ${lead.companyName}. Le escribe Kenneth de ${serviceName}. ¿Pudieron revisar la información preliminar que les compartimos? Quedo atento si desean evaluar un caso puntual.`,
        explanation: 'Reactiva la conversación preguntando por la revisión previa.'
      },
      {
        label: '📄 Entrega de Caso de Estudio',
        badgeColor: 'sky',
        text: deliverableActionText,
        explanation: 'Ofrece evidencia y credibilidad tangible para despertar interés.'
      },
      {
        label: '🤝 Saludo y Disponibilidad',
        badgeColor: 'emerald',
        text: `Quedamos atentos a cualquier consulta de su área comercial o de proyectos. Saludos cordiales de parte del equipo de The Quant Partners.`,
        explanation: 'Mantiene una presencia educada y no invasiva.'
      }
    ];
  }
}
