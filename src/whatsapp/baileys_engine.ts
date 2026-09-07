import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
  WASocket,
  Browsers
} from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import qrcode from 'qrcode-terminal';
import QRCode from 'qrcode';
import pino from 'pino';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { OutreachRepo } from '../db/repo.js';
import { OpenRouterCloser } from '../ai/openrouter_closer.js';

dotenv.config();

export class BaileysEngine {
  private static instance: BaileysEngine | null = null;
  private sock: WASocket | null = null;
  private isReady: boolean = false;
  private isInitializing: boolean = false;
  private latestQr: string | null = null;
  private authDir: string;
  private storageDir: string;

  private constructor() {
    this.storageDir = path.resolve(process.env.STORAGE_DIR || './storage');
    this.authDir = path.join(this.storageDir, 'whatsapp_auth');

    if (!fs.existsSync(this.storageDir)) {
      fs.mkdirSync(this.storageDir, { recursive: true });
    }
  }

  public static getInstance(): BaileysEngine {
    if (!BaileysEngine.instance) {
      BaileysEngine.instance = new BaileysEngine();
    }
    return BaileysEngine.instance;
  }

  /**
   * Inicializa la conexión con WhatsApp mediante Baileys
   */
  public async init(): Promise<void> {
    if (this.sock && this.isReady) return;
    if (this.isInitializing) return;
    this.isInitializing = true;

    try {
      if (this.sock) {
        try {
          this.sock.ev.removeAllListeners('connection.update');
          this.sock.ev.removeAllListeners('creds.update');
          this.sock.ev.removeAllListeners('messages.upsert');
          (this.sock as any).ws?.close();
        } catch {}
        this.sock = null;
      }

      if (!fs.existsSync(this.authDir)) {
        fs.mkdirSync(this.authDir, { recursive: true });
      }

      // Auto-descomprimir backup si existe
      const tarFile = path.join(this.storageDir, 'whatsapp_auth.tar.gz');
      const credsFile = path.join(this.authDir, 'creds.json');

      if (fs.existsSync(tarFile) && !fs.existsSync(credsFile)) {
        try {
          console.log('[BaileysEngine] Descomprimiendo backup desde whatsapp_auth.tar.gz...');
          const { execSync } = await import('child_process');
          execSync(`tar -xzf "${tarFile}" -C "${this.storageDir}"`);
          console.log('✅ [BaileysEngine] Sesión restaurada con éxito desde tar.gz!');
        } catch (err: any) {
          console.error('[BaileysEngine] Error descomprimiendo backup:', err.message);
        }
      }

      const { state, saveCreds } = await useMultiFileAuthState(this.authDir);

      this.sock = makeWASocket({
        auth: state,
        printQRInTerminal: false,
        logger: pino({ level: 'silent' }),
        browser: Browsers.ubuntu('Chrome'),
        syncFullHistory: false,
        markOnlineOnConnect: false
      });

      this.sock.ev.on('creds.update', saveCreds);

      this.sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
          this.latestQr = qr;
          console.log('\n================================================================');
          console.log('📲 QP OUTREACH ENGINE | ESCANEA EL CÓDIGO QR CON WHATSAPP:');
          console.log('================================================================');
          qrcode.generate(qr, { small: true });
          console.log('WhatsApp > Dispositivos vinculados > Vincular dispositivo');
          console.log('================================================================\n');

          try {
            const qrPngPath = path.join(this.storageDir, 'whatsapp_qr.png');
            await QRCode.toFile(qrPngPath, qr, { width: 500, margin: 3 });
            fs.writeFileSync(path.join(this.storageDir, 'whatsapp_qr.txt'), qr);
            console.log(`[BaileysEngine] QR guardado en: ${qrPngPath}`);

            // Copiar al directorio de artefactos si está configurado
            const artifactDir = process.env.ARTIFACT_DIR || 'C:\\Users\\Ken Ryzen\\.gemini\\antigravity\\brain\\4e3ab953-1045-4515-a97e-7a85a74b640c';
            if (fs.existsSync(artifactDir)) {
              fs.copyFileSync(qrPngPath, path.join(artifactDir, 'whatsapp_qr.png'));
            }
          } catch (qrErr: any) {
            console.error('[BaileysEngine] Error guardando QR:', qrErr.message);
          }

          // Alerta externa (Discord / Telegram / Webhook)
          await this.notifyExternalAlert('⚠️ [QP Outreach Engine] WhatsApp requiere vincularse. Escanea el nuevo código QR.');
        }

        if (connection === 'close') {
          const statusCode = (lastDisconnect?.error as Boom)?.output?.statusCode;
          const errorMsg = (lastDisconnect?.error as Error)?.message;
          console.log(`[BaileysEngine] Conexión cerrada. Código: ${statusCode}, Detalle: ${errorMsg}`);
          
          this.isReady = false;
          const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
          
          if (statusCode === DisconnectReason.connectionReplaced || statusCode === 440) {
            console.warn('⚠️ [BaileysEngine] Conexión reemplazada por otra sesión activa en WhatsApp Web. Pausando 30 segundos antes de reintentar...');
            setTimeout(() => this.init(), 30000);
          } else if (shouldReconnect) {
            console.log('[BaileysEngine] Reconectando en 5 segundos...');
            setTimeout(() => this.init(), 5000);
          } else {
            console.warn('⚠️ [BaileysEngine] Sesión cerrada formalmente por el usuario. Escanear nuevo QR.');
            await this.notifyExternalAlert('🚨 [QP Outreach Engine] Sesión cerrada formalmente. Se necesita nuevo QR para operar.');
          }
        } else if (connection === 'open') {
          console.log('✅ [BaileysEngine] WhatsApp Conectado y Listo para Despachar!');
          this.isReady = true;
          this.latestQr = null;

          await this.notifyExternalAlert('✅ [QP Outreach Engine] WhatsApp conectado exitosamente y listo para despachar.');

          // Respaldar sesión en tar.gz en segundo plano
          try {
            const { exec } = await import('child_process');
            exec(`tar -czf "${path.join(this.storageDir, 'whatsapp_auth.tar.gz')}" -C "${this.storageDir}" whatsapp_auth`);
          } catch {
            // Ignorar
          }
        }
      });

      // Configurar escucha de mensajes entrantes (Inbound)
      this.setupInboundListener();

    } finally {
      this.isInitializing = false;
    }
  }

  /**
   * Listener de mensajes entrantes (Baileys Upsert)
   */
  private setupInboundListener(): void {
    if (!this.sock) return;

    this.sock.ev.on('messages.upsert', async ({ messages, type }) => {
      if (type !== 'notify') return;

      for (const m of messages) {
        if (!m.message) continue;

        const remoteJid = m.key.remoteJid || '';

        // Ignorar grupos, transmisiones y estados
        if (
          remoteJid.endsWith('@g.us') ||
          remoteJid === 'status@broadcast' ||
          remoteJid.includes('broadcast')
        ) {
          continue;
        }

        const senderPhone = remoteJid.replace(/@s\.whatsapp\.net/, '').replace(/[^0-9]/g, '');
        if (!senderPhone) continue;

        // Extraer texto del mensaje
        const incomingText =
          m.message.conversation ||
          m.message.extendedTextMessage?.text ||
          m.message.imageMessage?.caption ||
          '';

        if (!incomingText.trim()) continue;

        const settings = await OutreachRepo.getSettings();

        // 1. Mensaje saliente manual enviado desde el teléfono del dueño (fromMe)
        if (m.key.fromMe) {
          // Si Kenneth escribe manualmente a un prospecto desde su teléfono, activar Human Takeover
          const existingLead = await OutreachRepo.getLeadByPhone(senderPhone);
          if (existingLead && senderPhone !== settings.adminWhatsAppPhone) {
            console.log(`[BaileysEngine] Intervención humana detectada en chat con ${senderPhone}. Activando Human Takeover.`);
            await OutreachRepo.updateLeadStatus(senderPhone, 'HUMAN_TAKEOVER', {
              humanTakeoverAt: new Date().toISOString()
            });
            await OutreachRepo.addChatMessage(senderPhone, 'human_agent', incomingText);
          }
          continue;
        }

        // 2. Si el mensaje viene del propio admin (Kenneth) a la cuenta del bot
        if (senderPhone === settings.adminWhatsAppPhone.replace(/[^0-9]/g, '')) {
          console.log(`[BaileysEngine] Mensaje recibido del administrador: "${incomingText}"`);
          // Podría procesar comandos si se desea
          continue;
        }

        console.log(`\n📩 [BaileysEngine] Mensaje entrante de ${senderPhone}: "${incomingText}"`);

        // 3. Buscar o registrar al prospecto
        let lead = await OutreachRepo.getLeadByPhone(senderPhone);
        if (!lead) {
          const activeService = await OutreachRepo.getActiveService();
          await OutreachRepo.saveLeadsFromScraper(activeService?.id || 'custom-service', [{
            title: m.pushName || 'Contacto WhatsApp',
            phone: senderPhone,
            phoneClean: senderPhone
          }]);
          lead = await OutreachRepo.getLeadByPhone(senderPhone);
        }

        if (!lead) continue;

        // 4. Registrar mensaje del usuario en la base de datos y activar Human Takeover (El bot se silencia)
        await OutreachRepo.addChatMessage(senderPhone, 'user', incomingText);
        await OutreachRepo.updateLeadStatus(senderPhone, 'REPLIED', {
          humanTakeoverAt: new Date().toISOString()
        });

        // Transmitir al Dashboard en tiempo real
        try {
          const { broadcastDashboardEvent } = await import('../gateway/server.js');
          broadcastDashboardEvent({
            type: 'new_message',
            phone: senderPhone,
            role: 'user',
            content: incomingText,
            createdAt: new Date().toISOString()
          });
        } catch {}

        // 5. Comprobar si está fuera de horario comercial
        const isWorkingHours = this.isWithinWorkingHours(settings);
        if (!isWorkingHours) {
          // Validar que no hayamos enviado el aviso fuera de hora recientemente (últimas 12h)
          const history = await OutreachRepo.getChatHistory(senderPhone, 5);
          const hasRecentOutOfHours = history.some(
            m => m.role === 'assistant' && 
            m.content.includes('horario de atención') && 
            (Date.now() - new Date(m.createdAt).getTime()) < 12 * 60 * 60 * 1000
          );

          if (!hasRecentOutOfHours) {
            const outOfHoursNotice = 'Buenas noches. Le saluda el equipo de The Quant Partners. Gracias por comunicarse con nosotros. Nuestro horario de atención comercial es de Lunes a Viernes de 8:30 AM a 6:30 PM (Sábados de 9:00 AM a 1:00 PM). Un asesor atenderá su mensaje a primera hora de la jornada. ¡Muchas gracias por escribirnos!';
            const jid = `${senderPhone}@s.whatsapp.net`;
            try {
              await this.sock?.sendMessage(jid, { text: outOfHoursNotice });
              await OutreachRepo.addChatMessage(senderPhone, 'assistant', `[AVISO AUTOMÁTICO - FUERA DE HORARIO]: ${outOfHoursNotice}`);
              console.log(`🌙 [BaileysEngine] Mensaje fuera de horario enviado a ${senderPhone}`);
            } catch (err: any) {
              console.error(`[BaileysEngine] Error enviando mensaje fuera de horario a ${senderPhone}:`, err.message);
            }
          }
        }

        // 6. Notificar inmediatamente a Kenneth a su WhatsApp con sugerencias de QPartner
        const alertMsg = 
          `🚨 *NUEVO MENSAJE DE PROSPECTO (Atención en Dashboard)*\n\n` +
          `🏢 Empresa: *${lead.companyName || 'Contacto WhatsApp'}*\n` +
          `📱 Teléfono: *+${senderPhone}*\n` +
          `💬 Mensaje: "${incomingText}"\n\n` +
          `💡 *QPartner Co-Pilot* ha generado 3 sugerencias tácticas en tu Dashboard para responder con 1 clic:\n` +
          `👉 http://localhost:3100/dashboard`;

        await this.notifyAdmin(alertMsg);
      }
    });
  }

  /**
   * Envía un mensaje individual con validación previa de número
   */
  public async send(telefono: string, mensaje: string): Promise<{ success: boolean; jid?: string; error?: string }> {
    if (!this.sock || !this.isReady) {
      return { success: false, error: 'WhatsApp no está conectado o autenticado.' };
    }

    try {
      const limpio = telefono.replace(/[^0-9]/g, '');
      const jid = `${limpio}@s.whatsapp.net`;

      // Verificar si el contacto existe en WhatsApp
      try {
        const results = await this.sock.onWhatsApp(jid);
        const onWa = results?.[0];
        if (!onWa || !onWa.exists) {
          return { success: false, error: `El número ${limpio} no está registrado en WhatsApp.` };
        }
      } catch (err: any) {
        console.warn(`[BaileysEngine] Advertencia en check onWhatsApp para ${limpio}:`, err.message);
      }

      console.log(`[BaileysEngine] Enviando mensaje a ${limpio}...`);
      await this.sock.sendMessage(jid, { text: mensaje });
      console.log(`✅ [BaileysEngine] Mensaje entregado a ${limpio}!`);
      return { success: true, jid };
    } catch (err: any) {
      console.error(`❌ [BaileysEngine] Error enviando a ${telefono}:`, err.message);
      return { success: false, error: err.message };
    }
  }

  /**
   * Envía un documento PDF o archivo nativo por WhatsApp
   */
  public async sendDocument(
    telefono: string,
    filePathOrUrl: string,
    fileName: string,
    caption?: string
  ): Promise<{ success: boolean; jid?: string; error?: string }> {
    if (!this.sock || !this.isReady) {
      return { success: false, error: 'WhatsApp no está conectado o autenticado.' };
    }

    try {
      const limpio = telefono.replace(/[^0-9]/g, '');
      const jid = `${limpio}@s.whatsapp.net`;

      let fileBuffer: Buffer;
      if (filePathOrUrl.startsWith('http://') || filePathOrUrl.startsWith('https://')) {
        const resp = await fetch(filePathOrUrl);
        const arrayBuf = await resp.arrayBuffer();
        fileBuffer = Buffer.from(arrayBuf);
      } else {
        const resolvedPath = path.isAbsolute(filePathOrUrl)
          ? filePathOrUrl
          : path.resolve(filePathOrUrl);
        if (!fs.existsSync(resolvedPath)) {
          return { success: false, error: `Archivo local no encontrado en: ${resolvedPath}` };
        }
        fileBuffer = fs.readFileSync(resolvedPath);
      }

      console.log(`[BaileysEngine] Despachando documento "${fileName}" a ${limpio}...`);
      await this.sock.sendMessage(jid, {
        document: fileBuffer,
        mimetype: 'application/pdf',
        fileName,
        caption
      });
      console.log(`✅ [BaileysEngine] Documento "${fileName}" entregado con éxito a ${limpio}!`);
      return { success: true, jid };
    } catch (err: any) {
      console.error(`❌ [BaileysEngine] Error enviando documento a ${telefono}:`, err.message);
      return { success: false, error: err.message };
    }
  }

  /**
   * Envía un mensaje de audio o nota de voz nativa por WhatsApp
   */
  public async sendAudio(
    telefono: string,
    filePathOrUrl: string,
    isPtt: boolean = true
  ): Promise<{ success: boolean; jid?: string; error?: string }> {
    if (!this.sock || !this.isReady) {
      return { success: false, error: 'WhatsApp no está conectado o autenticado.' };
    }

    try {
      const limpio = telefono.replace(/[^0-9]/g, '');
      const jid = `${limpio}@s.whatsapp.net`;

      let audioBuffer: Buffer;
      if (filePathOrUrl.startsWith('http://') || filePathOrUrl.startsWith('https://')) {
        const resp = await fetch(filePathOrUrl);
        const arrayBuf = await resp.arrayBuffer();
        audioBuffer = Buffer.from(arrayBuf);
      } else {
        const resolvedPath = path.isAbsolute(filePathOrUrl)
          ? filePathOrUrl
          : path.resolve(filePathOrUrl);
        if (!fs.existsSync(resolvedPath)) {
          return { success: false, error: `Audio no encontrado en: ${resolvedPath}` };
        }
        audioBuffer = fs.readFileSync(resolvedPath);
      }

      console.log(`[BaileysEngine] Despachando nota de voz a ${limpio}...`);
      await this.sock.sendMessage(jid, {
        audio: audioBuffer,
        mimetype: 'audio/ogg; codecs=opus',
        ptt: isPtt
      });
      console.log(`✅ [BaileysEngine] Nota de voz entregada con éxito a ${limpio}!`);
      return { success: true, jid };
    } catch (err: any) {
      console.error(`❌ [BaileysEngine] Error enviando audio a ${telefono}:`, err.message);
      return { success: false, error: err.message };
    }
  }

  /**
   * Notificación externa de contingencia (Discord, Telegram o Webhook secundario)
   */
  public async notifyExternalAlert(message: string): Promise<void> {
    try {
      const settings = await OutreachRepo.getSettings();
      const webhook = settings.alertWebhookUrl || process.env.ALERT_WEBHOOK_URL;
      if (!webhook) return;

      await fetch(webhook, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: message,
          text: message,
          message,
          timestamp: new Date().toISOString()
        })
      });
      console.log('[BaileysEngine] Alerta externa despachada exitosamente.');
    } catch (err: any) {
      console.warn('[BaileysEngine] No se pudo enviar alerta externa:', err.message);
    }
  }

  /**
   * Envío manual desde el dashboard (activa Human Takeover de inmediato)
   */
  public async sendManualReply(telefono: string, mensaje: string): Promise<{ success: boolean; error?: string }> {
    const res = await this.send(telefono, mensaje);
    if (res.success) {
      const limpio = telefono.replace(/[^0-9]/g, '');
      await OutreachRepo.addChatMessage(limpio, 'human_agent', mensaje);
      await OutreachRepo.updateLeadStatus(limpio, 'HUMAN_TAKEOVER', {
        humanTakeoverAt: new Date().toISOString()
      });
    }
    return res;
  }

  /**
   * Envía una notificación crítica directa al WhatsApp del administrador (Kenneth)
   */
  public async notifyAdmin(message: string): Promise<void> {
    const settings = await OutreachRepo.getSettings();
    const adminPhone = (settings.adminWhatsAppPhone || process.env.ADMIN_WHATSAPP_PHONE || '').replace(/[^0-9]/g, '');

    if (this.sock && this.isReady && adminPhone) {
      try {
        const jid = `${adminPhone}@s.whatsapp.net`;
        await this.sock.sendMessage(jid, { text: message });
        console.log(`📲 [BaileysEngine] Alerta enviada al administrador (${adminPhone})`);
      } catch (err: any) {
        console.error('[BaileysEngine] Error enviando alerta al admin:', err.message);
      }
    }

    // Disparar Webhook si está configurado
    if (settings.webhookUrl) {
      try {
        await fetch(settings.webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            event: 'ADMIN_ALERT',
            message,
            timestamp: new Date().toISOString()
          })
        });
      } catch (webhookErr: any) {
        console.warn('[BaileysEngine] Fallo al despachar webhook:', webhookErr.message);
      }
    }
  }

  /**
   * Comprueba si el mensaje entrante está dentro del horario comercial (Perú UTC-5)
   */
  private isWithinWorkingHours(settings: { startHour?: number; endHour?: number }): boolean {
    const now = new Date();
    // Convertir a hora de Lima, Perú (UTC-5)
    const limaDateStr = now.toLocaleString('en-US', { timeZone: 'America/Lima' });
    const limaDate = new Date(limaDateStr);
    const dayOfWeek = limaDate.getDay(); // 0 = Domingo, 6 = Sábado
    const currentHour = limaDate.getHours();

    // Domingo cerrado todo el día
    if (dayOfWeek === 0) return false;
    // Sábado atención comercial hasta la 1:00 PM (13:00)
    if (dayOfWeek === 6 && currentHour >= 13) return false;

    const start = settings.startHour ?? 9;
    const end = settings.endHour ?? 19;
    return currentHour >= start && currentHour < end;
  }

  public getStatus(): { isReady: boolean; hasQr: boolean } {
    return {
      isReady: this.isReady,
      hasQr: !!this.latestQr
    };
  }

  public getLatestQr(): string | null {
    return this.latestQr;
  }
}

