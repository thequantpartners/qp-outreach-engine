import nodemailer, { Transporter } from 'nodemailer';
import dotenv from 'dotenv';

dotenv.config();

export interface SendEmailOptions {
  to: string | string[];
  subject: string;
  text?: string;
  html?: string;
  replyTo?: string;
  fromName?: string;
  cc?: string | string[];
  bcc?: string | string[];
}

export interface SendEmailResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

export class ZohoMailer {
  private static transporter: Transporter | null = null;

  public static createTransporter(portToUse: number): Transporter {
    const user = process.env.ZOHO_MAIL_USER;
    const pass = process.env.ZOHO_MAIL_PASS;
    const host = process.env.ZOHO_MAIL_HOST || 'smtp.zoho.com';

    if (!user || !pass) {
      throw new Error('Faltan configurar ZOHO_MAIL_USER y ZOHO_MAIL_PASS en las variables de entorno (.env).');
    }

    return nodemailer.createTransport({
      host,
      port: portToUse,
      secure: portToUse === 465,
      auth: {
        user,
        pass
      },
      connectionTimeout: 12000,
      greetingTimeout: 12000,
      socketTimeout: 18000
    });
  }

  public static getTransporter(): Transporter {
    if (this.transporter) return this.transporter;
    const port = parseInt(process.env.ZOHO_MAIL_PORT || '587', 10);
    this.transporter = this.createTransporter(port);
    return this.transporter;
  }

  public static async verifyConnection(): Promise<boolean> {
    const resendApiKey = process.env.RESEND_API_KEY;
    if (resendApiKey) {
      try {
        const res = await fetch('https://api.resend.com/domains', {
          headers: {
            'Authorization': `Bearer ${resendApiKey.trim()}`
          }
        });
        if (res.ok) {
          console.log('[ZohoMailer/Resend] ✅ Conexión con Resend API verificada exitosamente.');
          return true;
        }
      } catch (err: any) {
        console.warn('[ZohoMailer/Resend] Error verificando API de Resend:', err.message);
      }
    }

    try {
      const transporter = this.getTransporter();
      await transporter.verify();
      return true;
    } catch (err: any) {
      console.warn(`[ZohoMailer] Falló verificación con puerto primario (${err.message}), probando alternativo...`);
      try {
        const primaryPort = parseInt(process.env.ZOHO_MAIL_PORT || '587', 10);
        const altPort = primaryPort === 465 ? 587 : 465;
        const alt = this.createTransporter(altPort);
        await alt.verify();
        this.transporter = alt;
        return true;
      } catch (err2: any) {
        console.error('[ZohoMailer] Error verificando conexión SMTP con ambos puertos:', err2.message);
        return false;
      }
    }
  }

  public static async sendEmail(opts: SendEmailOptions): Promise<SendEmailResult> {
    const user = process.env.ZOHO_MAIL_USER || 'partners@thequantpartners.com';
    const fromName = opts.fromName || 'Kenneth Herrera · The Quant Partners';
    const resendApiKey = process.env.RESEND_API_KEY;

    // 1. Prioridad: Despacho nativo por Resend API sobre HTTPS (Puerto 443) - Cero bloqueos en Cloud
    if (resendApiKey) {
      try {
        const toList = Array.isArray(opts.to) ? opts.to : [opts.to];
        const bodyPayload: any = {
          from: `${fromName} <${user}>`,
          to: toList,
          subject: opts.subject,
          reply_to: opts.replyTo || user
        };
        if (opts.text) bodyPayload.text = opts.text;
        if (opts.html) bodyPayload.html = opts.html;
        if (opts.cc) bodyPayload.cc = Array.isArray(opts.cc) ? opts.cc : [opts.cc];
        if (opts.bcc) bodyPayload.bcc = Array.isArray(opts.bcc) ? opts.bcc : [opts.bcc];

        const res = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${resendApiKey.trim()}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(bodyPayload)
        });

        const data: any = await res.json();
        if (!res.ok) {
          throw new Error(data.message || (data.name ? `${data.name}: ${data.message}` : JSON.stringify(data)));
        }

        console.log(`[ResendMailer] ✅ Correo entregado exitosamente vía Resend API a ${opts.to}. Resend ID: ${data.id}`);
        return {
          success: true,
          messageId: data.id
        };
      } catch (resendErr: any) {
        console.warn(`[ResendMailer] ⚠️ Falló envío vía Resend API (${resendErr.message}). Evaluando fallback SMTP...`);
      }
    }

    // 2. Fallback SMTP (Nodemailer)
    const primaryPort = parseInt(process.env.ZOHO_MAIL_PORT || '587', 10);
    const mailOptions = {
      from: `"${fromName}" <${user}>`,
      to: opts.to,
      subject: opts.subject,
      text: opts.text,
      html: opts.html,
      replyTo: opts.replyTo || user,
      cc: opts.cc,
      bcc: opts.bcc
    };

    try {
      const transporter = this.getTransporter();
      const info = await transporter.sendMail(mailOptions);
      console.log(`[ZohoMailer] Correo enviado exitosamente a ${opts.to} (puerto ${primaryPort}). MessageId: ${info.messageId}`);
      return {
        success: true,
        messageId: info.messageId
      };
    } catch (err: any) {
      const altPort = primaryPort === 465 ? 587 : 465;
      console.warn(`[ZohoMailer] Error enviando correo por puerto ${primaryPort} (${err.message}). Reintentando por puerto alternativo ${altPort}...`);
      try {
        const altTransporter = this.createTransporter(altPort);
        const info = await altTransporter.sendMail(mailOptions);
        console.log(`[ZohoMailer] ✅ Correo enviado exitosamente usando puerto alternativo ${altPort}. MessageId: ${info.messageId}`);
        // Cachear el transporte que sí funcionó
        this.transporter = altTransporter;
        return {
          success: true,
          messageId: info.messageId
        };
      } catch (altErr: any) {
        console.error('[ZohoMailer] Error al enviar correo con ambos puertos:', altErr.message);
        return {
          success: false,
          error: altErr.message
        };
      }
    }
  }

  /**
   * Genera plantilla HTML corporativa con diseño ejecutivo y firma oficial
   */
  public static generateExecutiveHtml(params: {
    recipientTitle: string;
    paragraphs: string[];
    bulletPoints?: string[];
    callToAction?: { text: string; url: string };
    senderName?: string;
    senderRole?: string;
  }): string {
    const senderName = params.senderName || 'Kenneth Herrera';
    const senderRole = params.senderRole || 'Fundador & Director de Tecnología';
    
    const bulletsHtml = params.bulletPoints && params.bulletPoints.length > 0
      ? `<ul style="margin: 16px 0; padding-left: 20px; line-height: 1.6; color: #2d3748;">
          ${params.bulletPoints.map(b => `<li style="margin-bottom: 8px;">${b}</li>`).join('')}
         </ul>`
      : '';

    const ctaHtml = params.callToAction
      ? `<div style="margin: 28px 0; text-align: left;">
          <a href="${params.callToAction.url}" style="background-color: #0f172a; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 14px; display: inline-block;">
            ${params.callToAction.text}
          </a>
         </div>`
      : '';

    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title></title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; color: #1e293b;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding: 24px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px; border: 1px solid #e2e8f0; padding: 36px 40px; text-align: left; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
          <tr>
            <td>
              <p style="font-size: 15px; line-height: 1.6; margin-top: 0; color: #1e293b; font-weight: 600;">
                ${params.recipientTitle},
              </p>
              ${params.paragraphs.map(p => `<p style="font-size: 14.5px; line-height: 1.65; color: #334155; margin: 14px 0;">${p}</p>`).join('')}
              ${bulletsHtml}
              ${ctaHtml}
              <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 28px 0 20px 0;">
              <table cellpadding="0" cellspacing="0" style="font-size: 13.5px; color: #475569; line-height: 1.5;">
                <tr>
                  <td>
                    <strong style="color: #0f172a; font-size: 14.5px;">${senderName}</strong><br>
                    <span>${senderRole}</span><br>
                    <span style="color: #64748b;">The Quant Partners</span><br>
                    <span style="color: #64748b;">WhatsApp / Tel: +51 902 105 668</span><br>
                    <a href="https://thequantpartners.com" style="color: #2563eb; text-decoration: none;">thequantpartners.com</a>
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
  }
}