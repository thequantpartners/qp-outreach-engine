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
      subject = `Sistema de Triaje & Precalificación Inmediata en WhatsApp para ${companyName}`;
      introParagraph = `Les escribe Kenneth Herrera, fundador de The Quant Partners, en seguimiento a nuestra comunicación por WhatsApp y a su solicitud de compartirles información por correo electrónico formal.`;
      nicheParagraph = `Conversando con directores de firmas de inmigración y despachos jurídicos en Texas y Florida, notamos un cuello de botella recurrente: al correr anuncios o recibir alto flujo de consultas en redes, hasta un 65% de los prospectos se pierden por demoras en responder, o su equipo de recepción pierde horas valiosas atendiendo a personas con casos no viables o sin presupuesto.`;
      bullets = [
        '1. Atención y Triaje Inmediato en 5 Segundos (24/7): Atiende día y noche en español e inglés a cada persona interesada.',
        '2. Filtro de Viabilidad de Caso con IA: Identifica el estatus migratorio, tipo de alivio legal buscado y capacidad económica antes de derivar.',
        '3. Entrega de Consultas Agendadas: Deriva a sus paralegales o abogados únicamente los expedientes precalificados listos para pagar la consulta.',
        '4. Conexión Oficial Meta Cloud API: Cero riesgo de baneo (sin extensiones piratas de Chrome ni bots no autorizados).'
      ];
    } else if (isClinic) {
      subject = `Infraestructura Comercial & Agendamiento 24/7 en WhatsApp para ${companyName}`;
      introParagraph = `Les escribe Kenneth Herrera, fundador de The Quant Partners, en seguimiento a nuestra comunicación por WhatsApp y a su solicitud de compartirles información por correo oficial.`;
      nicheParagraph = `En clínicas y centros estéticos notamos que muchas veces se pierde hasta el 70% de las consultas de potenciales pacientes que escriben por anuncios o redes, simplemente porque tardan minutos en contestarles o sus coordinadoras pierden horas respondiendo dudas básicas a curiosos sin intención real de agendar.`;
      bullets = [
        '1. Respuesta Instantánea en 5 Segundos (24/7): Atiende a los pacientes al instante, evitando que consulten con otra clínica.',
        '2. Triaje y Calificación de Procedimientos con IA: Perfila el interés real, zona a tratar y presupuesto.',
        '3. Agenda Directa con Depósito: Entrega a su equipo pacientes listos para confirmar su cita de valoración.',
        '4. Optimización CAPI con Meta Ads: Retroalimenta a Meta con los agendamientos reales para abaratar el costo por paciente.'
      ];
    } else {
      subject = `Infraestructura Comercial & Filtrado de Prospectos en WhatsApp para ${companyName}`;
      introParagraph = `Les escribe Kenneth Herrera, fundador de The Quant Partners, en seguimiento a nuestra comunicación por WhatsApp y a su solicitud de compartirles información por correo oficial.`;
      nicheParagraph = `Revisando empresas de su sector, notamos que el principal cuello de botella comercial al invertir en anuncios o recibir tráfico no es la falta de interesados, sino la velocidad de respuesta y el tiempo que los asesores pierden atendiendo preguntones sin presupuesto.`;
      bullets = [
        '1. Atención Inmediata en 5 Segundos (24/7): Respuestas naturales y sin demoras en todo momento.',
        '2. Filtrado Inteligente de Curiosos: Separa a los preguntones de los compradores reales antes de pasarlos a su equipo.',
        '3. Operación 100% Nativa en WhatsApp: Sin apps complicadas ni curvas de aprendizaje.',
        '4. Conexión Empresarial Oficial Meta Cloud API: Blindaje total anti-baneo y sincronización de conversiones.'
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