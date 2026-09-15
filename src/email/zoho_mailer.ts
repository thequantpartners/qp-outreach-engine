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

  public static getTransporter(): Transporter {
    if (this.transporter) return this.transporter;

    const user = process.env.ZOHO_MAIL_USER;
    const pass = process.env.ZOHO_MAIL_PASS;
    const host = process.env.ZOHO_MAIL_HOST || 'smtp.zoho.com';
    const port = parseInt(process.env.ZOHO_MAIL_PORT || '465', 10);

    if (!user || !pass) {
      throw new Error('Faltan configurar ZOHO_MAIL_USER y ZOHO_MAIL_PASS en las variables de entorno (.env).');
    }

    this.transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: {
        user,
        pass
      }
    });

    return this.transporter;
  }

  public static async verifyConnection(): Promise<boolean> {
    try {
      const transporter = this.getTransporter();
      await transporter.verify();
      return true;
    } catch (err: any) {
      console.error('[ZohoMailer] Error verificando conexión SMTP:', err.message);
      return false;
    }
  }

  public static async sendEmail(opts: SendEmailOptions): Promise<SendEmailResult> {
    try {
      const transporter = this.getTransporter();
      const user = process.env.ZOHO_MAIL_USER!;
      const fromName = opts.fromName || 'Kenneth Herrera · The Quant Partners';

      const info = await transporter.sendMail({
        from: `"${fromName}" <${user}>`,
        to: opts.to,
        subject: opts.subject,
        text: opts.text,
        html: opts.html,
        replyTo: opts.replyTo || user,
        cc: opts.cc,
        bcc: opts.bcc
      });

      console.log(`[ZohoMailer] Correo enviado exitosamente a ${opts.to}. MessageId: ${info.messageId}`);
      return {
        success: true,
        messageId: info.messageId
      };
    } catch (err: any) {
      console.error('[ZohoMailer] Error al enviar correo:', err.message);
      return {
        success: false,
        error: err.message
      };
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