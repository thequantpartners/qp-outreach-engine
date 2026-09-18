import { Lead } from '../types/index.js';
import { OutreachRepo } from '../db/repo.js';
import { ZohoMailer } from './zoho_mailer.js';

export interface PendingEmailDraft {
  id: string;
  leadPhone: string;
  companyName: string;
  recipientEmail: string;
  subject: string;
  text: string;
  html: string;
  status: 'PENDING_APPROVAL' | 'SENT' | 'REJECTED';
  createdAt: string;
}

export class EmailDispatcher {
  // Almacén en memoria de borradores pendientes de aprobación por Kenneth
  private static pendingDrafts: Map<string, PendingEmailDraft> = new Map();

  /**
   * Extrae una dirección de correo electrónico válida de un texto usando Regex
   */
  public static extractEmailFromText(text: string): string | null {
    if (!text || typeof text !== 'string') return null;
    const emailRegex = /([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/i;
    const match = text.match(emailRegex);
    return match ? match[1].toLowerCase().trim() : null;
  }

  /**
   * Verifica si el lead ya recibió un correo corporativo para evitar envíos duplicados (Blindaje Anti-Spam)
   */
  public static hasAlreadyReceivedEmail(lead: Lead): boolean {
    if (!lead || !lead.customFields) return false;
    return !!(lead.customFields.emailSentAt || lead.customFields.sentEmailId);
  }

  /**
   * Genera un borrador de correo híbrido (estructura ejecutiva + diagnóstico por nicho + CTA)
   */
  public static async generateEmailDraft(
    lead: Lead,
    recipientEmail: string,
    chatSummary?: string
  ): Promise<PendingEmailDraft> {
    const draftId = `draft_${Date.now()}_${lead.phone.slice(-4)}`;
    const companyName = lead.companyName || 'su prestigiosa empresa';
    const isLegal = lead.serviceId?.includes('abogado') || lead.category?.toLowerCase().includes('abogado') || lead.category?.toLowerCase().includes('law');
    const isClinic = lead.serviceId?.includes('clinica') || lead.serviceId?.includes('medspa') || lead.category?.toLowerCase().includes('médic') || lead.category?.toLowerCase().includes('estétic');

    let subject = '';
    let introParagraph = '';
    let nicheParagraph = '';
    let bullets: string[] = [];

    if (isLegal) {
      subject = `Infraestructura Comercial con 2 Agentes de IA: Triaje 24/7 & Seguimiento para ${companyName}`;
      introParagraph = `Les escribe Kenneth Herrera, fundador de The Quant Partners, en seguimiento a nuestra comunicación por WhatsApp y a su solicitud de compartirles información por correo electrónico formal.`;
      nicheParagraph = `Conversando con directores de firmas legales y despachos jurídicos, notamos que el principal cuello de botella comercial es demorarse en responder consultas y perder horas con personas sin viabilidad de caso o prospectos que dejan en visto tras pedir precio.`;
      bullets = [
        '1. Agente Setter 24/7 (Atención en 5s): Responde dudas frecuentes de especialidades jurídicas, precalifica la urgencia/presupuesto y filtra a los curiosos.',
        '2. Agente Reactivador Anti-Ghosting: Recontacta automáticamente a quienes pidieron cotización o dejaron en visto, reactivando consultas dormidas.'
      ];
    } else if (isClinic) {
      subject = `Infraestructura Comercial con 2 Agentes de IA: Flujo de Pacientes, Atención 24/7 & Seguimiento para ${companyName}`;
      introParagraph = `Les escribe Kenneth Herrera, fundador de The Quant Partners, en seguimiento a nuestra comunicación por WhatsApp y a su solicitud de compartirles información por correo oficial.`;
      nicheParagraph = `En clínicas y centros de salud notamos que las ventas se pierden por tardanzas en responder a interesados y ausencia de seguimiento cuando un paciente potencial deja en visto a mitad de coordinación.`;
      bullets = [
        '1. Agente Setter 24/7 (Atención en 5s): Responde consultas sobre tratamientos o citas médicas al instante día y noche, evitando que el paciente busque otra clínica.',
        '2. Agente Reactivador Anti-Ghosting: Recupera de forma empática a pacientes que dejaron en visto tras pedir precios o información de citas.'
      ];
    } else {
      subject = `Infraestructura Comercial con 2 Agentes de IA: Atención 24/7 & Seguimiento para ${companyName}`;
      introParagraph = `Les escribe Kenneth Herrera, fundador de The Quant Partners, en seguimiento a nuestra comunicación por WhatsApp y a su solicitud de compartirles información por correo oficial.`;
      nicheParagraph = `Revisando empresas de su sector, comprobamos que el principal cuello de botella comercial es tardar minutos en responder consultas entrantes y perder hasta el 70% de las ventas porque los prospectos dejan en visto y nadie les hace seguimiento.`;
      bullets = [
        '1. Agente Setter 24/7 (Atención en 5s): Recepción inmediata día y noche, precalificando presupuesto e interés real para no perder prospectos.',
        '2. Agente Reactivador Anti-Ghosting: Recontacto automático e inteligente a prospectos que dejaron en visto, recuperando ventas en automático.'
      ];
    }

    const ctaParagraph = `Para no hacerles perder tiempo con extensas presentaciones: podemos coordinar una breve llamada telefónica de 5 a 10 minutos o coordinar directo por WhatsApp para resolver dudas técnicas y ver si su volumen se adapta a la infraestructura.`;
    const closingParagraph = `Quedo a su entera disposición para coordinar el horario que mejor les acomode.`;

    const text = `Estimado equipo directivo de ${companyName},

${introParagraph}

${nicheParagraph}

En The Quant Partners implementamos una infraestructura comercial con Inteligencia Artificial que opera 100% sobre la API Oficial de Meta en WhatsApp:

${bullets.join('\n\n')}

${ctaParagraph}

${closingParagraph}

Atentamente,

Kenneth Herrera
Fundador & Director de Tecnología
The Quant Partners
WhatsApp / Tel: +51 902 105 668
Correo: partners@thequantpartners.com
Sitio Web: thequantpartners.com`;

    const html = ZohoMailer.generateExecutiveHtml({
      recipientTitle: `Estimado equipo directivo de ${companyName}`,
      paragraphs: [
        introParagraph,
        nicheParagraph,
        'En The Quant Partners implementamos una infraestructura comercial con Inteligencia Artificial que opera 100% sobre la API Oficial de Meta en WhatsApp:',
        ctaParagraph,
        closingParagraph
      ],
      bulletPoints: bullets
    });

    const draft: PendingEmailDraft = {
      id: draftId,
      leadPhone: lead.phone,
      companyName,
      recipientEmail,
      subject,
      text,
      html,
      status: 'PENDING_APPROVAL',
      createdAt: new Date().toISOString()
    };

    // Guardar en memoria y actualizar metadatos del lead en Postgres
    this.pendingDrafts.set(draft.id, draft);
    this.pendingDrafts.set(lead.phone, draft);

    const updatedCustom = {
      ...(lead.customFields || {}),
      detectedEmail: recipientEmail,
      pendingEmailDraft: {
        id: draft.id,
        recipientEmail,
        subject,
        createdAt: draft.createdAt
      }
    };
    await OutreachRepo.updateLeadCustomFields(lead.phone, updatedCustom);

    return draft;
  }

  /**
   * Obtiene el último borrador pendiente de aprobación
   */
  public static getLatestPendingDraft(): PendingEmailDraft | null {
    const drafts = Array.from(this.pendingDrafts.values()).filter(d => d.status === 'PENDING_APPROVAL');
    if (drafts.length === 0) return null;
    return drafts[drafts.length - 1];
  }

  /**
   * Obtiene un borrador por su ID o por teléfono del lead
   */
  public static getDraft(draftIdOrPhone: string): PendingEmailDraft | null {
    return this.pendingDrafts.get(draftIdOrPhone) || null;
  }

  /**
   * Aprueba y envía el correo corporativo vía ZohoMailer
   */
  public static async approvePendingEmail(
    draftIdOrPhone?: string
  ): Promise<{ success: boolean; message: string; draft?: PendingEmailDraft }> {
    let draft: PendingEmailDraft | null = null;

    if (draftIdOrPhone) {
      draft = this.getDraft(draftIdOrPhone);
    } else {
      draft = this.getLatestPendingDraft();
    }

    if (!draft || draft.status !== 'PENDING_APPROVAL') {
      return {
        success: false,
        message: 'No se encontró ningún borrador de correo pendiente de aprobación.'
      };
    }

    // Enviar vía ZohoMailer SMTP
    const result = await ZohoMailer.sendEmail({
      to: draft.recipientEmail,
      subject: draft.subject,
      text: draft.text,
      html: draft.html
    });

    if (!result.success) {
      return {
        success: false,
        message: `Error al enviar correo vía Zoho Mail: ${result.error}`,
        draft
      };
    }

    // Actualizar estado a ENVIADO y registrar en PostgreSQL
    draft.status = 'SENT';
    const lead = await OutreachRepo.getLeadByPhone(draft.leadPhone);
    if (lead) {
      const updatedCustom = {
        ...(lead.customFields || {}),
        emailSentAt: new Date().toISOString(),
        emailMessageId: result.messageId,
        sentEmailTo: draft.recipientEmail,
        pendingEmailDraft: null
      };
      await OutreachRepo.updateLeadCustomFields(draft.leadPhone, updatedCustom);
    }

    return {
      success: true,
      message: `Correo enviado exitosamente a ${draft.recipientEmail} (${draft.companyName}).`,
      draft
    };
  }

  /**
   * Cancela y descarta un borrador pendiente
   */
  public static async cancelPendingEmail(
    draftIdOrPhone?: string
  ): Promise<{ success: boolean; message: string }> {
    let draft: PendingEmailDraft | null = null;

    if (draftIdOrPhone) {
      draft = this.getDraft(draftIdOrPhone);
    } else {
      draft = this.getLatestPendingDraft();
    }

    if (!draft) {
      return { success: false, message: 'No hay borrador pendiente para cancelar.' };
    }

    draft.status = 'REJECTED';
    this.pendingDrafts.delete(draft.id);
    this.pendingDrafts.delete(draft.leadPhone);

    const lead = await OutreachRepo.getLeadByPhone(draft.leadPhone);
    if (lead) {
      const updatedCustom = {
        ...(lead.customFields || {}),
        pendingEmailDraft: null
      };
      await OutreachRepo.updateLeadCustomFields(draft.leadPhone, updatedCustom);
    }

    return { success: true, message: `Borrador para ${draft.companyName} cancelado correctamente.` };
  }
}