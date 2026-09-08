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
  private recentConversationsMap = new Map<string, { phone: string; name: string; lastMessage: string; timestamp: string }>();

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
      // En Baileys, 'notify' son mensajes nuevos entrantes y 'append' son mensajes enviados desde el teléfono principal u otros clientes sincronizados
      if (type !== 'notify' && type !== 'append') return;

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

        // Resolución de número telefónico real (soporta @s.whatsapp.net y WhatsApp LIDs @lid)
        let resolvedPhone = '';
        let senderLid = '';

        if (remoteJid.endsWith('@lid')) {
          senderLid = remoteJid.replace(/[^0-9]/g, '');
          // 1. Prioridad: remoteJidAlt o participantAlt en el key del mensaje
          const altJid = (m.key as any).remoteJidAlt || (m.key as any).participantAlt || '';
          if (altJid && altJid.includes('@s.whatsapp.net')) {
            resolvedPhone = altJid.replace(/@s\.whatsapp\.net/, '').replace(/[^0-9]/g, '');
          }
          // 2. Si no viene en el key, consultar el mapeo en memoria de Baileys signalRepository
          if (!resolvedPhone && (this.sock as any)?.signalRepository?.lidMapping?.getPNForLID) {
            try {
              const mapped = await (this.sock as any).signalRepository.lidMapping.getPNForLID(remoteJid);
              if (mapped) {
                resolvedPhone = mapped.replace(/@s\.whatsapp\.net/, '').replace(/[^0-9]/g, '');
              }
            } catch {}
          }
        }

        if (!resolvedPhone) {
          resolvedPhone = remoteJid.replace(/@[^]+$/, '').replace(/[^0-9]/g, '');
        }

        const senderPhone = resolvedPhone;
        if (!senderPhone) continue;

        // Extraer texto del mensaje soportando mensajes efímeros y multimedia
        const content = 
          m.message.ephemeralMessage?.message || 
          m.message.viewOnceMessage?.message || 
          m.message.documentWithCaptionMessage?.message || 
          m.message;

        const incomingText =
          content?.conversation ||
          content?.extendedTextMessage?.text ||
          content?.imageMessage?.caption ||
          content?.videoMessage?.caption ||
          '';

        if (!incomingText.trim()) continue;

        // Registrar o actualizar conversación reciente para sincronización
        this.recentConversationsMap.set(senderPhone, {
          phone: senderPhone,
          name: m.pushName || (`+${senderPhone}`),
          lastMessage: incomingText.slice(0, 120),
          timestamp: new Date().toISOString()
        });

        const settings = await OutreachRepo.getSettings();

        // 1. Mensaje saliente manual enviado desde el teléfono del dueño (fromMe)
        if (m.key.fromMe) {
          const adminClean = settings.adminWhatsAppPhone ? settings.adminWhatsAppPhone.replace(/[^0-9]/g, '') : '';
          if (senderPhone && senderPhone !== adminClean) {
            console.log(`[BaileysEngine] Mensaje saliente manual detectado en chat con ${senderPhone}. Registrando como human_agent.`);
            
            let existingLead = await OutreachRepo.getLeadByPhone(senderPhone);
            if (!existingLead) {
              const activeService = await OutreachRepo.getActiveService();
              existingLead = await OutreachRepo.createDirectLead({
                phone: senderPhone,
                companyName: m.pushName || `Contacto +${senderPhone}`,
                serviceId: activeService?.id || 'licitaciones-qp'
              });
            }

            // Activar Human Takeover si Kenneth responde directamente desde su WhatsApp
            await OutreachRepo.updateLeadStatus(senderPhone, 'HUMAN_TAKEOVER', {
              humanTakeoverAt: new Date().toISOString()
            });
            await OutreachRepo.addChatMessage(senderPhone, 'human_agent', incomingText);

            // Transmitir al Dashboard en tiempo real vía SSE
            try {
              const { broadcastDashboardEvent } = await import('../gateway/server.js');
              broadcastDashboardEvent({
                type: 'new_message',
                phone: senderPhone,
                role: 'human_agent',
                content: incomingText,
                createdAt: new Date().toISOString()
              });
              broadcastDashboardEvent({
                type: 'lead_updated',
                phone: senderPhone
              });
            } catch {}
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

        // 3. Buscar o registrar al prospecto con atribución inteligente de Meta Ads
        const { lead, isNew, matchedService } = await OutreachRepo.ingestInboundLead({
          phone: senderPhone,
          pushName: m.pushName || undefined,
          incomingText,
          lid: senderLid || undefined
        });

        if (!lead) continue;

        // 3.5. Comprobar política de Opt-Out de Meta/WhatsApp (STOP, BAJA, CANCELAR, etc.)
        const cleanUpper = incomingText.trim().toUpperCase();
        const isOptOut = /^(STOP|BAJA|SALIR|CANCELAR|NO CONTACTAR|DETENER)$/i.test(cleanUpper);

        if (isOptOut) {
          console.log(`🛑 [BaileysEngine] Lead ${senderPhone} solicitó Opt-Out (${cleanUpper}). Bloqueando envíos automáticos.`);
          await OutreachRepo.addChatMessage(senderPhone, 'user', incomingText);
          await OutreachRepo.updateLeadStatus(senderPhone, 'OPT_OUT', {
            humanTakeoverAt: new Date().toISOString(),
            handoffNotes: `Opt-Out solicitado por el usuario: "${incomingText}"`
          });
          await OutreachRepo.addChatMessage(senderPhone, 'system', '🔒 Prospecto dio de baja sus comunicaciones (Opt-Out). Se desactivó el bot y no se le enviarán más mensajes.');
          try {
            const { broadcastDashboardEvent } = await import('../gateway/server.js');
            broadcastDashboardEvent({
              type: 'new_message',
              phone: senderPhone,
              role: 'user',
              content: incomingText,
              createdAt: new Date().toISOString()
            });
            broadcastDashboardEvent({
              type: 'lead_updated',
              phone: senderPhone,
              status: 'OPT_OUT'
            });
          } catch {}
          continue;
        }

        // 4. Registrar mensaje del usuario en la base de datos y activar Human Takeover (El bot se silencia)
        await OutreachRepo.addChatMessage(senderPhone, 'user', incomingText);
        await OutreachRepo.updateLeadStatus(senderPhone, 'REPLIED', {
          humanTakeoverAt: new Date().toISOString(),
          lastCustomerMessageAt: new Date().toISOString()
        });

        // Transmitir al Dashboard en tiempo real
        try {
          const { broadcastDashboardEvent } = await import('../gateway/server.js');
          broadcastDashboardEvent({
            type: 'new_message',
            phone: senderPhone,
            role: 'user',
            content: incomingText,
            assignedRepName: lead.assignedRepName,
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

        // 6. Notificar inmediatamente al asesor asignado (o admin) a su WhatsApp personal
        const targetPhone = (lead.assignedRepPhone || settings.adminWhatsAppPhone || process.env.ADMIN_WHATSAPP_PHONE || '').replace(/[^0-9]/g, '');
        const repDisplayName = lead.assignedRepName || 'Asesor Asignado';

        const isMetaAd = lead.source === 'meta_ads';
        const sourceLabel = isMetaAd ? '🎯 *NUEVO LEAD DE META ADS (Click-to-WhatsApp)*' : '🚨 *NUEVO MENSAJE DE PROSPECTO*';
        const campaignLabel = lead.serviceName ? `\n📢 Campaña: *${lead.serviceName}*` : '';

        const alertMsg = 
          `${sourceLabel} (Round Robin: ${repDisplayName})\n\n` +
          `👤 Asesor: *${repDisplayName}*\n` +
          `🏢 Empresa: *${lead.companyName || 'Contacto WhatsApp'}*` +
          `${campaignLabel}\n` +
          `📱 Teléfono: *+${senderPhone}*\n` +
          `💬 Mensaje: "${incomingText}"\n\n` +
          `💡 *QPartner Co-Pilot* ha generado 3 sugerencias tácticas en tu Dashboard para responder con 1 clic:\n` +
          `👉 https://qp-outreach-engine.vercel.app/#chat=${senderPhone}`;

        if (targetPhone) {
          await this.notifyPhone(targetPhone, alertMsg);
        } else {
          await this.notifyAdmin(alertMsg);
        }
      }
    });

    // Sincronización de historial de mensajes recientes cuando Baileys se reconecta
    this.sock.ev.on('messaging-history.set', async ({ messages }: any) => {
      if (!messages || !Array.isArray(messages)) return;
      for (const m of messages) {
        if (!m.message) continue;
        const remoteJid = m.key.remoteJid || '';
        if (remoteJid.endsWith('@g.us') || remoteJid.includes('broadcast')) continue;
        const phone = remoteJid.replace(/@s\.whatsapp\.net/, '').replace(/[^0-9]/g, '');
        if (!phone) continue;

        const content = 
          m.message.ephemeralMessage?.message || 
          m.message.viewOnceMessage?.message || 
          m.message.documentWithCaptionMessage?.message || 
          m.message;

        const text =
          content?.conversation ||
          content?.extendedTextMessage?.text ||
          content?.imageMessage?.caption ||
          content?.videoMessage?.caption ||
          '';

        if (!text.trim()) continue;

        const lead = await OutreachRepo.getLeadByPhone(phone);
        if (lead) {
          const role = m.key.fromMe ? 'human_agent' : 'user';
          await OutreachRepo.addChatMessage(phone, role, text.trim());
        }
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
   * Envía una imagen (Buffer, URL o Base64) con caption por WhatsApp
   */
  public async sendImage(
    telefono: string,
    fileBufferOrUrl: Buffer | string,
    fileName?: string,
    caption?: string
  ): Promise<{ success: boolean; jid?: string; error?: string }> {
    if (!this.sock || !this.isReady) {
      return { success: false, error: 'WhatsApp no está conectado o autenticado.' };
    }

    try {
      const limpio = telefono.replace(/[^0-9]/g, '');
      const jid = `${limpio}@s.whatsapp.net`;

      let imageBuffer: Buffer;
      if (Buffer.isBuffer(fileBufferOrUrl)) {
        imageBuffer = fileBufferOrUrl;
      } else if (fileBufferOrUrl.startsWith('data:image')) {
        const base64Data = fileBufferOrUrl.replace(/^data:image\/\w+;base64,/, '');
        imageBuffer = Buffer.from(base64Data, 'base64');
      } else if (fileBufferOrUrl.startsWith('http://') || fileBufferOrUrl.startsWith('https://')) {
        const resp = await fetch(fileBufferOrUrl);
        const arrayBuf = await resp.arrayBuffer();
        imageBuffer = Buffer.from(arrayBuf);
      } else {
        const resolvedPath = path.isAbsolute(fileBufferOrUrl) ? fileBufferOrUrl : path.resolve(fileBufferOrUrl);
        if (!fs.existsSync(resolvedPath)) {
          return { success: false, error: `Imagen no encontrada en: ${resolvedPath}` };
        }
        imageBuffer = fs.readFileSync(resolvedPath);
      }

      console.log(`[BaileysEngine] Despachando imagen a ${limpio} (${imageBuffer.length} bytes)...`);
      await this.sock.sendMessage(jid, {
        image: imageBuffer,
        caption: caption || undefined,
        fileName: fileName || 'imagen.jpg'
      });

      this.recentConversationsMap.set(limpio, {
        phone: limpio,
        name: `+${limpio}`,
        lastMessage: caption ? `[Imagen] ${caption}` : '[Imagen]',
        timestamp: new Date().toISOString()
      });

      console.log(`✅ [BaileysEngine] Imagen entregada con éxito a ${limpio}!`);
      return { success: true, jid };
    } catch (err: any) {
      console.error(`❌ [BaileysEngine] Error enviando imagen a ${telefono}:`, err.message);
      return { success: false, error: err.message };
    }
  }

  /**
   * Envía un audio o nota de voz nativa PTT (Push-to-Talk) desde Buffer
   */
  public async sendAudioBuffer(
    telefono: string,
    audioBuffer: Buffer,
    isPtt: boolean = true
  ): Promise<{ success: boolean; jid?: string; error?: string }> {
    if (!this.sock || !this.isReady) {
      return { success: false, error: 'WhatsApp no está conectado o autenticado.' };
    }

    try {
      const limpio = telefono.replace(/[^0-9]/g, '');
      const jid = `${limpio}@s.whatsapp.net`;

      console.log(`[BaileysEngine] Despachando nota de voz a ${limpio} (${audioBuffer.length} bytes)...`);
      await this.sock.sendMessage(jid, {
        audio: audioBuffer,
        mimetype: 'audio/ogg; codecs=opus',
        ptt: isPtt
      });

      this.recentConversationsMap.set(limpio, {
        phone: limpio,
        name: `+${limpio}`,
        lastMessage: '🎵 [Nota de voz]',
        timestamp: new Date().toISOString()
      });

      console.log(`✅ [BaileysEngine] Nota de voz entregada con éxito a ${limpio}!`);
      return { success: true, jid };
    } catch (err: any) {
      console.error(`❌ [BaileysEngine] Error enviando nota de voz a ${telefono}:`, err.message);
      return { success: false, error: err.message };
    }
  }

  /**
   * Obtiene las conversaciones detectadas en la sesión de WhatsApp para sincronización
   */
  public async getRecentConversations(): Promise<Array<{ phone: string; name: string; lastMessage: string; timestamp: string }>> {
    // Si la memoria tiene pocas conversaciones (ej. reinicio reciente), hidratar desde la BD
    if (this.recentConversationsMap.size < 5) {
      try {
        const leads = await OutreachRepo.getLeads({ limit: 50 });
        for (const l of leads) {
          if (!this.recentConversationsMap.has(l.phone)) {
            this.recentConversationsMap.set(l.phone, {
              phone: l.phone,
              name: l.companyName || `+${l.phone}`,
              lastMessage: l.handoffNotes || 'Conversación existente en CRM',
              timestamp: l.lastMessageAt || l.updatedAt || l.createdAt || new Date().toISOString()
            });
          }
        }
      } catch {}
    }

    const list = Array.from(this.recentConversationsMap.values());
    list.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    return list;
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
      } catch (err: any) {
        console.error('[BaileysEngine] Error disparando webhook de alerta:', err.message);
      }
    }
  }

  /**
   * Envía una notificación directa al número de WhatsApp de cualquier vendedor asignado
   */
  public async notifyPhone(phone: string, message: string): Promise<void> {
    const clean = phone.replace(/[^0-9]/g, '');
    if (this.sock && this.isReady && clean) {
      try {
        const jid = `${clean}@s.whatsapp.net`;
        await this.sock.sendMessage(jid, { text: message });
        console.log(`📲 [BaileysEngine] Alerta Round Robin enviada a ${clean}`);
      } catch (err: any) {
        console.error(`[BaileysEngine] Error enviando alerta a ${clean}:`, err.message);
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

  public getStatus(): { isReady: boolean; hasQr: boolean; connectedPhone?: string } {
    const rawId = this.sock?.user?.id || '';
    const cleanPhone = rawId ? rawId.split(':')[0].replace(/[^0-9]/g, '') : undefined;
    return {
      isReady: this.isReady,
      hasQr: !!this.latestQr,
      connectedPhone: cleanPhone
    };
  }

  public getLatestQr(): string | null {
    return this.latestQr;
  }

  public async disconnectAndClearSession(): Promise<void> {
    console.log('⚠️ [BaileysEngine] Desvinculando sesión de WhatsApp y limpiando credenciales...');
    if (this.sock) {
      try {
        await this.sock.logout();
      } catch {}
      try {
        this.sock.ev.removeAllListeners('connection.update');
        this.sock.ev.removeAllListeners('creds.update');
        this.sock.ev.removeAllListeners('messages.upsert');
        (this.sock as any).ws?.close();
      } catch {}
      this.sock = null;
    }
    this.isReady = false;
    this.latestQr = null;

    if (fs.existsSync(this.authDir)) {
      try {
        fs.rmSync(this.authDir, { recursive: true, force: true });
      } catch {}
    }

    setTimeout(() => {
      this.init().catch(err => console.error('[BaileysEngine] Error reiniciando tras desvinculación:', err));
    }, 1500);
  }
}

