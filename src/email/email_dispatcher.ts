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
      subject = `Infraestructura Comercial de 4 Agentes de IA: Prospección, Triaje 24/7 & Seguimiento para ${companyName}`;
      introParagraph = `Les escribe Kenneth Herrera, fundador de The Quant Partners, en seguimiento a nuestra comunicación por WhatsApp y a su solicitud de compartirles información por correo electrónico formal.`;
      nicheParagraph = `Conversando con directores de firmas legales y despachos jurídicos, notamos que el cuello de botella comercial suele ser triple: no tener un flujo predecible de nuevos prospectos calificados, demoras en responder consultas y perder horas atendiendo a personas sin viabilidad de caso o que dejan en visto.`;
      bullets = [
        '1. Agente de Prospección Activa: Mapeo y contacto continuo de potenciales clientes en su zona para inyectar un flujo constante de casos calificados.',
        '2. Agente de Atención y Triaje Inmediato en 5s (24/7): Responde al instante, perfilando estatus, tipo de caso y presupuesto antes de derivar.',
        '3. Agente de Seguimiento Anti-Ghosting: Recontacta automáticamente a quienes dejan en visto o no responden para reactivar la cita de consulta.',
        '4. Sincronización CRM & Entrega Lista: Deriva a sus abogados únicamente expedientes precalificados listos para pagar la consulta.'
      ];
    } else if (isClinic) {
      subject = `Infraestructura Comercial de 4 Agentes de IA: Flujo de Pacientes, Atención 24/7 & Seguimiento para ${companyName}`;
      introParagraph = `Les escribe Kenneth Herrera, fundador de The Quant Partners, en seguimiento a nuestra comunicación por WhatsApp y a su solicitud de compartirles información por correo oficial.`;
      nicheParagraph = `En clínicas y centros de salud notamos que las ventas se pierden por falta de flujo constante, tardanzas en responder a interesados y ausencia de seguimiento cuando un paciente potencial deja en visto a mitad de coordinación.`;
      bullets = [
        '1. Agente de Prospección Activa: Inyección continua de nuevos pacientes potenciales de su zona geográfica semana a semana.',
        '2. Agente de Respuesta Instantánea en 5s (24/7): Atiende de inmediato día y noche, evitando que el paciente consulte con otra clínica.',
        '3. Agente de Seguimiento Anti-Ghosting: Recontacta de forma natural a pacientes que dejaron en visto para concretar el agendamiento.',
        '4. Sincronización CRM & Meta Ads CAPI: Entrega a su equipo citas confirmadas y optimiza el Pixel de Meta para abaratar el costo por paciente.'
      ];
    } else {
      subject = `Infraestructura Comercial de 4 Agentes de IA: Flujo de Clientes, Atención 24/7 & Seguimiento para ${companyName}`;
      introParagraph = `Les escribe Kenneth Herrera, fundador de The Quant Partners, en seguimiento a nuestra comunicación por WhatsApp y a su solicitud de compartirles información por correo oficial.`;
      nicheParagraph = `Revisando empresas de su sector, comprobamos que el cuello de botella comercial suele ser triple: no contar con un flujo continuo de nuevos prospectos, tardar minutos en responder y perder hasta el 70% de las ventas porque los prospectos dejan en visto y nadie les hace seguimiento.`;
      bullets = [
        '1. Agente de Prospección Activa: Mapeo continuo de su mercado para inyectar un flujo constante y predecible de clientes calificados.',
        '2. Agente de Atención en 5 Segundos (24/7) y Filtrado con IA: Cero prospectos perdidos; separa a los curiosos de los compradores reales.',
        '3. Agente de Seguimiento Anti-Ghosting: Recontacto automático e inteligente a prospectos que dejan en visto, recuperando ventas en automático.',
        '4. Agente de Sincronización CRM & Manejo Nativo en WhatsApp: Sus asesores reciben directo en su chat al cliente calificado listo para agendar o comprar.'
      ];
    }

    const ctaParagraph = `Para no hacerles perder tiempo con extensas presentaciones: ¿tendrían disponibilidad para un breve espacio de 10 a 15 minutos por Google Meet esta semana? Les compartiré pantalla para mostrarles la arquitectura en vivo y cómo opera para empresas de su sector.`;
    const closingParagraph = `Quedo a su disposición para coordinar el día y horario que mejor les acomode.`;

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