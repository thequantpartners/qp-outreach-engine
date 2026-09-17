import dotenv from 'dotenv';
import { ZohoMailer } from '../src/email/zoho_mailer.js';

dotenv.config();

async function main() {
  console.log('--- Verificando conexión SMTP con Zoho Mail ---');
  const isConnected = await ZohoMailer.verifyConnection();
  if (!isConnected) {
    console.error('❌ Error conectando a Zoho Mail SMTP.');
    process.exit(1);
  }
  console.log('✅ Conexión SMTP exitosa con Zoho Mail (partners@thequantpartners.com)');

  const targetEmail = 'burn.acount97@gmail.com';
  const companyName = 'OdontoSalud Especialistas';
  const recipientName = 'Director General';

  const subject = `Sobre la pauta activa de ${companyName} en Meta`;

  const textBody = `Estimado/a ${recipientName},

Le escribe Kenneth Herrera, director de The Quant Partners en Lima.

Nos comunicamos directamente con usted porque identificamos que en ${companyName} mantienen actualmente campañas activas en Meta Ads para captación por WhatsApp.

> Al invertir en pauta digital, el principal desafío operativo no suele estar en el anuncio, sino en la fricción del canal: prospectos que escriben fuera de horario comercial, demoras de atención de más de 15 minutos y consultas que se quedan en "visto".

Para eliminar este cuello de botella, en The Quant Partners implementamos una infraestructura comercial conectada directamente a sus anuncios mediante 4 agentes que operan en paralelo:

• Atención y Calificación 24/7 (5 segundos): Recepción inmediata día y noche, precalificando presupuesto e intención real de compra.
• Seguimiento anti-ghosting: Recontacto automático e inteligente a prospectos que no contestan, recuperando hasta el 40% de las conversaciones frías.
• Agendamiento y Sincronización: Entrega a su equipo comercial únicamente citas confirmadas y listas para pagar.
• Prospección Activa Complementaria: Mapeo continuo de nuevos tomadores de decisión en su sector para no depender al 100% del costo de la pauta.

¿Le interesaría ver cómo operaría esta infraestructura comercial con los anuncios actuales de ${companyName}?

Quedo a su disposición.

Atentamente,

Kenneth Herrera
Director | The Quant Partners
partners@thequantpartners.com
Lima, Perú`;

  const htmlBody = `
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
                Estimado/a ${recipientName},
              </p>

              <p style="font-size: 14.5px; line-height: 1.65; color: #334155; margin: 0 0 16px 0;">
                Le escribe Kenneth Herrera, director de The Quant Partners en Lima.
              </p>

              <p style="font-size: 14.5px; line-height: 1.65; color: #334155; margin: 0 0 16px 0;">
                Nos comunicamos directamente con usted porque identificamos que en ${companyName} mantienen actualmente <strong>campañas activas en Meta Ads</strong> para captación por WhatsApp.
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
                ¿Le interesaría ver cómo operaría esta infraestructura comercial con los anuncios actuales de ${companyName}?
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

  console.log(`--- Enviando correo de prueba a ${targetEmail} ---`);
  const result = await ZohoMailer.sendEmail({
    to: targetEmail,
    subject,
    text: textBody,
    html: htmlBody,
    fromName: 'Kenneth Herrera · The Quant Partners'
  });

  if (result.success) {
    console.log('🎉 Correo enviado exitosamente!');
    console.log('ID del mensaje:', result.messageId);
  } else {
    console.error('❌ Falló el envío:', result.error);
  }
}

main().catch(err => {
  console.error('Error fatal:', err);
  process.exit(1);
});
