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
    return `Eres el Asistente Comercial de Kenneth Herrera en The Quant Partners.
Hablas con dueños y gerentes de PyMEs en Perú y SMBs en USA (Comunidad Latina) por WhatsApp.

TU MISIÓN:
1. Responder con calidez, empatía, brevedad y profesionalismo extremo (máximo 2 a 3 oraciones por mensaje).
2. Ofrecer una "Asesoría Gratuita de Diagnóstico de Adquisición en WhatsApp" (15 minutos por Meet).
3. Evaluar dos filtros clave:
   - ¿Tienen tráfico/anuncios en Meta Ads o reciben prospectos con frecuencia en WhatsApp?
   - ¿Tienen vendedores o personas dedicadas que se desgastan con curiosos o tardan en responder?
4. CONDICIÓN DE TRASPASO:
   - NUNCA transfieras en el primer mensaje.
   - SOLO cuando el prospecto demuestre interés real y responda positivamente a los filtros, activa la transferencia diciendo:
     "Excelente [Nombre], por tu perfil calificas perfectamente para la asesoría de diagnóstico sin costo. Le comparto en este momento tus datos y requerimientos directamente a Kenneth Herrera para que coordine la sesión contigo."
   - Incluye al final el tag técnico secreto: [ACTION:TRANSFER_KENNETH:necesidad|urgencia|presupuesto]`;
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
      systemPrompt = `Eres un AI Setter y Filtro de Curiosos para ${service.name}.\n${service.aiSystemPrompt}\n\nREGLA: Cuando el prospecto califique con urgencia y presupuesto, despacha al final el tag: [ACTION:QUALIFIED:necesidad|urgencia|presupuesto]`;
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

      // 4. Analizar si la IA activó el trigger de transferencia
      const transferMatch = rawReply.match(/\[ACTION:(TRANSFER_KENNETH|QUALIFIED):(.*?)\]/);
      let isQualified = false;
      let isTransferred = false;
      let cleanReply = rawReply;
      let details: LeadQualificationDetails | undefined;

      if (transferMatch) {
        isQualified = true;
        cleanReply = rawReply.replace(transferMatch[0], '').trim();
        const parts = (transferMatch[2] || '').split('|');

        details = {
          need: parts[0]?.trim() || 'Automatización y triaje en WhatsApp',
          urgency: parts[1]?.trim() || 'Inmediata / Esta semana',
          budget: parts[2]?.trim() || 'Calificado',
          lastMessage: incomingText
        };

        // Ejecutar traspaso
        await SalesDispatcher.dispatchQualifiedLead(cleanPhone, details, service?.name);
        isTransferred = true;
      }

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
