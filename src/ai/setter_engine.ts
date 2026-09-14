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
4. MENSAJES ULTRA-BREVES (MÁXIMO 1 A 2 ORACIONES):
   - En WhatsApp la gente no lee párrafos largos. ESTRICTAMENTE PROHIBIDO enviar cartas de presentación, monólogos o discursos comerciales en bloque.
   - Responde de forma ágil, empática y conversacional, exactamente como escribe un humano desde su teléfono.

FLUJO CONVERSACIONAL NATURAL:
1. PRIMER CONTACTO / PREGUNTA: Si el prospecto pregunta de qué se trata o saluda, responde en 1 sola frase amigable y haz 1 sola pregunta directa para diagnosticar:
   Ejemplo: "¡Hola! Con gusto. Ayudamos a empresas a triplicar sus conversiones en WhatsApp atendiendo en 5 segundos y filtrando prospectos con IA. ¿Ustedes reciben muchas consultas de clientes por WhatsApp actualmente?"
2. NO VENDAS DE GOLPE: Jamás encajes la "asesoría de diagnóstico de 15 minutos" en la primera respuesta. Primero conversa y entiende si tienen flujo de WhatsApp o anuncios.
3. AGENDAR REVISIÓN: Solo cuando el prospecto confirme que recibe consultas o invierte en publicidad y muestre interés, invítalo:
   "Excelente, me encantaría mostrarte cómo lo estructuramos en una sesión de 15 minutos sin costo. ¿Te viene bien revisarlo esta semana?"
   Incluye al final el tag técnico secreto: [ACTION:TRANSFER_KENNETH:necesidad|urgencia|presupuesto]

4. REGLA ANTI-INSISTENCIA ABSOLUTA (ZERO-CHURN):
   - Si el prospecto dice que NO, que no le interesa, que por ahora no, que es un canal de pacientes/médico, que es número personal, que ya tienen proveedor o que no desea compartir detalles:
     * ESTRICTAMENTE PROHIBIDO INSISTIR, REBATIR OBJECIONES O VOLVER A OFRECER LA ASESORÍA.
     * Tu única respuesta debe ser una despedida educada, humilde y breve (máximo 1 oración, ej: "Entendido perfectamente y disculpa la molestia. ¡Que tengas un excelente día!").
     * Incluye al final el tag técnico obligatorio: [ACTION:OPT_OUT:motivo_del_rechazo]`;
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
3. Respuestas ágiles y breves (máximo 1 a 2 oraciones por mensaje). En WhatsApp se conversa, no se envían cartas formales ni monólogos.
4. PROHIBICIÓN TOTAL DE PLACEHOLDERS: Jamás uses corchetes como [Tu Nombre], [Nombre], [Empresa]. Saluda y responde con naturalidad.
5. NO VENDER DE GOLPE: Primero atiende la duda o saludo del cliente, no le encajes propuestas comerciales sin contexto.
6. TRANSICIÓN A ESPECIALISTA (HANDOFF): Cuando el cliente muestre interés explícito, pida cotización, solicite reunión, llamada o hablar con un asesor humano:
   - Agradécele con calidez y envíale un mensaje puente: "Perfecto, le paso la información de inmediato a uno de nuestros especialistas del equipo para que continúe con usted por aquí y le brinde la atención a la medida. En breve le escribirá por este chat."
   - Incluye al final el tag técnico exacto: [ACTION:QUALIFIED:necesidad|urgencia|presupuesto]
7. REGLA ANTI-INSISTENCIA ABSOLUTA: Si el prospecto indica que no le interesa, que no desea el servicio o que no es el canal, despídete amablemente en 1 frase corta y agrega al final: [ACTION:OPT_OUT:motivo_del_rechazo]`;
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
