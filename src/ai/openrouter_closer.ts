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
   * MODO CO-PILOTO (PAODING):
   * Genera 3 sugerencias tácticas en tiempo real para que el asesor humano
   * pueda elegir y enviar en 1 solo clic o editar desde el dashboard.
   */
  public static async generateCopilotSuggestions(
    lead: Lead,
    service?: ServiceDefinition
  ): Promise<CopilotSuggestion[]> {
    const history = await OutreachRepo.getChatHistory(lead.phone, 12);
    const apiKey = OpenRouterCloser.getApiKey();

    if (!apiKey) {
      return OpenRouterCloser.heuristicCopilotSuggestions(lead, history, service);
    }

    try {
      const model = OpenRouterCloser.getModel();
      const serviceName = service?.name || 'The Quant Partners';
      const serviceDesc = service?.description || 'Soluciones B2B de IA y Licitaciones';
      const targetPersona = service?.targetPersona || 'Decisores de compra';

      const lastClientMsg = [...history].reverse().find(m => m.role === 'user')?.content || '';

      const systemPrompt = `
Eres Paoding / Co-Piloto de Asistencia Comercial en Vivo para Kenneth de The Quant Partners.
Kenneth está chateando por WhatsApp con un decisor B2B.

DATOS DEL PROSPECTO:
- Empresa: ${lead.companyName}
- Teléfono: +${lead.phone}
- Servicio / Solución: ${serviceName} (${serviceDesc})
- Perfil: ${targetPersona}

ÚLTIMO MENSAJE DEL PROSPECTO: "${lastClientMsg}"

TU TAREA:
Genera exactamente 3 opciones tácticas de respuesta diferentes para que Kenneth elija:
1. "🎯 Cierre y Agendamiento": Para avanzar hacia una llamada breve (10 min), reunión o confirmación formal de fecha/hora.
2. "📄 Entrega de Valor / Documento": Para compartir un dictamen pericial, PDF técnico, video o resolver una duda técnica con solvencia.
3. "🤝 Seguimiento Cortés": Breve, educado, de bajo compromiso (ideal si el cliente fue escueto como "ok gracias" o si no queremos atosigarlo).

REGLAS DE ORO:
- Respuestas naturales para WhatsApp en Perú (tono profesional, respetuoso, directo, sin párrafos eternos: máximo 1 a 3 oraciones cortas).
- No inventes precios ni enlaces ficticios.
- Si el cliente dijo "ok gracias", NO seas redundante; sugiere o entregar el documento prometido, o desearle buena jornada, o fijar la hora de revisión.

FORMATO DE RESPUESTA:
Devuelve ÚNICAMENTE un JSON array con 3 elementos:
[
  {
    "label": "🎯 Cierre y Agendamiento",
    "badgeColor": "amber",
    "text": "Texto del mensaje para WhatsApp",
    "explanation": "Por qué es efectiva esta opción"
  },
  {
    "label": "📄 Entrega de Dictamen",
    "badgeColor": "sky",
    "text": "Texto del mensaje para WhatsApp",
    "explanation": "Por qué es efectiva esta opción"
  },
  {
    "label": "🤝 Seguimiento Cortés",
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

      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://quantpartners.pe',
          'X-Title': 'QP Outreach Engine - Paoding Co-Pilot'
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
      console.warn('[OpenRouterCloser] Error en Paoding Co-Pilot:', err.message);
      return OpenRouterCloser.heuristicCopilotSuggestions(lead, history, service);
    }
  }

  /**
   * Fallback heurístico para Paoding Co-Pilot si OpenRouter está offline
   */
  private static heuristicCopilotSuggestions(
    lead: Lead,
    history: ChatMessage[],
    service?: ServiceDefinition
  ): CopilotSuggestion[] {
    const lastMsg = [...history].reverse().find(m => m.role === 'user')?.content || '';
    const lower = lastMsg.toLowerCase().trim();

    // Caso 1: El cliente fue escueto ("ok", "gracias", "ok gracias", "entendido", "dale")
    if (
      lower.includes('ok') ||
      lower.includes('gracias') ||
      lower.includes('dale') ||
      lower.includes('de acuerdo') ||
      lower.includes('entendido') ||
      lower === 'gracias'
    ) {
      return [
        {
          label: '📄 Entrega de Dictamen / Documento',
          badgeColor: 'sky',
          text: `Buenos días. Tal como acordamos, le adjunto el dictamen técnico de 3 páginas preparado por Licitaciones QP con las 2 observaciones clave del pliego de EsSalud Piura (CP-03). Quedo atento a cualquier duda de su equipo técnico.`,
          explanation: 'Entrega directa de valor acordado sin rodeos, genera confianza inmediata.'
        },
        {
          label: '🎯 Agendamiento de Revisión (10 min)',
          badgeColor: 'amber',
          text: `Buenos días. ¿Le parecería bien coordinar una llamada de 10 minutos hoy a las 11:00 AM o a las 3:00 PM para revisar los puntos críticos del pliego antes de formular las observaciones en el SEACE?`,
          explanation: 'Técnica de doble opción horaria para cerrar una llamada ejecutiva.'
        },
        {
          label: '🤝 Seguimiento Cortés (Bajo Compromiso)',
          badgeColor: 'emerald',
          text: `Un gusto saludarlos. Quedamos a su disposición en caso requieran soporte técnico o legal para la postulación. ¡Que tengan una excelente jornada!`,
          explanation: 'Respuesta cordial y sin presión, mantiene la puerta abierta.'
        }
      ];
    }

    // Caso 2: Pregunta por precio o cotización
    if (lower.includes('cuanto') || lower.includes('precio') || lower.includes('costo') || lower.includes('cotiz')) {
      return [
        {
          label: '🎯 Calificación y Propuesta a la Medida',
          badgeColor: 'amber',
          text: `Con todo gusto le comparto la cotización formal. Para dimensionar el alcance exacto a la medida de su empresa, ¿cuántos procesos o sedes gestionan habitualmente?`,
          explanation: 'Califica el tamaño del cliente antes de anclar una cifra.'
        },
        {
          label: '📄 Alcance del Servicio',
          badgeColor: 'sky',
          text: `El servicio incluye diagnóstico preventivo de bases del SEACE, absolución de observaciones y preparación del pliego técnico para asegurar que no descalifiquen la oferta. Si le parece, le preparo una propuesta preliminar hoy mismo.`,
          explanation: 'Ancla el valor tangible antes de discutir honorarios.'
        },
        {
          label: '🤝 Reunión de Diagnóstico Gratuita',
          badgeColor: 'emerald',
          text: `Podemos revisar su pliego actual sin costo en una sesión de 15 minutos para que evalúen el dictamen antes de cualquier compromiso. ¿Tienen disponibilidad hoy?`,
          explanation: 'Elimina el riesgo financiero invitando a una sesión de diagnóstico sin costo.'
        }
      ];
    }

    // Caso 3: Por defecto
    return [
      {
        label: '🎯 Cierre Consultivo',
        badgeColor: 'amber',
        text: `Hola, un gusto saludarle al equipo de ${lead.companyName}. ¿Pudieron evaluar la información preliminar que les compartimos? Quedo atento si desean revisar un caso puntual.`,
        explanation: 'Reactiva la conversación preguntando por la revisión previa.'
      },
      {
        label: '📄 Entrega de Caso de Estudio',
        badgeColor: 'sky',
        text: `Le comparto un breve resumen técnico de cómo estructuramos la defensa técnica de ofertas ante el OSCE para evitar descalificaciones arbitrarias. ¿A qué correo o por aquí prefiere recibirlo?`,
        explanation: 'Ofrece evidencia y credibilidad para despertar interés.'
      },
      {
        label: '🤝 Saludo y Disponibilidad',
        badgeColor: 'emerald',
        text: `Quedamos atentos a cualquier consulta de su área de proyectos. Saludos cordiales de parte del equipo de The Quant Partners.`,
        explanation: 'Mantiene una presencia educada y no invasiva.'
      }
    ];
  }
}
