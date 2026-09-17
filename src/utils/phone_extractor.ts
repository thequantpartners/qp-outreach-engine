// =================================================================
// THE QUANT PARTNERS · REFERRAL PHONE EXTRACTOR (Meta 2026 Inbound Routing)
// =================================================================

export class PhoneExtractor {
  /**
   * Extrae un número de teléfono de referencia proporcionado en el texto de un chat.
   * Valida formatos de Perú (+51) y USA (+1), excluyendo el número del remitente actual.
   */
  public static extractReferralPhone(text: string, currentPhone?: string): string | null {
    if (!text || typeof text !== 'string') return null;
    const cleanCurrent = (currentPhone || '').replace(/[^0-9]/g, '');

    // 1. Patrones de teléfonos peruanos móviles (9 dígitos que inician con 9)
    // Ejemplos: 987654321, 987 654 321, 987-654-321, +51 987654321, 51987654321
    const peMatches = text.match(/(?:(?:\+|00)?51[\s.-]*)?(?:9\d{2}[\s.-]?\d{3}[\s.-]?\d{3}|9\d{8})\b/g);
    if (peMatches) {
      for (const m of peMatches) {
        let cleaned = m.replace(/[^0-9]/g, '');
        if (cleaned.length === 9 && cleaned.startsWith('9')) {
          cleaned = `51${cleaned}`;
        }
        if (cleaned.length === 11 && cleaned.startsWith('51')) {
          if (cleaned !== cleanCurrent && !cleanCurrent.endsWith(cleaned.slice(2))) {
            return cleaned;
          }
        }
      }
    }

    // 2. Patrones de teléfonos USA (10 dígitos con código de área estándar)
    // Ejemplos: (305) 555-1234, 305-555-1234, 3055551234, +1 305 555 1234
    const usMatches = text.match(/(?:(?:\+|00)?1[\s.-]*)?\(?[2-9]\d{2}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b/g);
    if (usMatches) {
      for (const m of usMatches) {
        let cleaned = m.replace(/[^0-9]/g, '');
        if (cleaned.length === 10) {
          cleaned = `1${cleaned}`;
        }
        if (cleaned.length === 11 && cleaned.startsWith('1')) {
          if (cleaned !== cleanCurrent && !cleanCurrent.endsWith(cleaned.slice(1))) {
            return cleaned;
          }
        }
      }
    }

    return null;
  }
}
