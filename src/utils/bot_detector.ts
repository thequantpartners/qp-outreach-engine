// =================================================================
// THE QUANT PARTNERS · BOT-TO-BOT DETECTOR & ANTI-LOOP DEFENSE (2026)
// =================================================================

export interface BotAnalysis {
  isBot: boolean;
  offersHumanTransfer: boolean;
  isBotSelfIdentification: boolean;
  isIvrOrMenu: boolean;
  reason?: string;
  suggestedReply?: string;
}

export class BotDetector {
  /**
   * Patrones donde el bot del prospecto ofrece explícitamente transferir a un humano o asesor.
   */
  private static readonly HUMAN_TRANSFER_OFFER_PATTERNS: RegExp[] = [
    // "¿Quieres que te transfiera con un asesor humano para continuar?"
    // "¿Deseas que te transfiera con un asesor?"
    // "¿Te gustaría que te comunique con un asesor?"
    /(?:quieres?|deseas?|gusta|prefiere[sn]?)\s+(?:que\s+te\s+)?(?:transfiera|comunique|pase|derive|conecte)\s+(?:con\s+)?(?:un\s+)?(?:asesor|agente|persona|ejecutivo|humano|especialista)/i,
    // "¿Quieres que te transfiera ahora?" / "¿Deseas ser transferido?"
    /(?:quieres?|deseas?)\s+(?:que\s+te\s+)?(?:transfiera|derive)\s+ahora/i,
    /(?:desea[ns]?|quiere[ns]?)\s+ser\s+(?:atendid[oa]s?|transferid[oa]s?|derivado[as]?)\s+por\s+(?:un\s+)?(?:humano|asesor|persona|ejecutivo)/i,
    // "te derivaremos con un asesor especializado" / "te transferiré con un asesor"
    /(?:te\s+)?(?:derivar[eé]mos?|transferir[eé]mos?|comunicar[eé]mos?|pasaremos?)\s+con\s+(?:un\s+)?(?:asesor|agente|persona|ejecutivo|humano|especialista)/i,
    // "Escribe 'ASESOR' o 'HUMANO' para hablar con una persona"
    /(?:escribe|digita|marca|responde)\s+(?:['"]?)(?:asesor|humano|persona|agente)(?:['"]?)\s+(?:si\s+deseas|para)/i,
    /(?:si\s+deseas|para)\s+(?:hablar|comunicarte)\s+con\s+(?:un\s+)?(?:asesor|persona|humano)\s+(?:escribe|marca|presiona|responde)/i
  ];

  /**
   * Patrones donde el bot se auto-identifica como asistente virtual o chatbot.
   */
  private static readonly BOT_SELF_IDENTIFICATION_PATTERNS: RegExp[] = [
    // "Soy Dulce, tu asistente virtual" / "Soy el asistente de..."
    /\b(?:tu|su|el|un)\s+asistente\s+virtual\b/i,
    /\bsoy\s+[^.!?\n]*\basistente\s+virtual\b/i,
    /\bsoy\s+[^.!?\n]*\b(bot|agente\s+inteligente|chatbot|asistente\s+con\s+ia)\b/i,
    /\b(asistente\s+virtual|inteligencia\s+artificial|chatbot|canal\s+automatizado)\b.*(?:te\s+ayudar[aá]|a\s+tu\s+disposici[oó]n|bienvenid[oa])/i,
    // "Este es un mensaje automático" / "Respuesta automática"
    /(?:este\s+es\s+un\s+|esto\s+es\s+un\s+)?mensaje\s+autom[aá]tico/i,
    /respuesta\s+autom[aá]tica/i,
    /sistema\s+automatizado\s+de\s+atenci[oó]n/i
  ];

  /**
   * Patrones de menú interactivo / IVR (opciones numeradas o listas de autoatención)
   */
  private static readonly IVR_MENU_PATTERNS: RegExp[] = [
    /(?:selecciona|elige|digita|marca|indica)\s+(?:una\s+opci[oó]n|el\s+n[uú]mero|una\s+de\s+las\s+opciones)/i,
    /(?:para\s+[a-záéíóúñ\s]+(?:marca|digita|presiona)\s+\d+)/i,
    /(?:^|\n)(?:1[.)]|1️⃣|\[1\])[\s\S]*(?:2[.)]|2️⃣|\[2\])[\s\S]*(?:3[.)]|3️⃣|\[3\])/i,
    /(?:^|\n)(?:1[.)]|1️⃣|\[1\])[\s\S]*(?:2[.)]|2️⃣|\[2\])/i
  ];

  /**
   * Mensajes estándar de saludo robótico de auto-respuesta fuera de horario o de bienvenida
   */
  private static readonly AUTO_GREETING_PATTERNS: RegExp[] = [
    /gracias\s+por\s+(?:escribirnos|comunicarte\s+con\s+nosotros)[\s\S]*(?:en\s+breve|un\s+momento|pronto|horario\s+de\s+atenci[oó]n)/i,
    /en\s+este\s+momento\s+(?:nuestros\s+asesores|no\s+nos\s+encontramos\s+disponibles)/i
  ];

  public static analyze(text: string): BotAnalysis {
    const clean = (text || '').trim();
    if (!clean) {
      return { isBot: false, offersHumanTransfer: false, isBotSelfIdentification: false, isIvrOrMenu: false };
    }

    // 1. Verificar si ofrece transferencia humana directamente
    const offersTransfer = this.HUMAN_TRANSFER_OFFER_PATTERNS.some(p => p.test(clean));
    if (offersTransfer) {
      return {
        isBot: true,
        offersHumanTransfer: true,
        isBotSelfIdentification: false,
        isIvrOrMenu: false,
        reason: 'El bot del prospecto ofreció transferir la conversación a un asesor humano',
        suggestedReply: '¡Sí, por favor! 🙌 Te agradecería mucho que me transfieras con el asesor o encargado para coordinar directamente. Quedo muy atento por aquí, ¡muchas gracias! 🤝'
      };
    }

    // 2. Verificar si se autoidentifica como Bot / Asistente Virtual
    const isBotSelf = this.BOT_SELF_IDENTIFICATION_PATTERNS.some(p => p.test(clean));

    // 3. Verificar si es Menú IVR
    const isIvr = this.IVR_MENU_PATTERNS.some(p => p.test(clean));

    // 4. Verificar si es auto-respuesta de bienvenida / ausencia
    const isAutoGreeting = this.AUTO_GREETING_PATTERNS.some(p => p.test(clean));

    if (isBotSelf || isIvr || isAutoGreeting) {
      const reason = isBotSelf 
        ? 'El remitente se identificó como bot o asistente virtual automático'
        : isIvr
        ? 'El remitente envió un menú interactivo de opciones (IVR/Chatbot)'
        : 'Mensaje de auto-respuesta o bienvenida automática detectado';

      return {
        isBot: true,
        offersHumanTransfer: false,
        isBotSelfIdentification: isBotSelf,
        isIvrOrMenu: isIvr,
        reason,
        suggestedReply: 'Hola 🙌 Veo que este es un canal automatizado. ¿Sería posible que me comuniques con el encargado o un asesor humano para coordinar directamente? ¡Muchas gracias! 🤝'
      };
    }

    return {
      isBot: false,
      offersHumanTransfer: false,
      isBotSelfIdentification: false,
      isIvrOrMenu: false
    };
  }
}
