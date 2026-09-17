import { ShalomNativeClient } from './shalom_native_client.js';
import { ShalomAgenciesCatalog } from './shalom_agencies.js';
import { OutreachRepo } from '../db/repo.js';

export class ShalomChatOnboarding {
  private static failedAttempts = new Map<string, number>();

  /**
   * Procesa mensajes entrantes en WhatsApp durante la etapa de onboarding del cliente
   */
  public static async handleOnboardingMessage(
    senderPhone: string,
    text: string
  ): Promise<{ handled: boolean; reply?: string; alertKenneth?: string }> {
    const cleanPhone = senderPhone.replace(/[^0-9]/g, '');
    const cleanText = text.trim();

    // 1. Detección de comando de setup manual: /setup-shalom <email> <password> <agencia>
    if (cleanText.toLowerCase().startsWith('/setup-shalom')) {
      const parts = cleanText.split(/\s+/).slice(1);
      if (parts.length < 2) {
        return {
          handled: true,
          reply: '⚠️ Formato: /setup-shalom <email> <password> [agencia_origen]'
        };
      }
      const email = parts[0];
      const password = parts[1];
      const agencyQuery = parts.slice(2).join(' ') || 'Gamarra';

      return await this.executeHandshakeAndSave(cleanPhone, email, password, agencyQuery);
    }

    // 2. Detección heurística de credenciales en lenguaje natural (ej. "mi usuario es X, clave Y, despacho en Gamarra")
    const emailMatch = cleanText.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
    if (!emailMatch) {
      return { handled: false };
    }

    const email = emailMatch[0];

    // Extraer contraseña aproximada buscando palabras clave como clave, pass, password, contraseña
    let password = '';
    const passKeywords = /(?:clave|pass|password|contraseña)[:=\s]+([^\s,;]+)/i;
    const passMatch = cleanText.match(passKeywords);
    if (passMatch && passMatch[1]) {
      password = passMatch[1].trim();
    } else {
      // Si no hay palabra clave, buscar el token adyacente o siguiente palabra larga
      const tokens = cleanText.split(/\s+/).filter(t => t !== email && t.length >= 4);
      if (tokens.length > 0) {
        password = tokens[0];
      }
    }

    if (!password) {
      return {
        handled: true,
        reply: '⚠️ Detectamos tu correo pero no pudimos identificar tu contraseña. Por favor envíala en este formato:\n\n*Usuario:* tu_correo@gmail.com\n*Clave:* tu_password\n*Agencia:* Gamarra'
      };
    }

    // Extraer agencia mencionada
    let agencyQuery = 'Gamarra';
    for (const popular of ['gamarra', 'grau', 'san isidro', 'miraflores', 'arequipa', 'trujillo', 'cusco', 'los olivos', 'ate']) {
      if (cleanText.toLowerCase().includes(popular)) {
        agencyQuery = popular;
        break;
      }
    }

    return await this.executeHandshakeAndSave(cleanPhone, email, password, agencyQuery);
  }

  /**
   * Genera el mensaje de bienvenida y solicitud de credenciales de Shalom para el onboarding conversacional
   */
  public static getOnboardingWelcomeMessage(companyName?: string): string {
    const name = companyName || 'amigo(a)';
    return (
      `🎉 *¡Bienvenido(a) a The Quant Partners, ${name}!* 🚀\n\n` +
      `Tu pago ha sido verificado con éxito y tu asistente de Live Shopping ya está casi listo.\n\n` +
      `📦 *Paso Final de Conexión con Shalom Pro:*\n` +
      `Para que el bot pueda emitir tus guías de envío automáticamente a todo el Perú, por favor compártenos tus datos de acceso en este formato:\n\n` +
      `*Usuario:* tu_correo_en_shalom@gmail.com\n` +
      `*Clave:* tu_password_de_shalom\n` +
      `*Agencia Origen:* Gamarra (o la agencia desde donde despachas tus paquetes)\n\n` +
      `_Nota: También puedes escribir directamente:_\n` +
      `\`/setup-shalom correo@ejemplo.com tu_clave Gamarra\`\n\n` +
      `¡Cualquier duda, estamos aquí para asistirte! 🙌`
    );
  }

  /**
   * Ejecuta el handshake contra Shalom Pro, guarda la configuración y emite alertas
   */
  private static async executeHandshakeAndSave(
    phone: string,
    email: string,
    password: string,
    agencyQuery: string
  ): Promise<{ handled: boolean; reply: string; alertKenneth?: string }> {
    const attempts = (this.failedAttempts.get(phone) || 0) + 1;

    try {
      // 1. Probar handshake en vivo contra pro.shalom.pe
      await ShalomNativeClient.authenticate({ email, password });

      // 2. Resolver agencia de origen óptima
      const originAgency = ShalomAgenciesCatalog.findBestMatch(agencyQuery);

      // 3. Resetear contador de fallos
      this.failedAttempts.delete(phone);

      // 4. Persistir configuración en PostgreSQL
      try {
        const settings = await OutreachRepo.getSettings();
        await OutreachRepo.updateSettings({
          ...settings,
          adminWhatsAppPhone: phone,
          shalomCredentials: {
            email,
            password,
            originAgencyId: originAgency.id,
            originAgencyName: originAgency.name
          }
        });

        // Marcar lead como configurado
        const lead = await OutreachRepo.getLeadByPhone(phone);
        if (lead) {
          await OutreachRepo.updateLeadCustomFields(phone, {
            shalomConnected: true,
            shalomEmail: email,
            shalomAgency: originAgency.name,
            shalomAgencyId: originAgency.id,
            onboardingCompletedAt: new Date().toISOString()
          });
        }
      } catch (dbErr: any) {
        console.warn('[ShalomChatOnboarding] No se pudo actualizar settings en DB:', dbErr.message);
      }

      const reply = 
        `✅ *¡Conexión con Shalom Pro exitosa!*\n\n` +
        `• *Cuenta conectada:* ${email}\n` +
        `• *Agencia de origen:* ${originAgency.name}\n` +
        `• *Dirección:* ${originAgency.address}\n\n` +
        `Tu asistente de Live Shopping ya está activo. Cuando tus compradores confirmen sus pagos, solo responde */guia* en el chat para emitir la orden en Shalom automáticamente 📦🚀.`;

      const alertKenneth = 
        `🚀 *ONBOARDING EXITOSO - TIENDA CONECTADA A SHALOM*\n\n` +
        `• Teléfono: ${phone}\n` +
        `• Cuenta Shalom: ${email}\n` +
        `• Agencia Origen: ${originAgency.name}\n` +
        `• Estado: Operación 100% activa`;

      return { handled: true, reply, alertKenneth };

    } catch (err: any) {
      this.failedAttempts.set(phone, attempts);

      if (attempts >= 2) {
        // Activar Human Takeover tras 2 fallos consecutivos
        const reply = 
          `Hola 🙌, estuvimos revisando pero no logramos validar las credenciales en Shalom Pro tras 2 intentos. ` +
          `Te comunicamos en un instante con Kenneth para darte soporte directo y ayudarte a dejarlo conectado 🤝.`;

        const alertKenneth = 
          `🚨 *ALERTA ONBOARDING SHALOM: 2 INTENTOS FALLIDOS*\n\n` +
          `• Teléfono: ${phone}\n` +
          `• Correo probado: ${email}\n` +
          `• Error: ${err.message}\n` +
          `• Acción: Se activó Human Takeover para tu asistencia directa.`;

        return { handled: true, reply, alertKenneth };
      }

      const reply = 
        `⚠️ *No pudimos ingresar a Shalom Pro con esa contraseña.*\n\n` +
        `Por favor verifica que no haya errores de tipeo ni mayúsculas/minúsculas invertidas, y vuelve a enviarla en este formato:\n\n` +
        `*Usuario:* ${email}\n*Clave:* tu_password_correcto\n*Agencia:* Gamarra`;

      return { handled: true, reply };
    }
  }
}
