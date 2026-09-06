import dotenv from 'dotenv';
import { Lead, ServiceDefinition, ChatMessage } from '../types/index.js';
import { OutreachRepo } from '../db/repo.js';

dotenv.config();

export interface CloserResult {
  shouldRespond: boolean;
  replyText?: string;
  intent?: 'CONVERSATION' | 'CLOSING_DELIVERED' | 'REQUEST_HUMAN' | 'NOT_INTERESTED';
  adminAlertText?: string;
  reason?: string;
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

    // Construcción del System Prompt de Ventas de Alta Conversión
    const systemPrompt = `
Eres un asistente comercial de alto rendimiento para "${service.name}".
Objetivo comercial: ${service.description}
Público objetivo: ${service.targetPersona}
Directivas de personalidad: ${service.aiSystemPrompt}

MODALIDAD DE CIERRE CONFIGURADA:
- Tipo: ${service.closingType}
- Datos de Cierre: ${JSON.stringify(service.closingPayload)}

REGLAS DE ORO EN WHATSAPP:
1. Respuestas cortas, humanas y directas (1 a 3 frases cortas como un chat de WhatsApp real).
2. Tono empático, consultivo y profesional en español de negocios.
3. Si el usuario pide hablar con una persona, asesor o humano, o está molesto, indica "REQUEST_HUMAN" en el intent y di amablemente que un especialista se contactará en minutos.
4. Si el usuario muestra interés o pide el enlace/reunión/datos de pago, entrégalos de forma concisa e indica "CLOSING_DELIVERED".
5. Si el usuario rechaza tajantemente ("no me interesa", "no gracias", "sáquenme de la lista"), respeta su decisión de forma educada e indica "NOT_INTERESTED".
6. En cualquier otro caso de duda o interacción normal, responde la duda e invita al siguiente paso con una pregunta de cierre suave (intent "CONVERSATION").

RESPONDE ESTRICTAMENTE EN FORMATO JSON VÁLIDO CON LA SIGUIENTE ESTRUCTURA:
{
  "reply": "Tu mensaje para enviar al prospecto",
  "intent": "CONVERSATION" | "CLOSING_DELIVERED" | "REQUEST_HUMAN" | "NOT_INTERESTED",
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
        temperature: 0.3,
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
      // Extraer bloque JSON si vino envuelto en markdown
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
      adminAlertText = `🚨 *SOLICITUD DE ASESOR HUMANO*\n\nEmpresa: *${lead.companyName}*\nTeléfono: *${lead.phone}*\nMensaje: "${incomingText}"\nAcción: Intervenir en http://localhost:3100/dashboard`;
      await OutreachRepo.updateLeadStatus(lead.phone, 'HUMAN_TAKEOVER', {
        humanTakeoverAt: new Date().toISOString()
      });
    } else if (intent === 'CLOSING_DELIVERED') {
      adminAlertText = `🎯 *LEAD LISTO / ENLACE ENTREGADO*\n\nEmpresa: *${lead.companyName}*\nTeléfono: *${lead.phone}*\nSe le entregó la información de cierre (${service.closingType}).`;
      await OutreachRepo.updateLeadStatus(lead.phone, 'QUALIFIED');
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
   * Fallback heurístico inteligente si no hay conexión temporal con OpenRouter
   */
  private static heuristicFallback(
    lead: Lead,
    incomingText: string,
    service: ServiceDefinition
  ): CloserResult {
    const lower = incomingText.toLowerCase();

    // 1. Detección de solicitud humana
    if (
      lower.includes('humano') ||
      lower.includes('persona') ||
      lower.includes('asesor') ||
      lower.includes('llámame') ||
      lower.includes('llamada')
    ) {
      return {
        shouldRespond: true,
        replyText: 'Entendido. Le estoy transfiriendo la conversación de inmediato a nuestro consultor principal para que lo atienda directamente por aquí en breve.',
        intent: 'REQUEST_HUMAN',
        adminAlertText: `🚨 *SOLICITUD DE ASESOR HUMANO (Heurística)*\n\nEmpresa: *${lead.companyName}*\nTeléfono: *${lead.phone}*\nMensaje: "${incomingText}"`
      };
    }

    // 2. Aceptación / Interés de cierre
    if (
      lower.includes('sí') ||
      lower.includes('si') ||
      lower.includes('claro') ||
      lower.includes('pásalo') ||
      lower.includes('pasamelo') ||
      lower.includes('comparte') ||
      lower.includes('dale') ||
      lower.includes('de acuerdo') ||
      lower.includes('agenda') ||
      lower.includes('precio')
    ) {
      let closeReply = service.closingPayload.closingMessage;
      if (!closeReply) {
        if (service.closingType === 'MEETING_LINK') {
          closeReply = `Excelente. Puede agendar directamente una breve sesión técnica en este enlace:\n${service.closingPayload.meetingUrl || 'https://cal.com/kenneth-qp'}`;
        } else if (service.closingType === 'PAYMENT_INFO') {
          closeReply = `Con gusto. Para proceder, nuestros datos de pago son:\n${service.closingPayload.paymentDetails || 'BCP Soles / Yape corporativo'}`;
        } else {
          closeReply = `Con gusto, le comparto los detalles para que su equipo los revise. ¿Tienen alguna consulta específica que deseen priorizar?`;
        }
      }

      return {
        shouldRespond: true,
        replyText: closeReply,
        intent: 'CLOSING_DELIVERED',
        adminAlertText: `🎯 *LEAD INTERESADO (Heurística)*\n\nEmpresa: *${lead.companyName}*\nTeléfono: *${lead.phone}*\nMensaje: "${incomingText}"`
      };
    }

    // 3. Rechazo
    if (lower.includes('no gracias') || lower.includes('no me interesa') || lower.includes('no estoy interesado')) {
      return {
        shouldRespond: true,
        replyText: 'Muchas gracias por su tiempo y respuesta. Que tenga una excelente semana.',
        intent: 'NOT_INTERESTED'
      };
    }

    // 4. Pregunta general
    return {
      shouldRespond: true,
      replyText: `Comprendo perfectamente su consulta. ¿Le parece si coordinamos una breve llamada de 10 minutos para revisar los puntos específicos para ${lead.companyName}?`,
      intent: 'CONVERSATION'
    };
  }
}
