import { EmailCampaignLead } from '../types/index.js';

export interface GeneratedColdEmail {
  subject: string;
  variant: 'A' | 'B' | 'C';
  text: string;
  html: string;
}

export class ColdEmailGenerator {
  /**
   * Identifica si el prospecto pertenece a una Software Factory, Dev Shop, Startup o Agencia de Tecnología
   */
  public static isDevContractorLead(lead: EmailCampaignLead): boolean {
    const ind = (lead.industry || '').toLowerCase();
    const src = (lead.source || '').toLowerCase();
    const title = (lead.title || '').toLowerCase();
    const company = (lead.companyName || '').toLowerCase();
    return (
      ind.includes('software') || 
      ind.includes('tech') || 
      ind.includes('dev') || 
      src.includes('dev_contractor') ||
      src.includes('software_agency') ||
      title.includes('cto') ||
      title.includes('ceo') ||
      title.includes('founder') ||
      title.includes('engineering') ||
      title.includes('tecnología') ||
      company.includes('software') ||
      company.includes('tech') ||
      company.includes('labs') ||
      company.includes('apps') ||
      company.includes('studio') ||
      company.includes('dev')
    );
  }

  /**
   * Genera el saludo personalizado analizando si es sector médico/clínica, dev contractor o corporativo
   */
  public static getSalutation(lead: EmailCampaignLead): string {
    const isDev = this.isDevContractorLead(lead);
    const isClinicOrHealth = 
      (lead.industry && /cl[ií]nic|odont|salud|m[eé]dic|est[eé]tic|medspa|dermatol|cirug/i.test(lead.industry)) ||
      (lead.title && /doctor|m[eé]dico|cirujano|dr\b/i.test(lead.title)) ||
      /cl[ií]nic|dental|odont|medspa/i.test(lead.companyName);

    if (lead.firstName && lead.firstName.trim().length > 1) {
      const cleanFirst = lead.firstName.trim();
      if (isClinicOrHealth) return `Estimado/a Dr./Dra. ${cleanFirst},`;
      return `Estimado/a ${cleanFirst},`;
    }

    if (lead.contactName && lead.contactName.trim().length > 1 && !lead.contactName.toLowerCase().includes('equipo')) {
      const parts = lead.contactName.trim().split(' ');
      const first = parts[0];
      if (isClinicOrHealth) return `Estimado/a Dr./Dra. ${first},`;
      return `Estimado/a ${first},`;
    }

    if (isDev) {
      return `Estimado equipo de ${lead.companyName},`;
    }

    if (isClinicOrHealth) {
      return `Estimado/a Director/a Médico/a de ${lead.companyName},`;
    }

    return `Estimado/a Director/a de ${lead.companyName},`;
  }

  /**
   * Genera el asunto rotado (A/B/C) con los reemplazos dinámicos
   */
  public static getSubject(lead: EmailCampaignLead, variant: 'A' | 'B' | 'C'): string {
    const company = lead.companyName;
    const name = lead.firstName || (lead.contactName ? lead.contactName.split(' ')[0] : 'Director');
    const isDev = this.isDevContractorLead(lead);

    if (isDev) {
      switch (variant) {
        case 'A':
          return `Disponibilidad inmediata: Dev Full-Stack & Agentes de IA (Desde $1k/mes) — Kenneth Herrera`;
        case 'B':
          return `${company} + Refuerzo Técnico Full-Stack & Agentes de IA ($1k/mes)`;
        case 'C':
          return `Apoyo técnico remoto: Full-Stack / Agentes de IA en Node.js — Kenneth Herrera`;
        default:
          return `Disponibilidad inmediata: Dev Full-Stack & Agentes de IA (Desde $1k/mes) — Kenneth Herrera`;
      }
    }

    switch (variant) {
      case 'A':
        return `consulta sobre los anuncios de ${company}`;
      case 'B':
        return `${name}, una consulta sobre su pauta activa`;
      case 'C':
        return `${company} + flujo de WhatsApp en Meta`;
      default:
        return `consulta sobre los anuncios de ${company}`;
    }
  }

  /**
   * Genera el correo completo (HTML y Texto Plano) listo para despachar
   */
  public static generate(lead: EmailCampaignLead, variant: 'A' | 'B' | 'C'): GeneratedColdEmail {
    const salutation = this.getSalutation(lead);
    const subject = this.getSubject(lead, variant);
    const company = lead.companyName;
    const isUSA = (lead.countryCode || '').toUpperCase() === 'US';

    // 1. Plantilla Especializada: Reclutamiento Contractor Remoto (Software Factories, Dev Shops, Startups)
    if (this.isDevContractorLead(lead)) {
      const cvUrl = 'https://gateway.thequantpartners.com/cv/Kenneth_Herrera_CV.pdf';
      const devText = `${salutation}

Un gusto saludarlos. Les escribe Kenneth Herrera.

Sigo con mucho interés las soluciones de software y plataformas que desarrollan en ${company}.

Les escribo directamente porque sé que en el ritmo de entrega de una agencia o consultora siempre se requiere sumar talento técnico resolutivo que pueda integrarse de inmediato a picar código, resolver requerimientos del backlog y desplegar a producción sin requerir largas semanas de inducción.

Soy desarrollador Full-Stack en TypeScript, Node.js y React/Next.js, especializado en arquitectura e integración de Agentes de Inteligencia Artificial en entornos de producción. Recientemente construí y desplegué QP Outreach Engine, una plataforma multi-agente que opera 24/7 en servidores Linux en la nube:
• Repositorio en GitHub: https://github.com/thequantpartners/qp-outreach-engine
• Paquete publicado en npm: https://www.npmjs.com/package/@quantpartners/pca
• Panel en vivo: https://gateway.thequantpartners.com/dashboard (PIN: KennethQP#2026)
• CV Digital descargable: ${cvUrl}

Cuento con disponibilidad inmediata para incorporarme como desarrollador remoto bajo modalidad contractor, con una tarifa desde $1,000 USD al mes.

Adjunto mi CV en PDF con el desglose de tecnologías y experiencia.

¿Tendrían 10 minutos esta semana para una breve videollamada y ver en qué proyectos de su cartera les vendría bien un refuerzo técnico de inmediato?

Muchas gracias por su tiempo y consideración.

Saludos cordiales,

Kenneth Herrera
Full-Stack & AI Systems Engineer
WhatsApp: +51 902 105 668 | hkennethz1997@gmail.com
partners@thequantpartners.com
Lima, Perú (UTC-5)`;

      const devHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${subject}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f8fafc; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; -webkit-font-smoothing: antialiased;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding: 24px 12px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 640px; background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 8px; padding: 32px 36px; text-align: left; box-shadow: 0 1px 3px rgba(0,0,0,0.04);">
          <tr>
            <td>
              <p style="font-size: 15px; color: #1e293b; margin: 0 0 16px 0; font-weight: 500;">
                ${salutation}
              </p>

              <p style="font-size: 14.5px; line-height: 1.65; color: #334155; margin: 0 0 16px 0;">
                Un gusto saludarlos. Les escribe <strong>Kenneth Herrera</strong>.
              </p>

              <p style="font-size: 14.5px; line-height: 1.65; color: #334155; margin: 0 0 16px 0;">
                Sigo con mucho interés las soluciones de software y plataformas digitales que desarrollan en <strong>${company}</strong>.
              </p>

              <p style="font-size: 14.5px; line-height: 1.65; color: #334155; margin: 0 0 16px 0;">
                Les escribo directamente porque sé que en el ritmo de entrega de una software factory o consultora siempre se requiere sumar talento técnico resolutivo que pueda integrarse de inmediato a picar código, resolver requerimientos del backlog y desplegar a producción sin requerir semanas de inducción.
              </p>

              <p style="font-size: 14.5px; line-height: 1.65; color: #334155; margin: 0 0 16px 0;">
                Soy desarrollador Full-Stack en <strong>TypeScript, Node.js y React/Next.js</strong>, especializado en arquitectura e integración de <strong>Agentes de Inteligencia Artificial</strong> en producción. Recientemente construí y desplegué en la nube <em>QP Outreach Engine</em>, una plataforma multi-agente que opera 24/7 en servidores Linux:
              </p>

              <ul style="margin: 0 0 20px 0; padding-left: 20px; color: #334155; font-size: 14px; line-height: 1.7;">
                <li style="margin-bottom: 6px;">
                  💻 <strong>Repositorio en GitHub:</strong> <a href="https://github.com/thequantpartners/qp-outreach-engine" style="color: #2563eb; text-decoration: none; font-weight: 500;">github.com/thequantpartners/qp-outreach-engine</a>
                </li>
                <li style="margin-bottom: 6px;">
                  📦 <strong>Paquete publicado en npm:</strong> <a href="https://www.npmjs.com/package/@quantpartners/pca" style="color: #2563eb; text-decoration: none; font-weight: 500;">npmjs.com/package/@quantpartners/pca</a>
                </li>
                <li style="margin-bottom: 6px;">
                  🚀 <strong>Panel en vivo:</strong> <a href="https://gateway.thequantpartners.com/dashboard" style="color: #2563eb; text-decoration: none; font-weight: 500;">gateway.thequantpartners.com/dashboard</a> <span style="color: #64748b; font-size: 12.5px;">(PIN: <code>KennethQP#2026</code>)</span>
                </li>
                <li style="margin-bottom: 6px;">
                  📄 <strong>CV Digital (Descarga directa):</strong> <a href="${cvUrl}" style="color: #2563eb; text-decoration: none; font-weight: 500;">Descargar CV en PDF</a>
                </li>
              </ul>

              <blockquote style="margin: 20px 0; padding: 12px 18px; border-left: 3px solid #2563eb; background-color: #f1f5f9; border-radius: 0 6px 6px 0; color: #1e293b; font-size: 14px; line-height: 1.6;">
                Cuento con <strong>disponibilidad inmediata</strong> para incorporarme como desarrollador remoto bajo modalidad contractor, con una tarifa <strong>desde $1,000 USD al mes</strong>.
              </blockquote>

              <p style="font-size: 14.5px; line-height: 1.65; color: #334155; margin: 0 0 16px 0;">
                Adjunto también a este correo mi CV detallado en PDF con la ficha técnica de mis proyectos y experiencia.
              </p>

              <p style="font-size: 14.5px; line-height: 1.65; color: #0f172a; margin: 20px 0 16px 0; font-weight: 600;">
                ¿Tendrían 10 minutos esta semana para una breve llamada y ver en qué proyectos de su cartera les vendría bien un refuerzo técnico de inmediato?
              </p>

              <p style="font-size: 14.5px; line-height: 1.65; color: #334155; margin: 0 0 28px 0;">
                Muchas gracias por su tiempo y consideración.
              </p>

              <table cellpadding="0" cellspacing="0" style="border-top: 1px solid #e2e8f0; padding-top: 18px; width: 100%; font-size: 13.5px; line-height: 1.5;">
                <tr>
                  <td>
                    <strong style="color: #0f172a; font-size: 15px;">Kenneth Herrera</strong><br>
                    <span style="color: #334155; font-weight: 500;">Full-Stack & AI Systems Engineer</span><br>
                    <span style="color: #64748b;">WhatsApp / Tel: <a href="https://wa.me/51902105668" style="color: #2563eb; text-decoration: none;">+51 902 105 668</a></span><br>
                    <a href="mailto:hkennethz1997@gmail.com" style="color: #2563eb; text-decoration: none;">hkennethz1997@gmail.com</a> | <a href="mailto:partners@thequantpartners.com" style="color: #2563eb; text-decoration: none;">partners@thequantpartners.com</a><br>
                    <span style="color: #64748b; font-size: 13px;">Lima, Perú (UTC-5 · Overlap con US ET/CT)</span>
                  </td>
                </tr>
              </table>

            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
      `.trim();

      return { subject, variant, text: devText, html: devHtml };
    }

    const locationContext = isUSA
      ? 'identificamos que mantienen campañas activas en Meta Ads orientadas al mercado hispano en EE.UU.'
      : 'identificamos que en su organización mantienen actualmente campañas activas en Meta Ads para captación por WhatsApp.';

    const locationContextHtml = isUSA
      ? 'identificamos que mantienen <strong>campañas activas en Meta Ads</strong> orientadas al mercado hispano en EE.UU.'
      : `identificamos que en ${company} mantienen actualmente <strong>campañas activas en Meta Ads</strong> para captación por WhatsApp.`;

    // Texto plano
    const text = `${salutation}

Le escribe Kenneth Herrera, director de The Quant Partners en Lima.

Nos comunicamos directamente con usted porque ${locationContext}

> Al invertir en pauta digital, el principal desafío operativo no suele estar en el anuncio, sino en la fricción del canal: prospectos que escriben fuera de horario comercial, demoras de atención de más de 15 minutos y consultas que se quedan en "visto".

Para eliminar este cuello de botella, en The Quant Partners implementamos una infraestructura comercial conectada directamente a sus anuncios mediante 4 agentes que operan en paralelo:

• Atención y Calificación 24/7 (5 segundos): Recepción inmediata día y noche, precalificando presupuesto e intención real de compra.
• Seguimiento anti-ghosting: Recontacto automático e inteligente a prospectos que no contestan, recuperando hasta el 40% de las conversaciones frías.
• Agendamiento y Sincronización: Entrega a su equipo comercial únicamente citas confirmadas y listas para pagar.
• Prospección Activa Complementaria: Mapeo continuo de nuevos tomadores de decisión en su sector para no depender al 100% del costo de la pauta.

¿Le interesaría ver cómo operaría esta infraestructura comercial con los anuncios actuales de ${company}?

Quedo a su disposición.

Atentamente,

Kenneth Herrera
Director | The Quant Partners
partners@thequantpartners.com
Lima, Perú`;

    // HTML corporativo de alta gama
    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${subject}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f8fafc; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; -webkit-font-smoothing: antialiased;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding: 24px 12px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 620px; background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 8px; padding: 32px 36px; text-align: left; box-shadow: 0 1px 3px rgba(0,0,0,0.04);">
          <tr>
            <td>
              <p style="font-size: 15px; color: #1e293b; margin: 0 0 16px 0; font-weight: 500;">
                ${salutation}
              </p>

              <p style="font-size: 14.5px; line-height: 1.65; color: #334155; margin: 0 0 16px 0;">
                Le escribe Kenneth Herrera, director de The Quant Partners en Lima.
              </p>

              <p style="font-size: 14.5px; line-height: 1.65; color: #334155; margin: 0 0 16px 0;">
                Nos comunicamos directamente con usted porque ${locationContextHtml}
              </p>

              <!-- Bloque con Sangría / Indentación Destacada -->
              <blockquote style="margin: 20px 0; padding: 12px 18px; border-left: 3px solid #0f172a; background-color: #f1f5f9; border-radius: 0 6px 6px 0; font-style: italic; color: #1e293b; font-size: 14px; line-height: 1.6;">
                &ldquo;Al invertir en pauta digital, el principal desafío operativo no suele estar en el anuncio, sino en la fricción del canal: prospectos que escriben fuera de horario comercial, demoras de atención de más de 15 minutos y consultas que se quedan en &lsquo;visto&rsquo;.&rdquo;
              </blockquote>

              <p style="font-size: 14.5px; line-height: 1.65; color: #334155; margin: 16px 0 12px 0;">
                Para eliminar este cuello de botella, en The Quant Partners <strong>implementamos una infraestructura comercial</strong> conectada directamente a sus anuncios mediante 4 agentes que operan en paralelo:
              </p>

              <!-- Bullet points de los 4 Agentes -->
              <ul style="margin: 0 0 20px 0; padding-left: 20px; color: #334155; font-size: 14px; line-height: 1.65;">
                <li style="margin-bottom: 8px;">
                  <strong>Atención y Calificación 24/7 (5 segundos):</strong> Recepción inmediata día y noche, precalificando presupuesto e intención real de compra.
                </li>
                <li style="margin-bottom: 8px;">
                  <strong>Seguimiento <em>anti-ghosting</em>:</strong> Recontacto automático e inteligente a prospectos que no contestan, recuperando hasta el 40% de las conversaciones frías.
                </li>
                <li style="margin-bottom: 8px;">
                  <strong>Agendamiento y Sincronización:</strong> Entrega a su equipo comercial únicamente <strong>citas confirmadas y listas para pagar</strong>.
                </li>
                <li style="margin-bottom: 8px;">
                  <strong>Prospección Activa Complementaria:</strong> Mapeo continuo de nuevos tomadores de decisión en su sector para no depender al 100% del costo de la pauta.
                </li>
              </ul>

              <!-- CTA B -->
              <p style="font-size: 14.5px; line-height: 1.65; color: #0f172a; margin: 20px 0 16px 0; font-weight: 600;">
                ¿Le interesaría ver cómo operaría esta infraestructura comercial con los anuncios actuales de ${company}?
              </p>

              <p style="font-size: 14.5px; line-height: 1.65; color: #334155; margin: 0 0 28px 0;">
                Quedo a su disposición.
              </p>

              <!-- Firma Oficial -->
              <table cellpadding="0" cellspacing="0" style="border-top: 1px solid #e2e8f0; padding-top: 18px; width: 100%; font-size: 13.5px; line-height: 1.5;">
                <tr>
                  <td>
                    <strong style="color: #0f172a; font-size: 15px;">Kenneth Herrera</strong><br>
                    <span style="color: #334155;">Director | The Quant Partners</span><br>
                    <a href="mailto:partners@thequantpartners.com" style="color: #2563eb; text-decoration: none;">partners@thequantpartners.com</a><br>
                    <span style="color: #64748b; font-size: 13px;">Lima, Perú</span>
                  </td>
                </tr>
              </table>

            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
    `.trim();

    return { subject, variant, text, html };
  }
}
