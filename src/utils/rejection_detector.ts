// =================================================================
// THE QUANT PARTNERS · REJECTION & OPT-OUT DETECTOR (Meta 2026 Anti-Ban)
// =================================================================

import { PhoneExtractor } from './phone_extractor.js';

export type RejectionCategory =
  | 'EXPLICIT_OPTOUT'        // STOP, BAJA, CANCELAR, UNSUBSCRIBE
  | 'DISINTEREST'            // No me interesa, no gracias, por ahora no, ya tenemos proveedor
  | 'WRONG_CHANNEL_PATIENTS' // Canal exclusivo para pacientes, citas medicas, clinica
  | 'WRONG_CHANNEL_PRIVATE'  // Numero personal, privado, no es para propuestas comerciales
  | 'DO_NOT_DISTURB';        // No vuelvan a escribir, dejen de insistir, borrar de su base

export interface RejectionAnalysis {
  isRejection: boolean;
  isChannelRedirect?: boolean;
  suggestedRedirectAsk?: string;
  category?: RejectionCategory;
  reason?: string;
  suggestedSignoff?: string;
}

export class RejectionDetector {
  /**
   * Patrones que representan interés positivo o aclaración y que NUNCA deben
   * considerarse rechazo, a pesar de contener la palabra "no".
   */
  private static readonly FALSE_POSITIVE_PATTERNS: RegExp[] = [
    /\bno\s+(es|hay)\s+molestia\b/i,
    /\bno\s+te\s+preocupes\b/i,
    /\bno\s+pasa\s+nada\b/i,
    /\bno\s+hay\s+problema\b/i,
    /\bno\s+entend[ií]\b/i,
    /\bno\s+me\s+qued[oó]\s+claro\b/i,
    /\bno\s+estoy\s+segur[oa]\b/i,
    /\bno\s+sé\b/i,
    /\bno\s+tengo\s+mucho\s+tiempo\s+(hoy|ahora)\s+pero\b/i
  ];

  /**
   * 1. Opt-out explícito legal (Meta WhatsApp Business Policy)
   */
  private static readonly EXPLICIT_OPTOUT_REGEX =
    /^(STOP|BAJA|SALIR|CANCELAR|DETENER|ALTO|UNSUBSCRIBE|OPT[-\s]?OUT)$/i;

  /**
   * 2. Canal exclusivo de pacientes o atención médica / salud
   */
  private static readonly PATIENT_CHANNEL_PATTERNS: RegExp[] = [
    /exclusivamente\s+para\s+pacientes/i,
    /solo\s+para\s+pacientes/i,
    /canal\s+de\s+pacientes/i,
    /consultas\s+de\s+pacientes/i,
    /atenci[oó]n\s+(a\s+)?pacientes/i,
    /citas\s+m[eé]dicas/i,
    /no\s+es\s+el\s+espacio\s+para\s+propuestas/i,
    /no\s+es\s+el\s+canal\s+para\s+propuestas/i,
    /no\s+es\s+el\s+espacio\s+para\s+proveedores/i,
    /no\s+es\s+el\s+canal\s+para\s+proveedores/i,
    /no\s+gestionamos?\s+propuestas\s+por\s+(este\s+canal|aqu[ií]|whatsapp)/i,
    /no\s+recibimos\s+propuestas/i,
    /no\s+aceptamos\s+proveedores/i,
    /no\s+compartir\s+detalles\s+internos/i
  ];

  /**
   * 3. Canal privado o número personal
   */
  private static readonly PRIVATE_CHANNEL_PATTERNS: RegExp[] = [
    /este\s+n[uú]mero\s+es\s+(personal|privado)/i,
    /n[uú]mero\s+(personal|privado)/i,
    /es\s+mi\s+n[uú]mero\s+(personal|privado)/i,
    /whatsapp\s+privado/i,
    /whatsapp\s+personal/i,
    /no\s+es\s+n[uú]mero\s+comercial/i,
    /no\s+es\s+tel[eé]fono\s+de\s+la\s+empresa/i,
    /no\s+es\s+el\s+canal\s+comercial/i,
    /no\s+atiendo\s+ventas\s+por\s+aqu[ií]/i
  ];

  /**
   * 4. Desinterés comercial explícito
   */
  private static readonly DISINTEREST_PATTERNS: RegExp[] = [
    /\bno\s+(me|nos)\s+interesa\b/i,
    /\bno\s+est(oy|amos)\s+interesad[oa]s?\b/i,
    /\bsin\s+inter[eé]s\b/i,
    /\bno\s+(deseo|deseamos)\b/i,
    /\bno\s+(requiero|requerimos)\b/i,
    /\bno\s+(necesito|necesitamos)\b/i,
    /\bno\s+gracias\b/i,
    /\bno\s+grc\b/i,
    /\bno\s+grcs\b/i,
    /\bpor\s+el\s+momento\s+no\b/i,
    /\bpor\s+ahora\s+no\b/i,
    /\bde\s+momento\s+no\b/i,
    /\bpor\s+ahora\s+paso\b/i,
    /\ben\s+otra\s+oportunidad\b/i,
    /\bya\s+tenemos\s+(un[ao]?\s+|otr[ao]\s+)?(proveedor|agencia|sistema|software|equipo|quien\s+nos\s+maneje|equipo\s+interno)\b/i,
    /\bya\s+contamos\s+con\s+(un[ao]?\s+|otr[ao]\s+)?(eso|proveedor|agencia|sistema|equipo)\b/i,
    /\bya\s+trabajamos\s+con\s+(un[ao]?\s+|otr[ao]\s+)?(proveedor|agencia|alguien|otra\s+empresa)\b/i,
    /\bno\s+estamos\s+buscando\b/i,
    /\bno\s+gestion(o|amos)\s+ese\s+tipo\s+de\s+decisiones\b/i
  ];

  /**
   * 5. Solicitud de no molestar / no contactar
   */
  private static readonly DO_NOT_DISTURB_PATTERNS: RegExp[] = [
    /no\s+(?:(?:me|nos)\s+)?(?:vuelvan?|vuelvas?)\s+a\s+escribir/i,
    /no\s+(?:(?:me|nos)\s+)?escriban?\s+m[aá]s/i,
    /no\s+(?:(?:me|nos)\s+)?contact(?:ar|en|es)/i,
    /borr(a|en|ar)\s+(mi|este)\s+n[uú]mero/i,
    /elimin(a|en|ar)\s+de\s+su\s+base/i,
    /sacar\s+de\s+su\s+lista/i,
    /no\s+insist(as?|an?|ir)/i,
    /dejen?\s+de\s+(mandar|enviar)\s+mensajes/i,
    /deja\s+de\s+molestar/i,
    /es\s+acoso/i,
    /reportar\s+(como\s+)?spam/i
  ];

  /**
   * Analiza el mensaje entrante y detecta si es un rechazo o solicitud de baja.
   */
  public static analyze(text: string): RejectionAnalysis {
    if (!text || typeof text !== 'string') {
      return { isRejection: false };
    }

    const clean = text.trim();
    if (clean.length === 0) {
      return { isRejection: false };
    }

    // 1. Verificar si es un Opt-Out explícito de una sola palabra
    if (this.EXPLICIT_OPTOUT_REGEX.test(clean)) {
      return {
        isRejection: true,
        category: 'EXPLICIT_OPTOUT',
        reason: `Opt-Out explícito (${clean.toUpperCase()})`,
        suggestedSignoff: 'Entendido. Hemos registrado su baja y no recibirá más comunicaciones. ¡Buen día!'
      };
    }

    // 2. Verificar falsos positivos conocidos ("no es molestia", "no hay problema", etc.)
    for (const fpRegex of this.FALSE_POSITIVE_PATTERNS) {
      if (fpRegex.test(clean)) {
        return { isRejection: false };
      }
    }

    // 2.5. Si el mensaje contiene un correo electrónico o teléfono, es una derivación activa (no rechazo)
    const hasEmail = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/.test(clean);
    const hasPhone = PhoneExtractor.extractReferralPhone(clean) !== null;
    if (hasEmail || hasPhone) {
      return { isRejection: false };
    }

    // 3. Verificar canal exclusivo para pacientes / salud (Oportunidad de Redirección Amable)
    for (const pattern of this.PATIENT_CHANNEL_PATTERNS) {
      if (pattern.test(clean)) {
        return {
          isRejection: false,
          isChannelRedirect: true,
          category: 'WRONG_CHANNEL_PATIENTS',
          reason: `Canal exclusivo de pacientes / citas médicas: "${clean.substring(0, 60)}"`,
          suggestedRedirectAsk: 'Entendido y mil disculpas por escribir a este canal de atención médica/citas 🙌 ¿Habrá algún correo o número directo de administración o gerencia con quien podamos compartirles la información brevemente? 🤝'
        };
      }
    }

    // 4. Verificar canal privado o personal (Oportunidad de Redirección Amable)
    for (const pattern of this.PRIVATE_CHANNEL_PATTERNS) {
      if (pattern.test(clean)) {
        return {
          isRejection: false,
          isChannelRedirect: true,
          category: 'WRONG_CHANNEL_PRIVATE',
          reason: `Número personal o privado: "${clean.substring(0, 60)}"`,
          suggestedRedirectAsk: 'Entendido y mil disculpas por escribir a este número personal 🙌 ¿Habrá algún correo o número directo de administración o gerencia con quien podamos compartirles la propuesta brevemente? 🤝'
        };
      }
    }

    // 5. Verificar solicitud de no molestar / cese de mensajes
    for (const pattern of this.DO_NOT_DISTURB_PATTERNS) {
      if (pattern.test(clean)) {
        return {
          isRejection: true,
          category: 'DO_NOT_DISTURB',
          reason: `Solicitud de cese de contacto: "${clean.substring(0, 60)}"`,
          suggestedSignoff: 'Entendido. Disculpe la molestia, su número ha sido removido de inmediato y no será contactado nuevamente. Saludos cordiales.'
        };
      }
    }

    // 6. Verificar desinterés comercial
    for (const pattern of this.DISINTEREST_PATTERNS) {
      if (pattern.test(clean)) {
        return {
          isRejection: true,
          category: 'DISINTEREST',
          reason: `Desinterés comercial indicado: "${clean.substring(0, 60)}"`,
          suggestedSignoff: 'Entendido y respetado al 100%. Disculpe la molestia y muchas gracias por su tiempo. ¡Que tenga un excelente día!'
        };
      }
    }

    return { isRejection: false };
  }
}
