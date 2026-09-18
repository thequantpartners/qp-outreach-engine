// =================================================================
// THE QUANT PARTNERS · WARM REFERRAL ENGINE (Meta 2026 Inbound Routing)
// =================================================================
// Detecta cuando recepcionistas / asesores derivan a tomadores de decisión
// Solicita el nombre educadamente si no fue provisto, persiste el estado
// en PostgreSQL, despacha la prospección cálida en 2 pasos y alerta a Kenneth.
// =================================================================

import { OutreachRepo } from '../db/repo.js';
import { Lead } from '../types/index.js';
import { PhoneExtractor } from '../utils/phone_extractor.js';

export interface ReferralParseResult {
  phone: string | null;
  name: string | null;
  role: string | null;
  isRefusal?: boolean;
}

export class WarmReferralEngine {
  private static readonly GENERIC_ROLES = [
    'encargada', 'encargado', 'la encargada', 'el encargado',
    'gerencia', 'gerente', 'el gerente', 'la gerente',
    'administracion', 'administración', 'administradora', 'administrador',
    'la jefa', 'el jefe', 'jefe', 'jefa',
    'dueño', 'dueña', 'la dueña', 'el dueño',
    'doctor', 'doctora', 'el doctor', 'la doctora',
    'recepcion', 'recepción', 'secretaria', 'asistente',
    'coordinacion', 'coordinación', 'coordinador', 'coordinadora',
    'soporte', 'ventas', 'operaciones', 'rrhh', 'recursos humanos'
  ];

  private static readonly STOP_WORDS = new Set([
    'al', 'a', 'el', 'la', 'los', 'las', 'de', 'del', 'en', 'por', 'con', 'para',
    'su', 'sus', 'mi', 'mis', 'un', 'una', 'este', 'esta', 'ese', 'esa',
    'numero', 'número', 'cel', 'celular', 'telefono', 'teléfono', 'fono', 'ws', 'wsp',
    'favor', 'gracias', 'hola', 'buenas', 'tardes', 'dias', 'días', 'noches',
    'es', 'son', 'se', 'llama', 'comunicarse', 'hablar', 'escribir', 'llamar',
    'te', 'le', 'nos', 'me', 'paso', 'dejo', 'contacto', 'directo'
  ]);

  /**
   * Extrae el rol o cargo mencionado en el texto (ej. "la encargada", "gerencia", etc.)
   */
  public static extractRole(text: string): string | null {
    const lower = text.toLowerCase();
    for (const role of this.GENERIC_ROLES) {
      const regex = new RegExp(`\\b${role}\\b`, 'i');
      if (regex.test(lower)) {
        return role;
      }
    }
    return null;
  }

  /**
   * Sanitiza un nombre propio eliminando prefijos de cortesía y palabras de relleno
   */
  public static cleanPersonName(rawName: string): string {
    let clean = rawName.trim();
    clean = clean.replace(/^(se\s+llama|su\s+nombre\s+es|es\s+la|es\s+el|es|con|a|al|la|el|de\s+parte\s+de)\s+/i, '');
    clean = clean.replace(/^(?:la\s+|el\s+)?(?:doctor[a]?|dr[a]?\.?|licenciad[oa]|lic\.?|ing\.?|señorita|señor[a]?|sr[a]?\.?|don|doña)\s+/i, '');
    clean = clean.replace(/\s+(por\s+favor|gracias|cel|celular|telefono|teléfono|al|es|su\s+numero|numero|número).*$/i, '');
    clean = clean.replace(/[.,:;!¡?¿"'-]/g, ' ').replace(/\s+/g, ' ').trim();

    return clean
      .split(' ')
      .filter(w => w.length > 1 && !this.STOP_WORDS.has(w.toLowerCase()))
      .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
      .join(' ');
  }

  /**
   * Detecta si la respuesta es una negativa o desconocimiento del nombre
   */
  public static isRefusal(text: string): boolean {
    const norm = text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
    const refusalPhrases = [
      'no se', 'no se su nombre', 'no me acuerdo', 'no tengo su nombre',
      'ninguno', 'ninguna', 'nadie', 'no sabria decirte', 'desconozco',
      'no', 'tampoco'
    ];
    return refusalPhrases.some(p => norm === p || norm.startsWith(p));
  }

  /**
   * Verifica si una cadena corresponde a un rol genérico en vez de a una persona
   */
  public static isGenericRoleOrEmpty(name: string): boolean {
    if (!name || name.length < 2) return true;
    const lower = name.toLowerCase().trim();
    if (this.STOP_WORDS.has(lower)) return true;
    return this.GENERIC_ROLES.some(role => lower === role || lower === `la ${role}` || lower === `el ${role}`);
  }

  /**
   * Analiza un texto y extrae tanto el número telefónico como el nombre de la persona referida
   */
  public static parseReferralFromText(text: string, currentPhone?: string): ReferralParseResult {
    const phone = PhoneExtractor.extractReferralPhone(text, currentPhone);
    let textWithoutPhone = text;

    if (phone) {
      const rawDigits = phone.replace(/[^0-9]/g, '');
      const last9 = rawDigits.slice(-9);
      textWithoutPhone = textWithoutPhone.replace(new RegExp(`(?:\\+?51)?\\s*${last9}\\b`, 'g'), '');
      textWithoutPhone = textWithoutPhone.replace(new RegExp(phone, 'g'), '');
    }

    const detectedRole = this.extractRole(textWithoutPhone);

    // 1. "se llama [Nombre]", "su nombre es [Nombre]"
    const nameIntroMatch = textWithoutPhone.match(/(?:se\s+llama|su\s+nombre\s+es|nombre\s*:)\s+([A-ZÁÉÍÓÚÑa-záéíóúñ]{2,}(?:\s+[A-ZÁÉÍÓÚÑa-záéíóúñ]{2,})*)/i);
    if (nameIntroMatch && nameIntroMatch[1]) {
      const candidate = this.cleanPersonName(nameIntroMatch[1]);
      if (!this.isGenericRoleOrEmpty(candidate)) {
        return { phone, name: candidate, role: detectedRole };
      }
    }

    // 2. "la encargada es [Nombre]", "es [Nombre]"
    const esMatch = textWithoutPhone.match(/(?:encargad[oa]|jef[ea]|dueñ[oa]|administrador[a]?|gerente|contacto)\s+es\s+([A-ZÁÉÍÓÚÑa-záéíóúñ]{2,}(?:\s+[A-ZÁÉÍÓÚÑa-záéíóúñ]{2,})*)/i);
    if (esMatch && esMatch[1]) {
      const candidate = this.cleanPersonName(esMatch[1]);
      if (!this.isGenericRoleOrEmpty(candidate)) {
        return { phone, name: candidate, role: detectedRole };
      }
    }

    // 3. "comunicarse con [Nombre] al", "habla con [Nombre]", "escribe a [Nombre]"
    const actionMatch = textWithoutPhone.match(/(?:comunicar(?:se)?\s+con|hablar?\s+con|escrib(?:ir|e)\s+a|contactar?\s+a|llamar?\s+a)\s+(.+)$/i);
    if (actionMatch && actionMatch[1]) {
      const candidate = this.cleanPersonName(actionMatch[1]);
      if (!this.isGenericRoleOrEmpty(candidate)) {
        return { phone, name: candidate, role: detectedRole };
      }
    }

    // 4. "Dra. [Nombre]", "Dr. [Nombre]"
    const docMatch = textWithoutPhone.match(/(?:dra\.?|dr\.?|doctora|doctor)\s+([A-ZÁÉÍÓÚÑa-záéíóúñ]{2,}(?:\s+[A-ZÁÉÍÓÚÑa-záéíóúñ]{2,})*)/i);
    if (docMatch && docMatch[1]) {
      const candidate = this.cleanPersonName(docMatch[1]);
      if (!this.isGenericRoleOrEmpty(candidate)) {
        return { phone, name: candidate, role: detectedRole || 'doctora' };
      }
    }

    // 5. Turno 2 (cuando explícitamente se le preguntó el nombre y el lead responde SOLO con el nombre, sin teléfono)
    if (!phone) {
      if (this.isRefusal(textWithoutPhone)) {
        return { phone: null, name: null, role: detectedRole, isRefusal: true };
      }
      const cleaned = this.cleanPersonName(textWithoutPhone);
      const words = cleaned.split(' ').filter(w => w.length > 1);
      if (words.length >= 1 && !this.isGenericRoleOrEmpty(cleaned)) {
        return { phone: null, name: cleaned, role: detectedRole };
      }
    }

    return { phone, name: null, role: detectedRole };
  }

  /**
   * Extrae teléfono y nombre desde una tarjeta de contacto vCard de Baileys
   */
  public static parseContactCard(contactMessage: any): { phone: string | null; name: string | null } {
    if (!contactMessage) return { phone: null, name: null };
    const displayName = contactMessage.displayName || '';
    const vcard = contactMessage.vcard || '';

    let phone: string | null = null;
    let name: string | null = displayName ? displayName.trim() : null;

    // 1. Extraer teléfono via waid=
    const waidMatch = vcard.match(/waid=(\d+)/i);
    if (waidMatch && waidMatch[1]) {
      phone = waidMatch[1];
    } else {
      const telMatch = vcard.match(/TEL[^:]*:([^\r\n]+)/i);
      if (telMatch && telMatch[1]) {
        phone = telMatch[1].replace(/[^0-9]/g, '');
      }
    }

    // 2. Extraer nombre si no vino en displayName
    if (!name || name === 'Contacto' || this.isGenericRoleOrEmpty(name)) {
      const fnMatch = vcard.match(/FN:([^\r\n]+)/i);
      if (fnMatch && fnMatch[1]) {
        name = fnMatch[1].trim();
      }
    }

    // Sanitizar teléfono peruano o internacional
    if (phone) {
      if (phone.length === 9 && phone.startsWith('9')) {
        phone = `51${phone}`;
      } else if (phone.length === 10) {
        phone = `1${phone}`;
      }
    }

    if (name) {
      name = this.cleanPersonName(name);
      if (this.isGenericRoleOrEmpty(name)) {
        name = null;
      }
    }

    return { phone, name };
  }

  /**
   * Genera la plantilla oficial de prospección cálida (Opción 1 Hormozi / Consultiva)
   */
  public static generateWarmOutreachMessage(params: {
    referralName: string;
    referrerName: string;
    companyName: string;
    category?: string;
  }): string {
    const { referralName, referrerName, companyName, category } = params;

    // Saludo según hora de Lima (PET)
    const nowInLima = new Date().toLocaleString('en-US', { timeZone: 'America/Lima', hour: 'numeric', hour12: false });
    const currentHour = parseInt(nowInLima, 10);
    const greetingTime = currentHour < 12 ? 'Buenos días' : 'Buenas tardes';

    // Primer nombre para saludo cercano y profesional
    const firstName = referralName.split(' ')[0] || referralName;

    // Nicho personalizado
    const catLower = (category || '').toLowerCase();
    let nicheLabel = 'clínicas estéticas y centros médicos';
    if (catLower.includes('inmobiliari') || catLower.includes('bienes')) {
      nicheLabel = 'agencias inmobiliarias y constructoras';
    } else if (catLower.includes('abogad') || catLower.includes('legal') || catLower.includes('jurídic')) {
      nicheLabel = 'estudios jurídicos y firmas legales';
    } else if (catLower.includes('odontolog') || catLower.includes('dental')) {
      nicheLabel = 'clínicas odontológicas y centros dentales';
    }

    return `${greetingTime} ${firstName}, un gusto saludarte.\n\n` +
      `Te escribe el asistente virtual de Kenneth Herrera en The Quant Partners.\n\n` +
      `Me comunico de parte de ${referrerName} de ${companyName}, quien me facilitó tu contacto indicándome que estás a cargo de la gestión.\n\n` +
      `Nos especializamos en implementar Agentes de IA en WhatsApp para ${nicheLabel}, automatizando la atención y el agendamiento 24/7 sin que se pierdan pacientes ni consultas.\n\n` +
      `¿Me permites compartirte un breve video de 3 minutos donde mostramos cómo funciona en vivo?`;
  }

  /**
   * Orquesta la recepción, detección, solicitud de nombre y despacho automático de warm referrals
   */
  public static async processInboundReferral(params: {
    lead: Lead;
    senderPhone: string;
    incomingText: string;
    content?: any;
    sock: any;
    outgoingEngineMsgIds?: Set<string>;
  }): Promise<{ handled: boolean; reason?: string }> {
    const { lead, senderPhone, incomingText, content, sock, outgoingEngineMsgIds } = params;
    const cleanSender = senderPhone.replace(/[^0-9]/g, '');
    const settings = await OutreachRepo.getSettings();
    const adminPhone = (settings.adminWhatsAppPhone || process.env.ADMIN_WHATSAPP_PHONE || '51902105668').replace(/[^0-9]/g, '');

    // -------------------------------------------------------------
    // CASO 1: El lead ya tenía una derivación pendiente esperando el nombre (Turno 2)
    // -------------------------------------------------------------
    const pendingPhone = lead.customFields?.pendingReferralPhone;
    const pendingTimestamp = lead.customFields?.pendingReferralTimestamp;

    if (pendingPhone) {
      const isRecent = !pendingTimestamp || (Date.now() - new Date(pendingTimestamp).getTime() < 24 * 60 * 60 * 1000);
      if (isRecent) {
        console.log(`🎯 [WarmReferralEngine] Lead +${cleanSender} respondió a la pregunta de nombre para +${pendingPhone}: "${incomingText}"`);

        const parsed = this.parseReferralFromText(incomingText, cleanSender);

        if (parsed.isRefusal) {
          console.log(`ℹ️ [WarmReferralEngine] Lead +${cleanSender} indicó no saber o no tener el nombre.`);
          const ackRefusal = `Entendido, no te preocupes 🙌 Muchas gracias de todas formas por la atención. ¡Que tengan un excelente día! 🤝`;
          await sock.sendMessage(`${cleanSender}@s.whatsapp.net`, { text: ackRefusal });
          await OutreachRepo.addChatMessage(cleanSender, 'assistant', ackRefusal);

          await OutreachRepo.updateLeadCustomFields(cleanSender, {
            pendingReferralPhone: null,
            pendingReferralRole: null,
            pendingReferralTimestamp: null
          });
          return { handled: true, reason: 'referral_name_refusal' };
        }

        // Si capturamos el nombre
        const capturedName = parsed.name || (incomingText.trim().length < 30 && !this.isGenericRoleOrEmpty(incomingText.trim()) ? this.cleanPersonName(incomingText) : null);

        if (capturedName) {
          console.log(`✅ [WarmReferralEngine] Nombre capturado exitosamente: "${capturedName}". Procediendo al despacho automático...`);

          await this.executeWarmDispatch({
            referrerLead: lead,
            senderPhone: cleanSender,
            referralPhone: pendingPhone,
            referralName: capturedName,
            sock,
            outgoingEngineMsgIds
          });

          return { handled: true, reason: 'warm_referral_dispatched' };
        } else {
          console.log(`⚠️ [WarmReferralEngine] El texto no contiene un nombre claro. Se mantiene en espera o se transfiere.`);
        }
      }
    }

    // -------------------------------------------------------------
    // CASO 2: Llegó una tarjeta de contacto (vCard / contactMessage)
    // -------------------------------------------------------------
    const contactMsg = content?.contactMessage || (content?.contactsArrayMessage?.contacts && content.contactsArrayMessage.contacts[0]);
    if (contactMsg) {
      console.log(`👤 [WarmReferralEngine] Tarjeta de contacto vCard detectada de +${cleanSender}`);
      const vcardData = this.parseContactCard(contactMsg);

      if (vcardData.phone && vcardData.phone !== cleanSender && vcardData.phone !== adminPhone) {
        if (vcardData.name) {
          console.log(`✅ [WarmReferralEngine] Contacto vCard con nombre completo: ${vcardData.name} (+${vcardData.phone}). Despachando...`);
          await this.executeWarmDispatch({
            referrerLead: lead,
            senderPhone: cleanSender,
            referralPhone: vcardData.phone,
            referralName: vcardData.name,
            sock,
            outgoingEngineMsgIds
          });
          return { handled: true, reason: 'vcard_dispatched' };
        } else {
          // Solicitar el nombre educadamente
          console.log(`⏳ [WarmReferralEngine] vCard recibida con teléfono +${vcardData.phone} pero sin nombre. Solicitando nombre...`);
          await this.askForReferralName({
            lead,
            senderPhone: cleanSender,
            referralPhone: vcardData.phone,
            role: 'encargada',
            sock
          });
          return { handled: true, reason: 'vcard_name_requested' };
        }
      }
    }

    // -------------------------------------------------------------
    // CASO 3: Llegó un mensaje de texto con un teléfono referido
    // -------------------------------------------------------------
    const textParsed = this.parseReferralFromText(incomingText, cleanSender);
    if (textParsed.phone && textParsed.phone !== cleanSender && textParsed.phone !== adminPhone) {
      console.log(`📞 [WarmReferralEngine] Teléfono referido detectado en texto: +${textParsed.phone} (Nombre: ${textParsed.name || 'NULL'}, Rol: ${textParsed.role || 'N/A'})`);

      // Si el texto ya incluía el nombre de la persona
      if (textParsed.name) {
        console.log(`🚀 [WarmReferralEngine] Nombre ya presente en mensaje: "${textParsed.name}". Despachando inmediatamente...`);
        await this.executeWarmDispatch({
          referrerLead: lead,
          senderPhone: cleanSender,
          referralPhone: textParsed.phone,
          referralName: textParsed.name,
          sock,
          outgoingEngineMsgIds
        });
        return { handled: true, reason: 'text_referral_dispatched' };
      } else {
        // Falta el nombre: Le pedimos educadamente el nombre del encargado
        console.log(`⏳ [WarmReferralEngine] Falta nombre del contacto. Guardando pendingReferralPhone y preguntando a +${cleanSender}...`);
        await this.askForReferralName({
          lead,
          senderPhone: cleanSender,
          referralPhone: textParsed.phone,
          role: textParsed.role || 'encargada',
          sock
        });
        return { handled: true, reason: 'text_name_requested' };
      }
    }

    return { handled: false };
  }

  /**
   * Envía la pregunta al lead pidiendo el nombre de la persona encargada
   */
  private static async askForReferralName(params: {
    lead: Lead;
    senderPhone: string;
    referralPhone: string;
    role: string;
    sock: any;
  }): Promise<void> {
    const { lead, senderPhone, referralPhone, role, sock } = params;

    let roleAsk = 'la persona encargada';
    if (role.includes('doctor') || role.includes('dra')) roleAsk = 'la doctora o doctor';
    else if (role.includes('gerent')) roleAsk = 'la persona a cargo de gerencia';
    else if (role.includes('jef')) roleAsk = 'la persona a cargo';
    else if (role.includes('administra')) roleAsk = 'la persona a cargo de administración';

    const askMessage = `¡Excelente! Muchas gracias por el contacto 🙌 ¿Podrías indicarme el nombre de ${roleAsk} para dirigirme con el debido respeto? 🤝`;

    const jid = `${senderPhone}@s.whatsapp.net`;
    await sock.sendMessage(jid, { text: askMessage });
    await OutreachRepo.addChatMessage(senderPhone, 'assistant', askMessage);

    // Guardar estado pendiente en PostgreSQL
    await OutreachRepo.updateLeadCustomFields(senderPhone, {
      pendingReferralPhone: referralPhone,
      pendingReferralRole: role,
      pendingReferralTimestamp: new Date().toISOString()
    });

    console.log(`📢 [WarmReferralEngine] Pregunta de nombre enviada a +${senderPhone}. Esperando respuesta...`);
  }

  /**
   * Ejecuta el despacho cálido, actualiza ambos leads y alerta a Kenneth
   */
  private static async executeWarmDispatch(params: {
    referrerLead: Lead;
    senderPhone: string;
    referralPhone: string;
    referralName: string;
    sock: any;
    outgoingEngineMsgIds?: Set<string>;
  }): Promise<void> {
    const { referrerLead, senderPhone, referralPhone, referralName, sock, outgoingEngineMsgIds } = params;
    const cleanReferral = referralPhone.replace(/[^0-9]/g, '');
    const cleanSender = senderPhone.replace(/[^0-9]/g, '');
    const settings = await OutreachRepo.getSettings();
    const adminPhone = (settings.adminWhatsAppPhone || process.env.ADMIN_WHATSAPP_PHONE || '51902105668').replace(/[^0-9]/g, '');

    // 1. Agradecer a recepción / primer contacto
    const firstName = referralName.split(' ')[0] || referralName;
    const ackMessage = `¡Muchísimas gracias por el contacto! 🙌 Me pongo en comunicación con ${firstName} de inmediato de parte de su equipo. ¡Que tengan un excelente día! 🤝`;
    try {
      await sock.sendMessage(`${cleanSender}@s.whatsapp.net`, { text: ackMessage });
      await OutreachRepo.addChatMessage(cleanSender, 'assistant', ackMessage);
    } catch (ackErr: any) {
      console.warn(`[WarmReferralEngine] Error agradeciendo a +${cleanSender}:`, ackErr.message);
    }

    // Limpiar estado pendiente en el lead que derivó
    await OutreachRepo.updateLeadCustomFields(cleanSender, {
      pendingReferralPhone: null,
      pendingReferralRole: null,
      pendingReferralTimestamp: null,
      referredToPhone: cleanReferral,
      referredToName: referralName,
      redirectedAt: new Date().toISOString()
    });

    // 2. Comprobar si el nuevo contacto ya existe en CRM
    const existing = await OutreachRepo.getLeadByPhone(cleanReferral);
    const isAlreadyEngaged = existing && ['REPLIED', 'QUALIFIED', 'CLOSED_WON', 'HUMAN_TAKEOVER', 'OPT_OUT'].includes(existing.status);

    if (isAlreadyEngaged) {
      console.log(`ℹ️ [WarmReferralEngine] Contacto +${cleanReferral} (${referralName}) ya existe en estado ${existing.status}. Se omitirá el primer mensaje en frío para no duplicar.`);
      await OutreachRepo.updateLeadCustomFields(cleanReferral, {
        referredFromPhone: cleanSender,
        referredByName: referrerLead.companyName,
        lastReferredAt: new Date().toISOString()
      });

      // Notificar a Kenneth
      if (adminPhone) {
        const existingAlert = 
          `🚨 *WARM REFERRAL YA EXISTENTE EN CRM*\n` +
          `━━━━━━━━━━━━━━━━━━━━\n` +
          `🏢 Empresa: *${referrerLead.companyName}*\n` +
          `📱 Derivado por: *+${cleanSender}*\n` +
          `👤 Contacto: *${referralName}* (+${cleanReferral})\n` +
          `📊 Estado actual: *${existing.status}*\n` +
          `━━━━━━━━━━━━━━━━━━━━\n` +
          `💡 *Nota:* No se le envió nuevo mensaje en frío porque ya está en conversación activa.`;

        await sock.sendMessage(`${adminPhone}@s.whatsapp.net`, { text: existingAlert });
      }
      return;
    }

    // 3. Crear o actualizar el nuevo lead en PostgreSQL
    const serviceId = referrerLead.serviceId || 'infraestructura-comercial-peru';
    await OutreachRepo.saveLeadsFromScraper(serviceId, [{
      title: `${referrerLead.companyName} (${referralName})`,
      phone: cleanReferral,
      phoneClean: cleanReferral,
      address: referrerLead.address,
      categoryName: referrerLead.category,
      website: referrerLead.website,
      source: 'warm_referral',
      metadata: {
        contactName: referralName,
        referredFromPhone: cleanSender,
        referredByName: referrerLead.companyName,
        referredAt: new Date().toISOString()
      }
    }]);

    await OutreachRepo.updateLeadStatus(cleanReferral, 'OUTREACH_SENT', {
      lastMessageAt: new Date().toISOString()
    });

    await OutreachRepo.updateLeadCustomFields(cleanReferral, {
      contactName: referralName,
      referredFromPhone: cleanSender,
      referredByName: referrerLead.companyName,
      referredAt: new Date().toISOString()
    });

    // 4. Generar y despachar mensaje de prospección cálida (Opción 1)
    const warmOutreachMessage = this.generateWarmOutreachMessage({
      referralName,
      referrerName: 'su equipo',
      companyName: referrerLead.companyName,
      category: referrerLead.category
    });

    const targetJid = `${cleanReferral}@s.whatsapp.net`;

    // Simular tipeo natural por 3 segundos
    try {
      await sock.sendPresenceUpdate('composing', targetJid);
      await new Promise(r => setTimeout(r, 3000));
      await sock.sendPresenceUpdate('paused', targetJid);
    } catch {}

    const sent = await sock.sendMessage(targetJid, { text: warmOutreachMessage });
    if (sent?.key?.id && outgoingEngineMsgIds) {
      outgoingEngineMsgIds.add(sent.key.id);
    }
    await OutreachRepo.addChatMessage(cleanReferral, 'assistant', warmOutreachMessage);
    console.log(`🚀 [WarmReferralEngine] Mensaje cálido despachado con éxito a +${cleanReferral} (${referralName})`);

    // 5. Notificar a Kenneth en tiempo real por WhatsApp Admin
    if (adminPhone) {
      const adminAlert = 
        `🔥 *NUEVO WARM REFERRAL CONTACTADO AUTOMÁTICAMENTE*\n` +
        `━━━━━━━━━━━━━━━━━━━━\n` +
        `🏢 Empresa: *${referrerLead.companyName}*\n` +
        `📱 Derivado por: *+${cleanSender}* (Recepción/Equipo)\n` +
        `👤 Nuevo Contacto: *${referralName}*\n` +
        `📞 Teléfono: *+${cleanReferral}*\n` +
        `━━━━━━━━━━━━━━━━━━━━\n` +
        `💬 *Mensaje cálido enviado:*\n` +
        `"${warmOutreachMessage.substring(0, 220)}..."\n` +
        `━━━━━━━━━━━━━━━━━━━━\n` +
        `⚡ *El bot de IA ya tomó el contacto y continuará la conversación de forma autónoma.*`;

      try {
        await sock.sendMessage(`${adminPhone}@s.whatsapp.net`, { text: adminAlert });
        console.log(`📢 [WarmReferralEngine] Alerta de Warm Referral enviada a Kenneth (${adminPhone}).`);
      } catch (admErr: any) {
        console.warn(`[WarmReferralEngine] Error enviando alerta a admin:`, admErr.message);
      }
    }
  }
}
