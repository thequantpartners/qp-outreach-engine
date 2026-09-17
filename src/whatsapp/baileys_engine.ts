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
import { SlaAlertManager } from './sla_manager.js';
import { LeadStatus } from '../types/index.js';

dotenv.config();

export class BaileysEngine {
  private static instance: BaileysEngine | null = null;
  private sock: WASocket | null = null;
  private authState: any = null;
  private isReady: boolean = false;
  private isInitializing: boolean = false;
  private latestQr: string | null = null;
  private authDir: string;
  private storageDir: string;
  private recentConversationsMap = new Map<string, { phone: string; name: string; lastMessage: string; timestamp: string }>();

  // Cache en memoria bidireccional para WhatsApp LIDs
  public static lidToPhoneCache = new Map<string, string>([
    ['269363907195002', '51902105668']
  ]);
  public static phoneToLidCache = new Map<string, string>([
    ['51902105668', '269363907195002']
  ]);

  // IDs de mensajes emitidos por el motor para filtrar ecos de Baileys (fromMe)
  public static outgoingEngineMsgIds = new Set<string>();

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

  public getSocket(): WASocket | null {
    return this.sock;
  }

  /**
   * Inicializa la conexión con WhatsApp mediante Baileys
   */
  public async init(): Promise<void> {
    if (this.sock && this.isReady) return;
    if (this.isInitializing) return;

    this.isInitializing = true;
    console.log('[BaileysEngine] Iniciando conexión con WhatsApp Web...');

    try {
      if (!fs.existsSync(this.authDir)) {
        fs.mkdirSync(this.authDir, { recursive: true });
      }

      // Validar integridad de creds.json si existe
      const credsFile = path.join(this.authDir, 'creds.json');
      if (fs.existsSync(credsFile)) {
        try {
          const raw = fs.readFileSync(credsFile, 'utf-8');
          JSON.parse(raw);
        } catch {
          console.warn('⚠️ [BaileysEngine] Archivo creds.json corrupto. Purgando sesión para nuevo QR limpio...');
          fs.rmSync(this.authDir, { recursive: true, force: true });
          fs.mkdirSync(this.authDir, { recursive: true });
        }
      }

      const { state, saveCreds } = await useMultiFileAuthState(this.authDir);
      this.authState = state;

      this.sock = makeWASocket({
        auth: state,
        printQRInTerminal: false,
        logger: pino({ level: 'silent' }),
        browser: Browsers.ubuntu('Chrome'),
        syncFullHistory: false,
        markOnlineOnConnect: false
      });

      this.sock.ev.on('creds.update', saveCreds);

      // Listener en tiempo real para mapeo de WhatsApp LIDs emitidos por Baileys
      this.sock.ev.on('lid-mapping.update' as any, async (update: any) => {
        try {
          const lid = update?.lid ? update.lid.replace(/[^0-9]/g, '') : '';
          const pn = update?.pn ? update.pn.replace(/@s\.whatsapp\.net/, '').replace(/[^0-9]/g, '') : '';
          if (lid && pn) {
            console.log(`🔗 [BaileysEngine] lid-mapping.update detectado: LID ${lid} ↔ PN ${pn}`);
            BaileysEngine.lidToPhoneCache.set(lid, pn);
            BaileysEngine.phoneToLidCache.set(pn, lid);
            await OutreachRepo.linkLeadLid(pn, lid);
            await OutreachRepo.mergeLeads(lid, pn, lid);
          }
        } catch (err: any) {
          console.error('[BaileysEngine] Error en lid-mapping.update:', err.message);
        }
      });

      this.sock.ev.on('contacts.upsert', async (contacts: any[]) => {
        if (!Array.isArray(contacts)) return;
        for (const c of contacts) {
          if (c.id && c.lid) {
            const pn = c.id.replace(/@s\.whatsapp\.net/, '').replace(/[^0-9]/g, '');
            const lid = c.lid.replace(/@lid/, '').replace(/[^0-9]/g, '');
            if (pn && lid && pn !== lid) {
              BaileysEngine.lidToPhoneCache.set(lid, pn);
              BaileysEngine.phoneToLidCache.set(pn, lid);
              await OutreachRepo.linkLeadLid(pn, lid);
              await OutreachRepo.mergeLeads(lid, pn, lid);
            }
          }
        }
      });

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
            console.warn('⚠️ [BaileysEngine] Sesión cerrada formalmente (401). Purgando credenciales expiradas para nuevo QR...');
            try {
              fs.rmSync(this.authDir, { recursive: true, force: true });
              fs.mkdirSync(this.authDir, { recursive: true });
            } catch (err: any) {
              console.error('[BaileysEngine] Error purgando authDir:', err.message);
            }
            setTimeout(() => this.init(), 2000);
          }
        } else if (connection === 'open') {
          console.log('✅ [BaileysEngine] WhatsApp Conectado y Listo para Despachar!');
          this.isReady = true;
          this.latestQr = null;

          // Iniciar Hermes C2 Scheduler para briefings matutinos y reportes de cierre
          try {
            const { HermesC2 } = await import('../hermes/hermes_c2.js');
            HermesC2.initScheduler();
          } catch (err: any) {
            console.warn('[BaileysEngine] No se pudo inicializar Hermes C2 scheduler:', err.message);
          }

          // Inicializar etiquetas oficiales de WhatsApp Business vinculadas a Ghost CRM
          try {
            const { WhatsAppLabelManager } = await import('./label_manager.js');
            await WhatsAppLabelManager.initLabels(this.sock);
          } catch (lblErr: any) {
            console.warn('[BaileysEngine] No se pudieron inicializar etiquetas de WhatsApp:', lblErr.message);
          }

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

          // 1. Cache en memoria estático bidireccional (instantáneo)
          if (BaileysEngine.lidToPhoneCache.has(senderLid)) {
            resolvedPhone = BaileysEngine.lidToPhoneCache.get(senderLid)!;
          }

          // 2. Alt JID en el mensaje (remoteJidAlt, participantAlt)
          if (!resolvedPhone) {
            const altJid = (m.key as any).remoteJidAlt || (m.key as any).participantAlt || (m as any).participantAlt || '';
            if (altJid && altJid.includes('@s.whatsapp.net')) {
              resolvedPhone = altJid.replace(/@s\.whatsapp\.net/, '').replace(/[^0-9]/g, '');
            }
          }

          // 3. Buscar en la base de datos PostgreSQL por LID asociado
          if (!resolvedPhone) {
            const existingLead = await OutreachRepo.getLeadByLid(senderLid);
            if (existingLead && existingLead.phone && !existingLead.phone.startsWith('269') && existingLead.phone.length <= 13) {
              resolvedPhone = existingLead.phone;
              console.log(`🔗 [BaileysEngine] LID ${senderLid} resuelto via BD a lead existente: +${resolvedPhone}`);
            }
          }

          // 4. Buscar en el authState keys de Baileys (lid-mapping store)
          if (!resolvedPhone && this.authState?.keys?.get) {
            try {
              const reverseKey = `${senderLid}_reverse`;
              const stored = await this.authState.keys.get('lid-mapping', [reverseKey]);
              if (stored?.[reverseKey]) {
                const pn = stored[reverseKey];
                resolvedPhone = pn.replace(/@s\.whatsapp\.net/, '').replace(/[^0-9]/g, '');
                console.log(`🔗 [BaileysEngine] LID ${senderLid} resuelto via Baileys authState: +${resolvedPhone}`);
              }
            } catch {}
          }

          if (resolvedPhone) {
            BaileysEngine.lidToPhoneCache.set(senderLid, resolvedPhone);
            BaileysEngine.phoneToLidCache.set(resolvedPhone, senderLid);
          }
        }

        if (!resolvedPhone) {
          resolvedPhone = remoteJid.replace(/@[^]+$/, '').replace(/[^0-9]/g, '');
        }

        let senderPhone = resolvedPhone;
        if (!senderPhone) continue;

        // Extraer texto del mensaje soportando mensajes efímeros y multimedia
        const content = 
          m.message.ephemeralMessage?.message || 
          m.message.viewOnceMessage?.message || 
          m.message.documentWithCaptionMessage?.message || 
          m.message;

        let incomingText =
          content?.conversation ||
          content?.extendedTextMessage?.text ||
          content?.imageMessage?.caption ||
          content?.videoMessage?.caption ||
          '';

        // Si envió una imagen sin caption (ej. comprobante de pago Yape/Plin o foto del producto del live)
        if (!incomingText.trim() && content?.imageMessage) {
          incomingText = '📷 [Comprobante de pago o imagen del producto adjunta]';
        }

        // Detección y transcripción autónoma de notas de voz / audios con Gemini 2.5 Flash
        if (!incomingText.trim() && content?.audioMessage) {
          try {
            console.log(`🎙️ [BaileysEngine] Nota de voz entrante detectada de +${senderPhone} (${content.audioMessage.seconds || 0}s). Descargando y transcribiendo con Gemini...`);
            const { VoiceTranscriber } = await import('../ai/voice_transcriber.js');
            const transcription = await VoiceTranscriber.transcribeBaileysAudio(content.audioMessage);
            if (transcription) {
              if (transcription === '[INAUDIBLE]') {
                incomingText = '🎙️ [Nota de voz inaudible o en silencio]';
              } else {
                incomingText = `🎙️ [Nota de voz]: "${transcription}"`;
              }
              console.log(`🎙️ [BaileysEngine] Audio de +${senderPhone} transcrito con éxito: "${incomingText}"`);
            }
          } catch (audioErr: any) {
            console.error(`[BaileysEngine] Error transcribiendo audio de +${senderPhone}:`, audioErr.message);
          }
        }

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
          SlaAlertManager.getInstance().cancelSlaTimer(senderPhone);

          // Si este mensaje fue despachado por el propio motor (outreach/batch/IA), ignorar el eco de Baileys
          if (m.key.id && BaileysEngine.outgoingEngineMsgIds.has(m.key.id)) {
            BaileysEngine.outgoingEngineMsgIds.delete(m.key.id);
            continue;
          }

          // Interceptar comandos de Hermes C2 enviados desde la cuenta propia (ej. notas consigo mismo o en cualquier chat)
          const trimmed = incomingText.trim();
          const isSlashCommand = trimmed.startsWith('/') || ['sop', 'status', 'leads', 'won', 'help', 'ayuda', 'comandos', 'menu', 'pipeline', 'etapas', 'manual', 'guia'].includes(trimmed.toLowerCase());
          if (isSlashCommand) {
            console.log(`👑 [BaileysEngine] Comando Hermes detectado desde cuenta propia (fromMe): "${incomingText}"`);
            try {
              const { HermesC2 } = await import('../hermes/hermes_c2.js');
              const hermesRes = await HermesC2.handleAdminMessage(incomingText, senderPhone || '51902105668');
              if (hermesRes.handled && hermesRes.replyMessage) {
                const targetJid = remoteJid || `${senderPhone}@s.whatsapp.net`;
                await this.sock?.sendMessage(targetJid, { text: hermesRes.replyMessage });
              }
            } catch (hermesErr: any) {
              console.error('[BaileysEngine] Error ejecutando comando Hermes C2 (fromMe):', hermesErr.message);
            }
            continue;
          }

          // Verificación de redundancia: si el último mensaje registrado en la conversación
          // tiene el mismo contenido enviado hace menos de 25 segundos, es un eco idéntico
          const recentHistory = await OutreachRepo.getChatHistory(senderPhone, 2);
          const lastMsg = recentHistory[recentHistory.length - 1];
          if (lastMsg && lastMsg.content === incomingText.trim()) {
            const timeDiff = Date.now() - new Date(lastMsg.createdAt).getTime();
            if (timeDiff < 25000) {
              console.log(`[BaileysEngine] Eco saliente duplicado omitido para ${senderPhone}.`);
              continue;
            }
          }

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
        const { HermesC2 } = await import('../hermes/hermes_c2.js');
        const isAdmin = await HermesC2.isAdminPhone(senderPhone);

        if (isAdmin) {
          try {
            const hermesRes = await HermesC2.handleAdminMessage(incomingText, senderPhone);
            if (hermesRes.handled && hermesRes.replyMessage) {
              const jid = remoteJid || `${senderPhone}@s.whatsapp.net`;
              await this.sock?.sendMessage(jid, { text: hermesRes.replyMessage });
            }
          } catch (hermesErr: any) {
            console.error('[BaileysEngine] Error ejecutando comando en Hermes C2:', hermesErr.message);
          }
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

        // Si el lead registrado en BD tiene su teléfono real (evita bifurcar chats en @lid)
        if (lead.phone && lead.phone !== senderPhone && !lead.phone.startsWith('269')) {
          console.log(`🔄 [BaileysEngine] Unificando chat: senderPhone ${senderPhone} -> Lead real +${lead.phone}`);
          if (senderLid) {
            BaileysEngine.lidToPhoneCache.set(senderLid, lead.phone);
            BaileysEngine.phoneToLidCache.set(lead.phone, senderLid);
          }
          senderPhone = lead.phone;
        }

        // 3.4. Detección Temprana de Correo Electrónico (Derivación por Email)
        try {
          const { EmailDispatcher } = await import('../email/email_dispatcher.js');
          const extractedEmail = EmailDispatcher.extractEmailFromText(incomingText);
          if (extractedEmail && !EmailDispatcher.hasAlreadyReceivedEmail(lead)) {
            console.log(`📧 [EmailDispatcher] Correo detectado en mensaje de ${senderPhone}: "${extractedEmail}". Generando borrador híbrido...`);
            await OutreachRepo.addChatMessage(senderPhone, 'user', incomingText);

            try {
              const { AutonomousPipeline } = await import('../pipeline/autonomous_pipeline.js');
              AutonomousPipeline.recordLeadReply(senderPhone);
            } catch {}

            const draft = await EmailDispatcher.generateEmailDraft(lead, extractedEmail, incomingText);

            // Responder inmediatamente al lead por WhatsApp
            const leadAckMessage = `¡Excelente! 🙌 Ya le pasé los datos a Kenneth para enviarte la propuesta oficial a tu correo. En breve te estará llegando desde partners@thequantpartners.com 📧🤝`;
            const jid = `${senderPhone}@s.whatsapp.net`;
            await this.sock?.sendMessage(jid, { text: leadAckMessage });
            await OutreachRepo.addChatMessage(senderPhone, 'assistant', leadAckMessage);

            // Notificar a Kenneth para aprobación en WhatsApp
            const adminPhone = (settings.adminWhatsAppPhone || process.env.ADMIN_WHATSAPP_PHONE || '51902105668').replace(/[^0-9]/g, '');
            if (adminPhone) {
              const approvalAlert = 
                `📧 *NUEVO CORREO LISTO PARA APROBACIÓN*\n` +
                `━━━━━━━━━━━━━━━━━━━━\n` +
                `🏢 Empresa: *${lead.companyName}*\n` +
                `📱 Teléfono: *+${senderPhone}*\n` +
                `📬 Destinatario: *${extractedEmail}*\n` +
                `📝 Asunto: *${draft.subject}*\n` +
                `━━━━━━━━━━━━━━━━━━━━\n` +
                `📄 *Vista Previa:*\n` +
                `"${draft.text.substring(0, 260)}..."\n` +
                `━━━━━━━━━━━━━━━━━━━━\n` +
                `👉 *Para enviar:* Responde *aprobar*\n` +
                `👉 *Para descartar:* Responde *cancelar*`;

              await this.sock?.sendMessage(`${adminPhone}@s.whatsapp.net`, { text: approvalAlert });
              console.log(`📢 [EmailDispatcher] Alerta de aprobación enviada a Kenneth (${adminPhone}).`);
            }
            continue;
          }
        } catch (emailErr: any) {
          console.error('[BaileysEngine] Error procesando correo temprano:', emailErr.message);
        }

        // 3.45. Detección Temprana de Teléfono de Derivación (Referral Phone)
        try {
          const { PhoneExtractor } = await import('../utils/phone_extractor.js');
          const referralPhone = PhoneExtractor.extractReferralPhone(incomingText, senderPhone);
          if (referralPhone) {
            console.log(`📞 [BaileysEngine] Teléfono de derivación detectado en mensaje de ${senderPhone}: "+${referralPhone}"`);
            await OutreachRepo.addChatMessage(senderPhone, 'user', incomingText);

            try {
              const { AutonomousPipeline } = await import('../pipeline/autonomous_pipeline.js');
              AutonomousPipeline.recordLeadReply(senderPhone);
            } catch {}

            // Responder agradeciendo a recepción
            const ackMsg = `¡Muchas gracias por la información! 🙌 Nos comunicaremos directamente con ese número de parte de su equipo. ¡Que tengan un excelente día! 🤝`;
            const jid = `${senderPhone}@s.whatsapp.net`;
            await this.sock?.sendMessage(jid, { text: ackMsg });
            await OutreachRepo.addChatMessage(senderPhone, 'assistant', ackMsg);

            // Guardar el nuevo lead derivado en PostgreSQL
            await OutreachRepo.saveLeadsFromScraper(lead.serviceId, [{
              title: `${lead.companyName} (Contacto Directo)`,
              phone: referralPhone,
              phoneClean: referralPhone,
              address: lead.address,
              categoryName: lead.category,
              website: lead.website
            }]);

            await OutreachRepo.updateLeadCustomFields(referralPhone, {
              referredFromPhone: senderPhone,
              referredCompanyName: lead.companyName,
              referredSourceText: incomingText
            });

            await OutreachRepo.updateLeadCustomFields(senderPhone, {
              referredToPhone: referralPhone,
              redirectedAt: new Date().toISOString()
            });

            // Alertar a Kenneth al WhatsApp privado
            const adminPhone = (settings.adminWhatsAppPhone || process.env.ADMIN_WHATSAPP_PHONE || '51902105668').replace(/[^0-9]/g, '');
            if (adminPhone) {
              const referralAlert = 
                `🚨 *NUEVO CONTACTO DIRECTO DERIVADO (REFERRAL)*\n` +
                `━━━━━━━━━━━━━━━━━━━━\n` +
                `🏢 Empresa: *${lead.companyName}*\n` +
                `📱 Recepción / Canal que derivó: *+${senderPhone}*\n` +
                `📞 *Nuevo Número Directo:* *+${referralPhone}*\n` +
                `━━━━━━━━━━━━━━━━━━━━\n` +
                `💬 Mensaje recibido:\n` +
                `"${incomingText.substring(0, 200)}"\n` +
                `━━━━━━━━━━━━━━━━━━━━\n` +
                `💡 *Acción:* El nuevo contacto ya fue guardado en el CRM para iniciar contacto referenciado.`;

              await this.sock?.sendMessage(`${adminPhone}@s.whatsapp.net`, { text: referralAlert });
              console.log(`📢 [BaileysEngine] Alerta de contacto derivado enviada a Kenneth (${adminPhone}).`);
            }
            continue;
          }
        } catch (phoneErr: any) {
          console.error('[BaileysEngine] Error procesando teléfono derivado:', phoneErr.message);
        }

        // 3.48. Detección Temprana de Onboarding Shalom en Chat
        try {
          const isSetupCommand = incomingText.toLowerCase().startsWith('/setup-shalom');
          const hasCredentials = incomingText.includes('@') && /(?:clave|pass|password|contraseña)/i.test(incomingText);
          const isAwaitingOnboarding = lead.status === 'CLOSED_WON' || lead.customFields?.pendingShalomOnboarding;

          if (isSetupCommand || hasCredentials || (isAwaitingOnboarding && incomingText.includes('@'))) {
            const { ShalomChatOnboarding } = await import('../logistics/shalom_chat_onboarding.js');
            const onbRes = await ShalomChatOnboarding.handleOnboardingMessage(senderPhone, incomingText);
            if (onbRes.handled && onbRes.reply) {
              console.log(`📦 [ShalomChatOnboarding] Mensaje de onboarding procesado para ${senderPhone}.`);
              await OutreachRepo.addChatMessage(senderPhone, 'user', incomingText);

              const jid = `${senderPhone}@s.whatsapp.net`;
              await this.sock?.sendMessage(jid, { text: onbRes.reply });
              await OutreachRepo.addChatMessage(senderPhone, 'assistant', onbRes.reply);

              if (onbRes.alertKenneth) {
                const adminPhone = (settings.adminWhatsAppPhone || process.env.ADMIN_WHATSAPP_PHONE || '51902105668').replace(/[^0-9]/g, '');
                if (adminPhone) {
                  await this.sock?.sendMessage(`${adminPhone}@s.whatsapp.net`, { text: onbRes.alertKenneth });
                }
              }
              continue;
            }
          }
        } catch (onbErr: any) {
          console.error('[BaileysEngine] Error procesando onboarding Shalom:', onbErr.message);
        }

        // 3.49. Detección Temprana de Comprobante de Pago (Voucher / Yape / Plin / Transferencia)
        try {
          const isImageMessage = !!content?.imageMessage;
          const isDocPdf = !!content?.documentMessage;
          const lowerText = incomingText.toLowerCase();
          const paymentKeywords = [
            'yape', 'plin', 'transferencia', 'transfiri', 'comprobante', 
            'voucher', 'constancia', 'deposito', 'ya pague', 'ya deposite', 
            'ya transferi', 'pago realizado', 'adjunto el pago', 'pago listo'
          ];
          const hasPaymentKeyword = paymentKeywords.some(kw => lowerText.includes(kw));

          // Si el usuario envía una imagen o documento PDF, o menciona palabras clave de pago
          if ((isImageMessage || isDocPdf || hasPaymentKeyword) && lead.status !== 'CLOSED_WON') {
            console.log(`💰 [BaileysEngine] Posible comprobante de pago detectado de ${senderPhone}. Registrando como PAYMENT_PENDING y alertando a Kenneth...`);
            await OutreachRepo.addChatMessage(senderPhone, 'user', incomingText);

            try {
              const { AutonomousPipeline } = await import('../pipeline/autonomous_pipeline.js');
              AutonomousPipeline.recordLeadReply(senderPhone);
            } catch {}

            await OutreachRepo.updateLeadStatus(senderPhone, 'PAYMENT_PENDING');
            await OutreachRepo.updateLeadCustomFields(senderPhone, {
              voucherReceivedAt: new Date().toISOString(),
              voucherText: incomingText
            });

            // Confirmación instantánea al cliente
            const ackPaymentMsg = 
              `¡Muchas gracias! 🙌 Recibimos tu constancia de pago. Nuestro equipo lo está verificando en este momento; en unos breves minutos te confirmamos y te dejamos todo listo 🚀.`;
            const jid = `${senderPhone}@s.whatsapp.net`;
            await this.sock?.sendMessage(jid, { text: ackPaymentMsg });
            await OutreachRepo.addChatMessage(senderPhone, 'assistant', ackPaymentMsg);

            // Notificación prioritaria a Kenneth para validación humana
            const adminPhone = (settings.adminWhatsAppPhone || process.env.ADMIN_WHATSAPP_PHONE || '51902105668').replace(/[^0-9]/g, '');
            if (adminPhone) {
              const paymentAlert = 
                `🚨 *NUEVO COMPROBANTE DE PAGO RECIBIDO*\n` +
                `━━━━━━━━━━━━━━━━━━━━\n` +
                `🏢 *Cliente:* ${lead.companyName}\n` +
                `📱 *Teléfono:* +${senderPhone}\n` +
                `📝 *Detalle:* ${incomingText}\n` +
                `🕒 *Hora:* ${new Date().toLocaleTimeString('es-PE')}\n` +
                `━━━━━━━━━━━━━━━━━━━━\n` +
                `👉 *Para aprobar:* Responde *aprobar pago ${senderPhone}* (o solo *aprobar pago*)\n` +
                `👉 *Para rechazar:* Responde *rechazar pago ${senderPhone}*`;

              await this.sock?.sendMessage(`${adminPhone}@s.whatsapp.net`, { text: paymentAlert });

              // Si es mensaje con imagen, reenviar la imagen original a Kenneth
              if (isImageMessage && this.sock) {
                try {
                  await this.sock.sendMessage(`${adminPhone}@s.whatsapp.net`, { forward: m });
                } catch (fwdErr: any) {
                  console.warn('[BaileysEngine] No se pudo reenviar la imagen del voucher a Kenneth:', fwdErr.message);
                }
              }
            }
            continue;
          }
        } catch (payErr: any) {
          console.error('[BaileysEngine] Error procesando detección de pago:', payErr.message);
        }

        // 3.5. Analizar política de Opt-Out / Rechazo / Canal Médico / Redirección Amable
        const { RejectionDetector } = await import('../utils/rejection_detector.js');
        const rejection = RejectionDetector.analyze(incomingText);

        // 3.5.1. Manejo de Redirección Amable (Canal de pacientes / citas / privado sin rechazo)
        if (rejection.isChannelRedirect && rejection.suggestedRedirectAsk) {
          console.log(`🔄 [BaileysEngine] Lead ${senderPhone} indicó canal exclusivo (${rejection.category}: ${rejection.reason}). Enviando solicitud amable de contacto directo...`);
          await OutreachRepo.addChatMessage(senderPhone, 'user', incomingText);

          try {
            const { AutonomousPipeline } = await import('../pipeline/autonomous_pipeline.js');
            AutonomousPipeline.recordLeadReply(senderPhone);
          } catch {}

          const alreadyAsked = lead.customFields?.redirectAskSent === true;
          if (!alreadyAsked) {
            try {
              const jid = `${senderPhone}@s.whatsapp.net`;
              await this.sock?.sendMessage(jid, { text: rejection.suggestedRedirectAsk });
              await OutreachRepo.addChatMessage(senderPhone, 'assistant', rejection.suggestedRedirectAsk);
              await OutreachRepo.updateLeadCustomFields(senderPhone, {
                redirectAskSent: true,
                channelRedirectReason: rejection.reason,
                waitingReferralContact: true
              });
              await OutreachRepo.updateLeadStatus(senderPhone, 'REPLIED');
              console.log(`🔄 [BaileysEngine] Pregunta de derivación enviada a ${senderPhone}: "${rejection.suggestedRedirectAsk}"`);
            } catch (askErr: any) {
              console.warn('[BaileysEngine] Error enviando pregunta de derivación:', askErr.message);
            }
          }
          continue;
        }

        // 3.5.2. Rechazo Real / Opt-Out Terminal
        if (rejection.isRejection) {
          console.log(`🛑 [BaileysEngine] Lead ${senderPhone} rechazó la propuesta (${rejection.category}: ${rejection.reason}).`);
          await OutreachRepo.addChatMessage(senderPhone, 'user', incomingText);

          try {
            const { AutonomousPipeline } = await import('../pipeline/autonomous_pipeline.js');
            AutonomousPipeline.recordLeadReply(senderPhone);
          } catch {}

          const alreadyAcknowledged = lead.customFields?.rejectionAcknowledged === true || lead.status === 'CLOSED_LOST' || lead.status === 'OPT_OUT';

          // Enviar exactamente 1 mensaje de despedida y disculpas educadas
          if (!alreadyAcknowledged && rejection.suggestedSignoff) {
            try {
              const jid = `${senderPhone}@s.whatsapp.net`;
              await this.sock?.sendMessage(jid, { text: rejection.suggestedSignoff });
              await OutreachRepo.addChatMessage(senderPhone, 'assistant', rejection.suggestedSignoff);
              console.log(`🛑 [BaileysEngine] Despedida única enviada a ${senderPhone}: "${rejection.suggestedSignoff}"`);
            } catch (sendErr: any) {
              console.warn('[BaileysEngine] Error enviando mensaje de despedida:', sendErr.message);
            }
          }

          const finalStatus: LeadStatus = rejection.category === 'EXPLICIT_OPTOUT' ? 'OPT_OUT' : 'CLOSED_LOST';

          await OutreachRepo.updateLeadStatus(senderPhone, finalStatus, {
            humanTakeoverAt: new Date().toISOString(),
            handoffNotes: rejection.reason
          });

          await OutreachRepo.updateLeadCustomFields(senderPhone, {
            rejectionAcknowledged: true,
            rejectionReason: rejection.reason,
            rejectionCategory: rejection.category
          });

          await OutreachRepo.addChatMessage(
            senderPhone,
            'system',
            `🔒 ${rejection.reason}. Se desactivó el bot y no se le enviarán más mensajes ni follow-ups.`
          );

          // Sincronizar etiqueta nativa de WhatsApp Business (🔴 No Interesado o 🚫 Baja)
          try {
            const { WhatsAppLabelManager } = await import('./label_manager.js');
            await WhatsAppLabelManager.syncLeadLabel(this.sock, senderPhone, finalStatus, lead.status);
          } catch {}

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
              status: finalStatus
            });
          } catch {}
          continue;
        }

        // 3.59. Auto-Reactivación Inteligente post-Handoff (Ventana de 24 horas de silencio)
        const { HandoffManager } = await import('../failover/handoff_manager.js');
        const wasAutoReactivated = await HandoffManager.checkAutoReactivation(lead);
        if (wasAutoReactivated) {
          lead.status = 'REPLIED';
          lead.humanTakeoverAt = undefined as any;
        }

        // 3.595. Auto-Reactivación de Leads Archivados/CLOSED_LOST si vuelven a consultar
        if (lead.status === 'CLOSED_LOST') {
          console.log(`🔥 [BaileysEngine] Lead ${senderPhone} estaba en CLOSED_LOST pero volvió a escribir: "${incomingText}". Reactivando automáticamente a REPLIED...`);
          lead.status = 'REPLIED';
          lead.humanTakeoverAt = undefined as any;
          await OutreachRepo.updateLeadStatus(senderPhone, 'REPLIED');
        }

        // 3.6. Comprobar si el lead YA está en estado terminal o control humano (Rompe bucle de ping-pong)
        const isTerminalOrLocked = ['OPT_OUT', 'CLOSED_WON', 'HUMAN_TAKEOVER'].includes(lead.status) || !!lead.humanTakeoverAt;
        if (isTerminalOrLocked) {
          console.log(`🔇 [BaileysEngine] Lead ${senderPhone} en estado terminal (${lead.status}) o control humano. Mensaje guardado en silencio sin respuesta.`);
          await OutreachRepo.addChatMessage(senderPhone, 'user', incomingText);
          await OutreachRepo.updateLeadStatus(senderPhone, lead.status, {
            lastCustomerMessageAt: new Date().toISOString()
          });

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
          continue;
        }

        // 4. Registrar mensaje del usuario en la base de datos (Lead Activo)
        await OutreachRepo.addChatMessage(senderPhone, 'user', incomingText);
        await OutreachRepo.updateLeadStatus(senderPhone, 'REPLIED', {
          lastCustomerMessageAt: new Date().toISOString()
        });

        // 4.05. Despacho Automatizado de Correos Corporativos (Zoho Mail) si el prospecto proporciona su email
        try {
          const { EmailDispatcher } = await import('../email/email_dispatcher.js');
          const extractedEmail = EmailDispatcher.extractEmailFromText(incomingText);
          if (extractedEmail && !EmailDispatcher.hasAlreadyReceivedEmail(lead)) {
            console.log(`📧 [EmailDispatcher] Correo detectado en mensaje de ${senderPhone}: "${extractedEmail}". Generando borrador híbrido...`);
            const draft = await EmailDispatcher.generateEmailDraft(lead, extractedEmail, incomingText);

            // 1. Responder inmediatamente al lead por WhatsApp con tono cálido como asistente virtual
            const leadAckMessage = `¡Excelente! 🙌 Ya le pasé los datos a Kenneth para enviarte la propuesta oficial a tu correo. En breve te estará llegando desde partners@thequantpartners.com 📧🤝`;
            const jid = `${senderPhone}@s.whatsapp.net`;
            await this.sock?.sendMessage(jid, { text: leadAckMessage });
            await OutreachRepo.addChatMessage(senderPhone, 'assistant', leadAckMessage);

            // 2. Notificar inmediatamente a Kenneth para aprobación rápida en 1 clic
            const adminPhone = (settings.adminWhatsAppPhone || process.env.ADMIN_WHATSAPP_PHONE || '51902105668').replace(/[^0-9]/g, '');
            if (adminPhone) {
              const approvalAlert = 
                `📧 *NUEVO CORREO LISTO PARA APROBACIÓN*\n` +
                `━━━━━━━━━━━━━━━━━━━━\n` +
                `🏢 Empresa: *${lead.companyName}*\n` +
                `📱 Teléfono: *+${senderPhone}*\n` +
                `📬 Destinatario: *${extractedEmail}*\n` +
                `📝 Asunto: *${draft.subject}*\n` +
                `━━━━━━━━━━━━━━━━━━━━\n` +
                `📄 *Vista Previa del Correo:*\n` +
                `"${draft.text.substring(0, 260)}..."\n` +
                `━━━━━━━━━━━━━━━━━━━━\n` +
                `👉 *Para enviar ahora:* Responde *aprobar* (o *enviar correo*)\n` +
                `👉 *Para descartar:* Responde *cancelar*`;

              await this.sock?.sendMessage(`${adminPhone}@s.whatsapp.net`, { text: approvalAlert });
              console.log(`📢 [EmailDispatcher] Alerta de aprobación enviada a Kenneth (${adminPhone}).`);
            }
            continue;
          }
        } catch (emailErr: any) {
          console.error('[BaileysEngine] Error procesando correo automático:', emailErr.message);
        }

        // 4.1. Evaluar si el AI Setter debe calificar y responder en 5s
        try {
          const { SetterEngine } = await import('../ai/setter_engine.js');
          const setterRes = await SetterEngine.processMessage(lead, incomingText, matchedService);
          if (setterRes.replyText && setterRes.replyText.trim().length > 0) {
            const jid = `${senderPhone}@s.whatsapp.net`;
            await this.sock?.sendMessage(jid, { text: setterRes.replyText });
            await OutreachRepo.addChatMessage(senderPhone, 'assistant', setterRes.replyText);
            console.log(`🤖 [SetterEngine] Respuesta enviada a ${senderPhone}: "${setterRes.replyText.substring(0, 70)}..."`);
          }
          if (setterRes.isTransferred) {
            // El Setter ya ejecutó el traspaso vía SalesDispatcher y activó HUMAN_TAKEOVER
            continue;
          }
        } catch (setterErr: any) {
          console.error('[BaileysEngine] Error ejecutando SetterEngine:', setterErr.message);
        }

        // 5. Comprobar si está fuera de horario comercial (SÓLO para prospectos Inbound desconocidos, NUNCA para campañas Outbound en caliente)
        const isOutboundLead = lead.serviceId && lead.serviceId !== 'inbound-general' && !!lead.lastOutreachAt;
        const isWorkingHours = this.isWithinWorkingHours(settings);
        if (!isWorkingHours && !isOutboundLead) {
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

        // 6. Enrutamiento inteligente de notificaciones:
        // - Fuera de horario: Notificación inmediata de WhatsApp al asesor (o admin) porque no están en oficina
        // - En horario comercial: Cero spam a WhatsApp. Atención 100% en Dashboard (SSE + Sonido + Push).
        //   Se inicia temporizador SLA de 15 min. Si nadie responde en 15 min, escala a WhatsApp.
        if (!isWorkingHours) {
          const targetPhone = (lead.assignedRepPhone || settings.adminWhatsAppPhone || process.env.ADMIN_WHATSAPP_PHONE || '').replace(/[^0-9]/g, '');
          const repDisplayName = lead.assignedRepName || 'Asesor Asignado';
          const isMetaAd = lead.source === 'meta_ads';
          const sourceLabel = isMetaAd ? '🎯 *NUEVO LEAD DE META ADS (FUERA DE HORARIO)*' : '🌙 *NUEVO MENSAJE DE PROSPECTO (FUERA DE HORARIO)*';
          const campaignLabel = lead.serviceName ? `\n📢 Campaña: *${lead.serviceName}*` : '';

          const alertMsg = 
            `${sourceLabel} (Round Robin: ${repDisplayName})\n\n` +
            `👤 Asesor: *${repDisplayName}*\n` +
            `🏢 Empresa: *${lead.companyName || 'Contacto WhatsApp'}*` +
            `${campaignLabel}\n` +
            `📱 Teléfono: *+${senderPhone}*\n` +
            `💬 Mensaje: "${incomingText}"\n\n` +
            `💡 *QPartner Co-Pilot* ha generado sugerencias tácticas en tu Dashboard:\n` +
            `👉 https://qp-outreach-engine.vercel.app/#chat=${senderPhone}`;

          if (targetPhone) {
            await this.notifyPhone(targetPhone, alertMsg);
          } else {
            await this.notifyAdmin(alertMsg);
          }
        } else {
          // En horario comercial: Silenciar alertas inmediatas de WhatsApp y activar temporizador SLA de 15 min
          SlaAlertManager.getInstance().recordInboundMessage({
            leadPhone: senderPhone,
            incomingText,
            lead,
            onEscalate: async (details) => {
              const countLabel = details.unrepliedCount > 1 ? ` (${details.unrepliedCount} mensajes acumulados sin atender)` : '';
              const campaignLabel = details.serviceName ? `\n📢 Campaña: *${details.serviceName}*` : '';
              const repDisplayName = details.assignedRepName || 'Asesor Asignado';
              const adminPhone = (settings.adminWhatsAppPhone || process.env.ADMIN_WHATSAPP_PHONE || '').replace(/[^0-9]/g, '');
              const repPhone = (details.assignedRepPhone || '').replace(/[^0-9]/g, '');

              const slaAlertMsg = 
                `⚠️ *ALERTA DE SLA: PROSPECTO SIN ATENDER (+15 min)*${countLabel}\n\n` +
                `👤 Asesor Asignado: *${repDisplayName}*\n` +
                `🏢 Empresa: *${details.companyName}*` +
                `${campaignLabel}\n` +
                `📱 Teléfono: *+${details.leadPhone}*\n` +
                `💬 Último Mensaje: "${details.lastMessageText}"\n\n` +
                `⏰ El prospecto escribió hace más de 15 minutos en horario comercial y aún no ha sido atendido en el CRM.\n\n` +
                `👉 Atender de inmediato en el Dashboard:\n` +
                `https://qp-outreach-engine.vercel.app/#chat=${details.leadPhone}`;

              // 1. Notificar primero al asesor asignado
              if (repPhone) {
                await this.notifyPhone(repPhone, slaAlertMsg);
              }

              // 2. Si el asesor es distinto al Director Kenneth (o no tiene teléfono asignado), alertar al Director
              if (adminPhone && adminPhone !== repPhone) {
                const directorMsg = 
                  `🚨 *INCUMPLIMIENTO DE SLA EN EQUIPO COMERCIAL*\n` +
                  `El prospecto asignado a *${repDisplayName}* lleva +15 min sin respuesta en el CRM:\n\n` +
                  slaAlertMsg;
                await this.notifyAdmin(directorMsg);
              } else if (!repPhone && adminPhone) {
                await this.notifyAdmin(slaAlertMsg);
              }
            }
          });
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

        let text =
          content?.conversation ||
          content?.extendedTextMessage?.text ||
          content?.imageMessage?.caption ||
          content?.videoMessage?.caption ||
          '';

        if (!text.trim() && content?.imageMessage) {
          text = '📷 [Comprobante de pago o imagen del producto adjunta]';
        }

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
    return this.sendMessage(telefono, mensaje);
  }

  /**
   * Envía un mensaje individual con validación previa de número (alias sendMessage)
   */
  public async sendMessage(telefono: string, mensaje: string): Promise<{ success: boolean; jid?: string; error?: string }> {
    // Candado Anti-Mensajes Vacíos: eliminar caracteres invisibles/zero-width y validar longitud mínima
    const textoLimpio = (mensaje || '').replace(/[\u200B-\u200D\uFEFF\u200E\u200F\u00A0]/g, '').trim();
    if (!textoLimpio || textoLimpio.length < 15) {
      console.error(`🚨 [BaileysEngine] Rechazado intento de enviar mensaje vacío o sospechosamente corto (${textoLimpio.length} chars) a ${telefono}.`);
      return { success: false, error: 'El mensaje está vacío o es inferior a 15 caracteres legibles.' };
    }

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
      const sentMsg = await this.sock.sendMessage(jid, { text: mensaje });
      if (sentMsg?.key?.id) {
        BaileysEngine.outgoingEngineMsgIds.add(sentMsg.key.id);
        setTimeout(() => BaileysEngine.outgoingEngineMsgIds.delete(sentMsg.key.id!), 60000);
      }
      SlaAlertManager.getInstance().cancelSlaTimer(limpio);
      console.log(`✅ [BaileysEngine] Mensaje entregado a ${limpio}!`);

      if (sentMsg?.key) {
        const alt = ((sentMsg.key as any).remoteJidAlt || '').replace(/[^0-9]/g, '');
        const remote = (sentMsg.key.remoteJid || '').replace(/[^0-9]/g, '');
        const lidCandidate = (sentMsg.key.remoteJid || '').endsWith('@lid') ? remote : ((sentMsg.key as any).remoteJidAlt || '').endsWith('@lid') ? alt : '';
        if (lidCandidate && limpio && lidCandidate !== limpio) {
          BaileysEngine.lidToPhoneCache.set(lidCandidate, limpio);
          BaileysEngine.phoneToLidCache.set(limpio, lidCandidate);
          await OutreachRepo.linkLeadLid(limpio, lidCandidate);
        }
      }

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
   * Envía una tarjeta de contacto interactiva (vCard) por WhatsApp para que el cliente la guarde con 1 clic
   */
  public async sendContactCard(
    telefono: string,
    contactName: string,
    contactPhone: string,
    orgName?: string
  ): Promise<{ success: boolean; jid?: string; error?: string }> {
    if (!this.sock || !this.isReady) {
      return { success: false, error: 'WhatsApp no está conectado o autenticado.' };
    }

    try {
      const limpio = telefono.replace(/[^0-9]/g, '');
      const jid = `${limpio}@s.whatsapp.net`;
      const cleanContactPhone = contactPhone.replace(/[^0-9]/g, '');

      const vcard = 
        'BEGIN:VCARD\n' +
        'VERSION:3.0\n' +
        `FN:${contactName}\n` +
        (orgName ? `ORG:${orgName};\n` : '') +
        `TEL;type=CELL;type=VOICE;waid=${cleanContactPhone}:+${cleanContactPhone}\n` +
        'END:VCARD';

      console.log(`[BaileysEngine] Despachando tarjeta de contacto "${contactName}" a ${limpio}...`);
      await this.sock.sendMessage(jid, {
        contacts: {
          displayName: contactName,
          contacts: [{ vcard }]
        }
      });
      console.log(`✅ [BaileysEngine] Tarjeta de contacto "${contactName}" entregada con éxito a ${limpio}!`);
      return { success: true, jid };
    } catch (err: any) {
      console.error(`❌ [BaileysEngine] Error enviando tarjeta de contacto a ${telefono}:`, err.message);
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
   * Envía un mensaje directo a un teléfono o JID
   */
  public async sendDirectMessage(target: string, message: string): Promise<void> {
    const clean = target.replace(/@[^]+$/, '').replace(/[^0-9]/g, '');
    return this.notifyPhone(clean, message);
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

