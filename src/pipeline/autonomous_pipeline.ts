import { BaileysEngine } from '../whatsapp/baileys_engine.js';
import { MetaCloudEngine } from '../whatsapp/meta_cloud_engine.js';
import { OutscraperScraper } from '../scraper/outscraper_scraper.js';
import { SpintaxEngine } from '../utils/spintax.js';
import { OutreachRepo } from '../db/repo.js';

export class AutonomousPipeline {
  private static isRunning: boolean = false;
  private static loopTimer: NodeJS.Timeout | null = null;
  private static sentTodayCount: number = 0;
  private static sentMorningCount: number = 0;
  private static serviceRoundRobinIndex: number = 0;
  private static currentDay: string = new Date().toISOString().slice(0, 10);
  private static lastScrapeTime: number = 0;
  private static currentQueryIndex: number = 0;
  private static lastScrapedQuery: string = '';
  private static lastScrapedLocation: string = '';
  private static lastScrapedService: string = '';
  private static lastScrapedCount: number = 0;
  private static lastActionWasFollowUp: boolean = true; // Alternancia 50/50: inicializado en true para priorizar frío en el primer tick

  // Circuit Breaker Anti-Ban (Reglas Meta 2026: mitigación de unanswered message counter)
  private static consecutiveUnansweredOutreachCount: number = 0;
  private static circuitBreakerCooldownUntil: number = 0;

  private static dailyReportSentDay: string = '';
  private static lastBillingAlertDate: string = '';

  /**
   * Resetea el contador de no-respuestas cuando un prospecto responde (mitigación Meta 2026)
   */
  public static recordLeadReply(leadPhone?: string): void {
    if (this.consecutiveUnansweredOutreachCount > 0) {
      console.log(`💬 [AutonomousPipeline] Prospecto ${leadPhone ? `(${leadPhone}) ` : ''}respondió. Contador Circuit Breaker reseteado a 0 (era: ${this.consecutiveUnansweredOutreachCount}).`);
      this.consecutiveUnansweredOutreachCount = 0;
    }
  }

  /**
   * Obtiene la hora y minuto actuales en zona horaria oficial Lima (America/Lima / UTC-5)
   */
  public static getLimaTime(): { hour: number; minute: number; timeStr: string } {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Lima',
      hour: 'numeric',
      minute: 'numeric',
      hourCycle: 'h23'
    });
    const parts = formatter.formatToParts(new Date());
    const hour = parseInt(parts.find(p => p.type === 'hour')?.value || '0', 10);
    const minute = parseInt(parts.find(p => p.type === 'minute')?.value || '0', 10);
    return {
      hour,
      minute,
      timeStr: `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
    };
  }

  /**
   * Clasifica regionalmente una campaña (USA vs PERÚ vs GLOBAL)
   */
  public static getCampaignRegion(service: any): 'USA' | 'PERU' | 'GLOBAL' {
    const locs = ((service.targetLocations || []).join(' ') + ' ' + (service.apifyQueries || []).join(' ')).toLowerCase();
    const id = (service.id || '').toLowerCase();
    const name = (service.name || '').toLowerCase();

    if (
      locs.includes('usa') ||
      locs.includes('florida') ||
      locs.includes('texas') ||
      locs.includes('miami') ||
      locs.includes('orlando') ||
      locs.includes('tampa') ||
      locs.includes('dallas') ||
      locs.includes('houston') ||
      id.includes('-usa') ||
      name.includes('usa')
    ) {
      return 'USA';
    }
    if (
      locs.includes('peru') ||
      locs.includes('perú') ||
      locs.includes('lima') ||
      id.includes('peru') ||
      id.includes('licitaciones') ||
      id.includes('infraestructura') ||
      name.includes('perú') ||
      name.includes('peru')
    ) {
      return 'PERU';
    }
    return 'GLOBAL';
  }

  /**
   * Inicia el orquestador continuo autónomo
   */
  public static start(): void {
    if (this.isRunning) return;
    this.isRunning = true;
    console.log('🤖 [AutonomousPipeline] Motor comercial autónomo INICIADO.');
    this.scheduleNextTick(3000);
  }

  /**
   * Detiene el orquestador
   */
  public static stop(): void {
    this.isRunning = false;
    if (this.loopTimer) {
      clearTimeout(this.loopTimer);
      this.loopTimer = null;
    }
    console.log('🛑 [AutonomousPipeline] Motor comercial autónomo DETENIDO.');
  }

  public static getStatus() {
    const lima = this.getLimaTime();
    let currentSlot = 'FUERA_DE_HORARIO';
    if (lima.hour >= 9 && lima.hour < 13) {
      currentSlot = 'PERU_MORNING';
    } else if (lima.hour === 13) {
      currentSlot = 'LUNCH_PAUSE';
    } else if (lima.hour >= 14 && lima.hour < 19) {
      currentSlot = 'PERU_AFTERNOON';
    }

    return {
      isRunning: this.isRunning,
      sentToday: this.sentTodayCount,
      sentMorning: this.sentMorningCount,
      limaTime: lima.timeStr,
      currentSlot,
      day: this.currentDay,
      lastScrapeTime: this.lastScrapeTime ? new Date(this.lastScrapeTime).toISOString() : null
    };
  }

  private static scheduleNextTick(delayMs: number): void {
    if (!this.isRunning) return;
    if (this.loopTimer) clearTimeout(this.loopTimer);
    this.loopTimer = setTimeout(() => this.tick().catch((err) => {
      console.error('❌ [AutonomousPipeline] Error en ciclo:', err.message);
      this.scheduleNextTick(30000);
    }), delayMs);
  }

  /**
   * Ciclo principal del pipeline autónomo
   */
  private static async tick(): Promise<void> {
    if (!this.isRunning) return;

    // Resetear contador diario a medianoche
    const today = new Date().toISOString().slice(0, 10);
    if (today !== this.currentDay) {
      this.currentDay = today;
      this.sentTodayCount = 0;
      this.sentMorningCount = 0;
      this.dailyReportSentDay = '';
    }

    // 1. Obtener configuración
    const settings = await OutreachRepo.getSettings();
    if (!settings.isAutonomousActive) {
      console.log('⏸️ [AutonomousPipeline] Prospección autónoma pausada en configuración.');
      this.scheduleNextTick(60000);
      return;
    }

    // 1.5. Comprobar Circuit Breaker Anti-Ban (Reglas Meta 2026: mitigación de unanswered counter)
    if (Date.now() < this.circuitBreakerCooldownUntil) {
      const remainingMin = Math.ceil((this.circuitBreakerCooldownUntil - Date.now()) / (60 * 1000));
      console.log(`🛡️ [AutonomousPipeline - Circuit Breaker] En pausa preventiva de enfriamiento (${remainingMin} min restantes). IA Inbound permanece activa 24/7.`);
      this.scheduleNextTick(5 * 60 * 1000);
      return;
    }

    const provider = settings.whatsappProvider || 'direct_qr';
    if (provider === 'meta_cloud_api') {
      const isConfigured = await MetaCloudEngine.isConfigured();
      if (!isConfigured) {
        console.log('⏳ [AutonomousPipeline] Esperando que Meta WhatsApp Cloud API esté configurada...');
        this.scheduleNextTick(15000);
        return;
      }
    } else {
      const whatsapp = BaileysEngine.getInstance();
      const waStatus = whatsapp.getStatus();
      if (!waStatus.isReady) {
        console.log('⏳ [AutonomousPipeline] Esperando que WhatsApp se conecte...');
        this.scheduleNextTick(15000);
        return;
      }
    }

    // 2. Horario comercial por bloques y zona horaria de Lima (UTC-5)
    const limaTime = this.getLimaTime();
    const currentHour = limaTime.hour;
    const currentMinute = limaTime.minute;

    let activeRegion: 'USA' | 'PERU' | null = null;
    let slotName = '';

    if (currentHour >= 9 && currentHour < 13) {
      activeRegion = 'PERU';
      slotName = 'Mañanas Perú (Todo el Perú)';
    } else if (currentHour === 13) {
      console.log(`🍽️ [AutonomousPipeline] Pausa de almuerzo anti-bot (1:00 PM - 2:00 PM Lima, hora actual: ${limaTime.timeStr}). Cero envíos en frío. IA Inbound permanece activa 24/7.`);
      this.scheduleNextTick(5 * 60 * 1000);
      return;
    } else if (currentHour >= 14 && currentHour < 19) {
      activeRegion = 'PERU';
      slotName = 'Tardes Perú (Todo el Perú)';
    } else {
      // Fuera de horario comercial
      if ((currentHour >= 19 || currentHour >= settings.endHour) && this.dailyReportSentDay !== today) {
        await this.sendNightlyReport(today, settings);
      }

      console.log(`🌙 [AutonomousPipeline] Fuera de horario comercial (${limaTime.timeStr} Lima). Horarios Perú: 09:00-13:00 y 14:00-19:00. En pausa.`);
      this.scheduleNextTick(10 * 60 * 1000); // esperar 10 minutos
      return;
    }

    // 2.5. Comprobar alertas de facturación mensual Railway (Preventiva día 14, Cobro día 17 y semanal)
    await this.checkBillingAlert(today, settings);

    // 3. Comprobar recordatorios de citas agendadas próximas (Anti No-Show)
    const upcomingMeetings = await OutreachRepo.getUpcomingMeetingsForReminder(2);
    if (upcomingMeetings.length > 0) {
      const meetingLead = upcomingMeetings[0];
      await this.dispatchMeetingReminder(meetingLead);
      this.scheduleNextTick(15000);
      return;
    }

    // 4. Obtener todos los servicios activos y filtrar por la región del bloque actual
    const allServices = await OutreachRepo.getServices();
    const activeServices = allServices.filter(s => s.isActive && (s.type === 'OUTBOUND' || !s.type) && s.outreachTemplate && s.outreachTemplate.trim().length > 0);
    if (activeServices.length === 0) {
      console.log('⚠️ [AutonomousPipeline] No hay servicios activos configurados.');
      this.scheduleNextTick(60000);
      return;
    }

    const regionalServices = activeServices.filter(s => {
      const reg = AutonomousPipeline.getCampaignRegion(s);
      return reg === activeRegion || reg === 'GLOBAL';
    });

    if (regionalServices.length === 0) {
      console.log(`⚠️ [AutonomousPipeline] Bloque activo: ${slotName} (${activeRegion}), pero no hay campañas activas para esta región.`);
      this.scheduleNextTick(60000);
      return;
    }

    const effectiveDailyLimit = settings.dailyLimit || 35;
    const effectiveSettings = { ...settings, dailyLimit: effectiveDailyLimit };

    // Comprobar cuota diaria anti-ban global
    if (this.sentTodayCount >= effectiveDailyLimit) {
      console.log(`🛡️ [AutonomousPipeline] Cuota diaria de seguridad alcanzada (${this.sentTodayCount}/${effectiveDailyLimit} mensajes hoy | Normal: ${settings.dailyLimit}). Detenido hasta mañana.`);
      this.scheduleNextTick(15 * 60 * 1000);
      return;
    }

    // Balanceo de cuota matutina para reservar cupos para la tarde en Perú
    const morningQuota = Math.floor(effectiveDailyLimit / 2);
    if (currentHour < 13 && this.sentMorningCount >= morningQuota) {
      console.log(`🛡️ [AutonomousPipeline] Cuota matutina alcanzada (${this.sentMorningCount}/${morningQuota} mensajes). Pausando envíos en frío hasta el bloque de la tarde (2:00 PM).`);
      this.scheduleNextTick(10 * 60 * 1000);
      return;
    }

    // 6. Monitorear buffer de prospectos no contactados por campaña activa en la región activa
    const timeSinceLastScrape = Date.now() - this.lastScrapeTime;
    const scrapeCooldownMs = 5 * 60 * 1000; // 5 minutos para auto-alimentar la cola constantemente
    if (timeSinceLastScrape > scrapeCooldownMs) {
      for (const s of regionalServices) {
        if (!s.apifyQueries || s.apifyQueries.length === 0) continue;
        const uncontactedCount = await OutreachRepo.countUncontactedLeads(s.id);
        if (uncontactedCount < 15) {
          console.log(`🔄 [AutonomousPipeline - ${activeRegion}] Buffer bajo para "${s.name}" (${uncontactedCount} prospectos). Auto-alimentando cola desde Outscraper...`);
          await this.triggerScrape(s);
          break; // Un scrape por ciclo
        }
      }
    }

    // 7. Evaluar Cola A: Prospectos pendientes de prospección en frío (DISCOVERED)
    let coldLeadCandidate: any = null;
    let coldServiceCandidate: any = null;
    let nextRoundRobinIndex = this.serviceRoundRobinIndex;

    const numServices = regionalServices.length;
    for (let i = 0; i < numServices; i++) {
      const idx = (this.serviceRoundRobinIndex + i) % numServices;
      const candidateService = regionalServices[idx];
      const found = await OutreachRepo.getLeadsForOutreach(candidateService.id, 1);
      if (found.length > 0) {
        coldLeadCandidate = found[0];
        coldServiceCandidate = candidateService;
        nextRoundRobinIndex = (idx + 1) % numServices;
        break;
      }
    }

    // 8. Evaluar Cola B: Seguimientos pendientes (>48h sin respuesta o >24h ghosting conversacional)
    let followUpLead: any = null;
    let followUpService: any = null;
    let isConversationalFollowUp = false;

    for (const s of regionalServices) {
      const due = await OutreachRepo.getLeadsForFollowUp(s.id, 1);
      if (due.length > 0) {
        followUpLead = due[0];
        followUpService = s;
        break;
      }
    }

    if (!followUpLead) {
      for (const s of regionalServices) {
        const dueReengage = await OutreachRepo.getLeadsForConversationalFollowUp(s.id, 1);
        if (dueReengage.length > 0) {
          followUpLead = dueReengage[0];
          followUpService = s;
          isConversationalFollowUp = true;
          break;
        }
      }
    }

    // 9. Interleaving 50/50: Despacho alternado 1 a 1 entre prospección en frío y seguimiento
    const hasCold = !!coldLeadCandidate;
    const hasFollowUp = !!followUpLead;

    if (!hasCold && !hasFollowUp) {
      console.log(`⚠️ [AutonomousPipeline - ${activeRegion}] Cola de prospectos pendientes vacía (sin frío ni seguimientos) para el bloque ${slotName}.`);

      const timeSinceScrape = Date.now() - this.lastScrapeTime;
      const emptyScrapeCooldownMs = 15 * 60 * 1000; // Cooldown de seguridad de 15 minutos para blindar saldo de Outscraper

      if (timeSinceScrape > emptyScrapeCooldownMs) {
        console.log(`🔄 [AutonomousPipeline - ${activeRegion}] Disparando recarga controlada desde Outscraper...`);
        for (const s of regionalServices) {
          if (s.apifyQueries && s.apifyQueries.length > 0) {
            await this.triggerScrape(s);
            break;
          }
        }
      } else {
        const remainingMin = Math.ceil((emptyScrapeCooldownMs - timeSinceScrape) / 60000);
        console.log(`🛡️ [AutonomousPipeline] Cooldown de scraping activo (${remainingMin} min restantes) para blindar saldo de Outscraper.`);
      }

      // Pausa prudente de 5 minutos (NUNCA 20 segundos para evitar bucles de consumo)
      this.scheduleNextTick(5 * 60 * 1000);
      return;
    }

    // Si ambos tienen prospectos disponibles, alternar estrictamente 1 a 1
    let dispatchCold = false;
    if (hasCold && hasFollowUp) {
      if (this.lastActionWasFollowUp) {
        dispatchCold = true;
        console.log(`⚖️ [AutonomousPipeline - ${activeRegion}] Interleaving 50/50: Turno de NUEVO CONTACTO EN FRÍO (último despacho fue seguimiento).`);
      } else {
        dispatchCold = false;
        console.log(`⚖️ [AutonomousPipeline - ${activeRegion}] Interleaving 50/50: Turno de SEGUIMIENTO (último despacho fue contacto en frío).`);
      }
    } else if (hasCold) {
      dispatchCold = true;
      console.log(`🚀 [AutonomousPipeline - ${activeRegion}] Cola de seguimientos al día. Despachando NUEVO CONTACTO EN FRÍO.`);
    } else {
      dispatchCold = false;
      console.log(`🔁 [AutonomousPipeline - ${activeRegion}] Cola en frío al día o en recarga. Despachando SEGUIMIENTO.`);
    }

    if (dispatchCold) {
      this.lastActionWasFollowUp = false;
      this.serviceRoundRobinIndex = nextRoundRobinIndex;
      await this.dispatchLead(coldLeadCandidate, coldServiceCandidate, effectiveSettings, activeRegion);
      return;
    } else {
      this.lastActionWasFollowUp = true;
      if (isConversationalFollowUp) {
        await this.dispatchConversationalFollowUp(followUpLead, followUpService, effectiveSettings, activeRegion);
      } else {
        await this.dispatchFollowUp(followUpLead, followUpService, effectiveSettings, activeRegion);
      }
      return;
    }
  }

  /**
   * Extrae la ciudad o zona de forma limpia a partir de la dirección del prospecto
   */
  public static extractCity(address?: string | null): string {
    if (!address || typeof address !== 'string') return 'su zona';
    const trimmed = address.trim();
    if (!trimmed) return 'su zona';

    const parts = trimmed.split(',').map(p => p.trim());
    if (parts.length >= 2) {
      const candidate = parts.length >= 3 ? parts[parts.length - 2] : parts[0];
      let cleanCity = candidate.replace(/^(ste|suite|apt|unit|floor|fl|#)\s*\S+/i, '').trim();
      cleanCity = cleanCity.replace(/\s+\d{4,5}.*$/, '').trim();
      if (cleanCity && cleanCity.length > 2 && cleanCity.length < 35 && !/^\d+$/.test(cleanCity)) {
        return cleanCity;
      }
    }
    return 'su zona';
  }

  /**
   * Despacha mensaje de seguimiento (Follow-up 1 o 2) con pausa anti-ban
   */
  private static async dispatchFollowUp(lead: any, service: any, settings: any, activeRegion?: 'USA' | 'PERU' | null): Promise<void> {
    const whatsapp = BaileysEngine.getInstance();
    const currentCount = lead.followUpCount || 0;
    const nextCount = currentCount + 1;

    let template = nextCount === 1 ? service.followUpTemplate1 : service.followUpTemplate2;
    if (!template) {
      template = nextCount === 1
        ? 'Hola {{name}}, un saludo breve. ¿Pudieron revisar la consulta anterior o los agarro en mala semana?'
        : 'Hola {{name}}, solo para cerrar este contacto con respeto: si más adelante desean evaluar la solución, quedo a su disposición por aquí. Saludos cordiales!';
    }

    const city = this.extractCity(lead.address);
    const sector = lead.category ? lead.category.trim() : 'su sector';

    let message = template;
    message = message.replace(/{{\s*name\s*}}|\{\s*name\s*\}/gi, lead.companyName);
    message = message.replace(/{{\s*empresa\s*}}|\{\s*empresa\s*\}/gi, lead.companyName);
    message = message.replace(/{{\s*phone\s*}}|\{\s*phone\s*\}/gi, lead.phone);
    message = message.replace(/{{\s*(city|location|ciudad|zona)\s*}}|\{\s*(city|location|ciudad|zona)\s*\}/gi, city);
    message = message.replace(/{{\s*(sector|niche|nicho|rubro)\s*}}|\{\s*(sector|niche|nicho|rubro)\s*\}/gi, sector);
    message = message.replace(/{{\s*saludo\s*}}|\{\s*saludo\s*\}/gi, 'Hola');
    message = message.replace(/^(Buenas tardes|Buenos días|Buenas noches)/i, 'Hola');

    console.log(`🔁 [AutonomousPipeline - ${activeRegion || 'OUTREACH'}] Despachando Follow-up #${nextCount} a ${lead.companyName} (${lead.phone})...`);
    const provider = settings.whatsappProvider || 'direct_qr';
    let result: { success: boolean; error?: string };

    if (provider === 'meta_cloud_api') {
      const metaRes = await MetaCloudEngine.sendTextMessage(lead.phone, message);
      result = { success: metaRes.success, error: metaRes.error };
    } else {
      const whatsapp = BaileysEngine.getInstance();
      result = await whatsapp.send(lead.phone, message);
    }

    if (result.success) {
      this.sentTodayCount++;
      const currentLima = AutonomousPipeline.getLimaTime();
      if (currentLima.hour < 13) {
        this.sentMorningCount++;
      }
      await OutreachRepo.updateLeadFollowUp(lead.phone, nextCount);
      await OutreachRepo.addChatMessage(lead.phone, 'assistant', message);
      console.log(`✅ [AutonomousPipeline - ${activeRegion || 'OUTREACH'}] Follow-up #${nextCount} entregado a ${lead.companyName}! (${this.sentTodayCount}/${settings.dailyLimit} hoy)`);

      const min = settings.minDelaySeconds || 180;
      const max = settings.maxDelaySeconds || 300;
      const randomDelay = Math.floor(Math.random() * (max - min + 1)) + min;
      console.log(`🛡️ [AutonomousPipeline] Pausa de seguridad de ${randomDelay}s tras follow-up...`);
      this.scheduleNextTick(randomDelay * 1000);
    } else {
      console.warn(`⚠️ [AutonomousPipeline] Error en follow-up a ${lead.phone}: ${result.error}`);
      this.scheduleNextTick(15000);
    }
  }

  /**
   * Despacha seguimiento conversacional anti-ghosting a prospectos en REPLIED que dejaron de contestar (>24h)
   */
  private static async dispatchConversationalFollowUp(lead: any, service: any, settings: any, activeRegion?: 'USA' | 'PERU' | null): Promise<void> {
    const provider = settings.whatsappProvider || 'direct_qr';
    const company = lead.companyName ? lead.companyName.trim() : '';
    const greeting = company ? `¡Hola al equipo de ${company}! 🙌` : '¡Hola! 🙌';
    const message = `${greeting} Te escribe brevemente el asistente virtual de Kenneth. Quería consultarles si tuvieron oportunidad de revisar lo que conversamos ayer, o si les gustaría que coordinemos una videollamada de 10 min por Meet esta semana para mostrárselo funcionando en pantalla 🤝`;

    console.log(`🔔 [AutonomousPipeline - ${activeRegion || 'ANTI-GHOSTING'}] Despachando seguimiento anti-ghosting a ${lead.companyName} (${lead.phone})...`);
    let result: { success: boolean; error?: string };

    if (provider === 'meta_cloud_api') {
      const metaRes = await MetaCloudEngine.sendTextMessage(lead.phone, message);
      result = { success: metaRes.success, error: metaRes.error };
    } else {
      const whatsapp = BaileysEngine.getInstance();
      result = await whatsapp.send(lead.phone, message);
    }

    if (result.success) {
      this.sentTodayCount++;
      const currentLima = AutonomousPipeline.getLimaTime();
      if (currentLima.hour < 13) {
        this.sentMorningCount++;
      }
      await OutreachRepo.updateLeadConversationalFollowUp(lead.phone);
      await OutreachRepo.addChatMessage(lead.phone, 'assistant', message);
      console.log(`✅ [AutonomousPipeline - ${activeRegion || 'ANTI-GHOSTING'}] Seguimiento anti-ghosting entregado a ${lead.companyName}! (${this.sentTodayCount}/${settings.dailyLimit} hoy)`);

      const min = settings.minDelaySeconds || 180;
      const max = settings.maxDelaySeconds || 300;
      const randomDelay = Math.floor(Math.random() * (max - min + 1)) + min;
      console.log(`🛡️ [AutonomousPipeline] Pausa de seguridad de ${randomDelay}s tras seguimiento anti-ghosting...`);
      this.scheduleNextTick(randomDelay * 1000);
    } else {
      console.warn(`⚠️ [AutonomousPipeline] Error en seguimiento anti-ghosting a ${lead.phone}: ${result.error}`);
      this.scheduleNextTick(15000);
    }
  }

  /**
   * Despacha recordatorio automático 2h antes de la cita (Anti No-Show)
   */
  private static async dispatchMeetingReminder(lead: any): Promise<void> {
    const settings = await OutreachRepo.getSettings();
    const provider = settings.whatsappProvider || 'direct_qr';
    const reminderMsg = `Hola al equipo de *${lead.companyName}*, le saluda Kenneth de The Quant Partners.\n\nLe escribo para confirmar nuestra sesión técnica programada para hoy. ¿Me confirma si todo sigue en pie para conectarnos a tiempo? ¡Un saludo!`;

    console.log(`⏰ [AutonomousPipeline] Enviando recordatorio Anti No-Show a ${lead.companyName} (${lead.phone})...`);
    let result: { success: boolean; error?: string };

    if (provider === 'meta_cloud_api') {
      const metaRes = await MetaCloudEngine.sendTextMessage(lead.phone, reminderMsg);
      result = { success: metaRes.success, error: metaRes.error };
    } else {
      const whatsapp = BaileysEngine.getInstance();
      result = await whatsapp.send(lead.phone, reminderMsg);
    }

    if (result.success) {
      await OutreachRepo.addChatMessage(lead.phone, 'assistant', reminderMsg);
      const customFields = { ...(lead.customFields || {}), reminderSent: true };
      await OutreachRepo.updateLeadSchedule(lead.phone, lead.scheduledMeetingAt, customFields);
      console.log(`✅ [AutonomousPipeline] Recordatorio entregado a ${lead.companyName}!`);
    }
  }

  /**
   * Envía el reporte ejecutivo consolidado de la jornada al WhatsApp de Kenneth
   */
  private static async sendNightlyReport(today: string, settings: any): Promise<void> {
    try {
      this.dailyReportSentDay = today;
      const activity = await OutreachRepo.getDailyActivity(today);
      const stats = await OutreachRepo.getStats();

      const report = `📊 *REPORTE DIARIO DE PROSPECCIÓN QP* (${today})

• *Mensajes enviados hoy:* ${activity.sentCount}
• *Respuestas de prospectos:* ${activity.repliedCount}
• *Reuniones agendadas:* ${activity.meetingsCount}

📈 *Embudo Global:*
• En cola: ${stats.discovered}
• Contactados: ${stats.outreachSent}
• En seguimiento: ${stats.followUpSent}
• Calificados / Cierres: ${stats.qualified + stats.closedWon}

🌙 *El motor ha entrado en pausa nocturna hasta las ${settings.startHour}:00 AM.*`;

      const whatsapp = BaileysEngine.getInstance();
      await whatsapp.notifyAdmin(report);
      console.log('📊 [AutonomousPipeline] Reporte diario nocturno despachado a Kenneth.');
    } catch (err: any) {
      console.error('[AutonomousPipeline] Error enviando reporte nocturno:', err.message);
    }
  }

  /**
   * Envía alertas preventivas y de pago mensual del servidor Railway al WhatsApp de Kenneth
   */
  private static async checkBillingAlert(today: string, settings: any): Promise<void> {
    if (this.lastBillingAlertDate === today) return;

    const now = new Date();
    const dayOfMonth = now.getDate();
    const currentHour = now.getHours();

    // Solo enviar durante el horario diurno (10am - 6pm) para no interrumpir
    if (currentHour < 10 || currentHour > 18) return;

    const whatsapp = BaileysEngine.getInstance();
    if (!whatsapp.getStatus().isReady) return;

    // 1. Día 14 de cada mes: Alerta preventiva (3 días antes del corte del 17)
    if (dayOfMonth === 14) {
      this.lastBillingAlertDate = today;
      const msg = `🔔 *AVISO PREVENTIVO DE FACTURACIÓN RAILWAY*\n\nHola Kenneth, te recuerdo que en 3 días (*día 17*) se procesará la renovación y cobro mensual de tu servidor en Railway.\n\n💡 *Recomendación:* Verifica que tu tarjeta vinculada tenga saldo disponible para que el motor de adquisición y WhatsApp sigan operando 24/7 sin interrupciones.\n\nPuedes revisar el consumo actual en:\nhttps://railway.com/dashboard`;
      await whatsapp.notifyAdmin(msg);
      console.log('🔔 [AutonomousPipeline] Alerta preventiva de facturación (Día 14) enviada a Kenneth por WhatsApp.');
    }

    // 2. Día 17 de cada mes: Recordatorio del día de cobro
    if (dayOfMonth === 17) {
      this.lastBillingAlertDate = today;
      const msg = `💳 *RECORDATORIO DE PAGO RAILWAY (HOY)*\n\nHola Kenneth, hoy *día 17* es la fecha oficial de cobro mensual de tu infraestructura en Railway.\n\nRevisa el comprobante y factura en tu dashboard:\nhttps://railway.com/dashboard/billing`;
      await whatsapp.notifyAdmin(msg);
      console.log('💳 [AutonomousPipeline] Recordatorio de cobro mensual (Día 17) enviado a Kenneth por WhatsApp.');
    }

    // 3. Resumen semanal cada domingo a las 11 AM
    if (now.getDay() === 0 && currentHour === 11 && this.lastBillingAlertDate !== today) {
      this.lastBillingAlertDate = today;
      const daysUntilBilling = dayOfMonth <= 17 ? (17 - dayOfMonth) : (new Date(now.getFullYear(), now.getMonth() + 1, 17).getDate() + (30 - dayOfMonth));
      const weeklyMsg = `⚙️ *REPORTE SEMANAL DE INFRAESTRUCTURA QP*\n\n• *Servidor Railway:* gateway (● Online)\n• *Próximo cobro Railway:* Día 17 (en ~${daysUntilBilling} días)\n• *Estado WhatsApp:* Conectado 24/7\n• *Otros servicios apagados:* GoogleMaker, Infradraw, Pilot-bot, Licitaciones (Consumo en $0.00)\n\nTodo operando con normalidad.`;
      await whatsapp.notifyAdmin(weeklyMsg);
      console.log('⚙️ [AutonomousPipeline] Reporte semanal de infraestructura enviado a Kenneth.');
    }
  }

  /**
   * Despacha el mensaje de prospección con plantilla y pausa anti-ban
   */
  private static async dispatchLead(lead: any, service: any, settings: any, activeRegion?: 'USA' | 'PERU' | null): Promise<void> {
    // Selección A/B Testing determinista
    let chosenTemplate = service.outreachTemplate || '';
    let variant: 'A' | 'B' = 'A';

    const tmplB = service.outreachTemplateB || (service.outreachTemplate?.includes('===SPLIT_B===') ? service.outreachTemplate.split('===SPLIT_B===')[1]?.trim() : null);
    const tmplA = service.outreachTemplate?.includes('===SPLIT_B===') ? service.outreachTemplate.split('===SPLIT_B===')[0]?.trim() : service.outreachTemplate;

    if (tmplB && tmplB.length > 0) {
      const leadNum = Number(lead.id) || (lead.phone ? parseInt(lead.phone.slice(-2), 10) : 0);
      variant = leadNum % 2 === 0 ? 'A' : 'B';
      chosenTemplate = variant === 'A' ? tmplA : tmplB;
    }

    // Aplicar motor de Spintax dinámico y humanización (Reglas Anti-Ban Meta 2026)
    let message = SpintaxEngine.humanize(chosenTemplate, lead);
    const city = this.extractCity(lead.address);
    const sector = lead.category ? lead.category.trim() : 'su sector';

    message = message.replace(/{{\s*name\s*}}|\{\s*name\s*\}/gi, lead.companyName);
    message = message.replace(/{{\s*empresa\s*}}|\{\s*empresa\s*\}/gi, lead.companyName);
    message = message.replace(/{{\s*phone\s*}}|\{\s*phone\s*\}/gi, lead.phone);
    message = message.replace(/{{\s*(city|location|ciudad|zona)\s*}}|\{\s*(city|location|ciudad|zona)\s*\}/gi, city);
    message = message.replace(/{{\s*(sector|niche|nicho|rubro)\s*}}|\{\s*(sector|niche|nicho|rubro)\s*\}/gi, sector);
    message = message.replace(/{{\s*saludo\s*}}|\{\s*saludo\s*\}/gi, 'Hola');

    // Normalización de saludo atemporal (evita desfases "buenas tardes" vs "buenos días")
    message = message.replace(/^(Buenas tardes|Buenos días|Buenas noches)/i, 'Hola');

    if (!message || message.trim().length === 0) {
      console.error(`🚨 [AutonomousPipeline] ERROR CRÍTICO: Mensaje vacío para lead ${lead.companyName} (${lead.phone}). Envío ABORTADO.`);
      await OutreachRepo.updateLeadStatus(lead.phone, 'CLOSED_LOST');
      this.scheduleNextTick(5000);
      return;
    }

    console.log(`🚀 [AutonomousPipeline - ${activeRegion || 'OUTREACH'}] Despachando prospección (Variante ${variant}) a ${lead.companyName} (${lead.phone})...`);

    const provider = settings.whatsappProvider || 'direct_qr';
    let result: { success: boolean; error?: string };

    if (provider === 'meta_cloud_api') {
      const metaRes = await MetaCloudEngine.sendTextMessage(lead.phone, message);
      result = { success: metaRes.success, error: metaRes.error };
    } else {
      const whatsapp = BaileysEngine.getInstance();
      result = await whatsapp.send(lead.phone, message);
    }

    if (result.success) {
      this.sentTodayCount++;
      const currentLima = AutonomousPipeline.getLimaTime();
      if (currentLima.hour < 13) {
        this.sentMorningCount++;
      }
      this.consecutiveUnansweredOutreachCount++;
      console.log(`🛡️ [AutonomousPipeline] Contador de mensajes consecutivos sin respuesta: ${this.consecutiveUnansweredOutreachCount}/10`);

      if (this.consecutiveUnansweredOutreachCount >= 10) {
        // Disparar Circuit Breaker preventivo de 45 minutos (Meta 2026 Anti-Ban)
        const cooldownMinutes = 45;
        this.circuitBreakerCooldownUntil = Date.now() + cooldownMinutes * 60 * 1000;
        console.warn(`🚨 [AutonomousPipeline - Circuit Breaker] 10 mensajes enviados consecutivamente sin respuesta. Activando pausa preventiva de enfriamiento de ${cooldownMinutes} minutos.`);

        const whatsappAdmin = BaileysEngine.getInstance();
        whatsappAdmin.notifyAdmin(`🛡️ *CIRCUIT BREAKER PREVENTIVO META ACTIVADO*\n\nSe han enviado 10 mensajes consecutivos en frío sin respuesta aún.\n\nPara blindar tu número de WhatsApp ante el algoritmo de Meta (anti-spam 2026), el motor ha entrado en una pausa preventiva de enfriamiento de *45 minutos*.\n\n• *La IA Inbound y atención a clientes siguen activas 24/7*.\n• El outbound se reanudará automáticamente (o antes si un prospecto responde).`).catch(() => {});
      }

      await OutreachRepo.updateLeadStatus(lead.phone, 'OUTREACH_SENT');
      await OutreachRepo.updateLeadCustomFields(lead.phone, { abVariant: variant });
      await OutreachRepo.addChatMessage(lead.phone, 'assistant', message);
      const morningStr = currentLima.hour < 13 ? `, Mañana: ${this.sentMorningCount}/${Math.floor(settings.dailyLimit / 2)}` : '';
      console.log(`✅ [AutonomousPipeline - ${activeRegion || 'OUTREACH'}] Enviado con éxito a ${lead.companyName} (Variante ${variant})! (${this.sentTodayCount}/${settings.dailyLimit} hoy${morningStr})`);

      // Pausa aleatoria anti-ban entre minDelaySeconds y maxDelaySeconds (ej. 180s - 300s)
      const min = settings.minDelaySeconds || 180;
      const max = settings.maxDelaySeconds || 300;
      const randomDelay = Math.floor(Math.random() * (max - min + 1)) + min;

      console.log(`🛡️ [AutonomousPipeline] Pausa de seguridad anti-ban de ${randomDelay} segundos (~${(randomDelay / 60).toFixed(1)} min)...`);
      this.scheduleNextTick(randomDelay * 1000);
    } else {
      console.warn(`⚠️ [AutonomousPipeline] Error al enviar a ${lead.phone}: ${result.error}. Marcando como INVALID_PHONE.`);
      await OutreachRepo.updateLeadStatus(lead.phone, 'INVALID_PHONE');
      // Pausa corta de 15 segundos si el número no tenía WhatsApp
      this.scheduleNextTick(15000);
    }
  }

  /**
   * Ejecuta scraping en Outscraper rotando queries y ubicaciones
   */
  public static async triggerScrape(service: any): Promise<{ inserted: number; skipped: number }> {
    this.lastScrapeTime = Date.now();

    const queries = service.apifyQueries && service.apifyQueries.length > 0 ? service.apifyQueries : ['proveedores b2b lima'];
    const locations = service.targetLocations && service.targetLocations.length > 0 ? service.targetLocations : ['Lima, Peru'];

    const query = queries[this.currentQueryIndex % queries.length];
    const location = locations[this.currentQueryIndex % locations.length];
    this.currentQueryIndex++;

    const isUSA = !!(location + ' ' + query).toLowerCase().match(/\b(usa|united states|eeuu|fl|florida|miami|doral|orlando|tampa|kissimmee|tx|texas|houston|dallas|austin|ny|new york|ca|california)\b/);
    const countryCode = isUSA ? 'US' : 'PE';

    try {
      console.log(`📡 [AutonomousPipeline] Ejecutando Outscraper para "${query}" en "${location}" (Región: ${countryCode})...`);
      const scraped = await OutscraperScraper.scrapeGoogleMaps({
        query,
        location,
        limit: 25,
        region: countryCode
      });

      const { inserted, skipped } = await OutreachRepo.saveLeadsFromScraper(service.id, scraped);
      this.lastScrapedQuery = query;
      this.lastScrapedLocation = location;
      this.lastScrapedService = service.name;
      this.lastScrapedCount = inserted;

      console.log(`✅ [AutonomousPipeline] Scraping finalizado con Outscraper para "${service.name}": ${inserted} prospectos nuevos insertados, ${skipped} omitidos/duplicados.`);
      return { inserted, skipped };
    } catch (err: any) {
      console.error('❌ [AutonomousPipeline] Fallo al raspar Outscraper:', err.message);
      return { inserted: 0, skipped: 0 };
    }
  }

  /**
   * Obtiene diagnóstico completo en vivo del scraper y estado de buffers por campaña
   */
  public static async getScraperStatus(): Promise<{
    isPipelineRunning: boolean;
    isAutonomousConfigured: boolean;
    engine: string;
    lastScrapeTime: number;
    lastScrapedQuery: string;
    lastScrapedLocation: string;
    lastScrapedService: string;
    lastScrapedCount: number;
    consecutiveUnanswered: number;
    circuitBreakerActive: boolean;
    circuitBreakerCooldownRemainingMinutes: number;
    campaignBuffers: Array<{
      id: string;
      name: string;
      region: 'USA' | 'PERU' | 'GLOBAL';
      uncontacted: number;
      isBufferLow: boolean;
      queries: string[];
    }>;
  }> {
    const settings = await OutreachRepo.getSettings();
    const services = await OutreachRepo.getServices();
    const activeServices = services.filter(s => s.isActive && (s.type === 'OUTBOUND' || !s.type));

    const campaignBuffers: any[] = [];
    for (const s of activeServices) {
      const count = await OutreachRepo.countUncontactedLeads(s.id);
      const region = this.getCampaignRegion(s);
      campaignBuffers.push({
        id: s.id,
        name: s.name,
        region,
        uncontacted: count,
        isBufferLow: count < 15,
        queries: s.apifyQueries || []
      });
    }

    const cooldownRemaining = this.circuitBreakerCooldownUntil > Date.now()
      ? Math.ceil((this.circuitBreakerCooldownUntil - Date.now()) / (60 * 1000))
      : 0;

    return {
      isPipelineRunning: this.isRunning,
      isAutonomousConfigured: !!settings.isAutonomousActive,
      engine: 'Outscraper API v2 (Google Maps Síncrono)',
      lastScrapeTime: this.lastScrapeTime,
      lastScrapedQuery: this.lastScrapedQuery,
      lastScrapedLocation: this.lastScrapedLocation,
      lastScrapedService: this.lastScrapedService,
      lastScrapedCount: this.lastScrapedCount,
      consecutiveUnanswered: this.consecutiveUnansweredOutreachCount,
      circuitBreakerActive: cooldownRemaining > 0,
      circuitBreakerCooldownRemainingMinutes: cooldownRemaining,
      campaignBuffers
    };
  }
}
