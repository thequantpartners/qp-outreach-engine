import { BaileysEngine } from '../whatsapp/baileys_engine.js';
import { MetaCloudEngine } from '../whatsapp/meta_cloud_engine.js';
import { ApifyScraper } from '../scraper/apify_scraper.js';
import { OutreachRepo } from '../db/repo.js';

export class AutonomousPipeline {
  private static isRunning: boolean = false;
  private static loopTimer: NodeJS.Timeout | null = null;
  private static sentTodayCount: number = 0;
  private static currentDay: string = new Date().toISOString().slice(0, 10);
  private static lastScrapeTime: number = 0;
  private static currentQueryIndex: number = 0;

  private static dailyReportSentDay: string = '';

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
    return {
      isRunning: this.isRunning,
      sentToday: this.sentTodayCount,
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
      this.dailyReportSentDay = '';
    }

    // 1. Obtener configuración
    const settings = await OutreachRepo.getSettings();
    if (!settings.isAutonomousActive) {
      console.log('⏸️ [AutonomousPipeline] Prospección autónoma pausada en configuración.');
      this.scheduleNextTick(60000);
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

    // 2. Comprobar horario comercial (ej. 9am a 7pm hora local)
    const now = new Date();
    const currentHour = now.getHours();
    const isWorkingHours = currentHour >= settings.startHour && currentHour < settings.endHour;

    if (!isWorkingHours) {
      // Disparar reporte diario nocturno si es hora de cierre y no se ha enviado hoy
      if (currentHour >= settings.endHour && this.dailyReportSentDay !== today) {
        await this.sendNightlyReport(today, settings);
      }

      console.log(`🌙 [AutonomousPipeline] Fuera de horario comercial (${currentHour}:00). Horario configurado: ${settings.startHour}:00 - ${settings.endHour}:00. En pausa.`);
      this.scheduleNextTick(10 * 60 * 1000); // esperar 10 minutos
      return;
    }

    // 3. Comprobar recordatorios de citas agendadas próximas (Anti No-Show)
    const upcomingMeetings = await OutreachRepo.getUpcomingMeetingsForReminder(2);
    if (upcomingMeetings.length > 0) {
      const meetingLead = upcomingMeetings[0];
      await this.dispatchMeetingReminder(meetingLead);
      this.scheduleNextTick(15000);
      return;
    }

    // 4. Obtener servicio activo
    const activeService = await OutreachRepo.getActiveService();
    if (!activeService) {
      console.log('⚠️ [AutonomousPipeline] No hay servicios activos configurados.');
      this.scheduleNextTick(60000);
      return;
    }

    // 5. Rampa Automática de Calentamiento Anti-Ban (Warm-up Ramping)
    let activeDays = 5;
    if (activeService.createdAt) {
      const diffMs = Date.now() - new Date(activeService.createdAt).getTime();
      activeDays = Math.max(1, Math.floor(diffMs / (1000 * 60 * 60 * 24)) + 1);
    }
    const isWarmupActive = activeDays <= 4;
    const effectiveDailyLimit = activeDays <= 2 
      ? Math.min(settings.dailyLimit, 10)
      : (activeDays <= 4 ? Math.min(settings.dailyLimit, 20) : settings.dailyLimit);

    const effectiveSettings = { ...settings, dailyLimit: effectiveDailyLimit };

    if (isWarmupActive) {
      console.log(`🔥 [AutonomousPipeline] Rampa de Calentamiento Activa (Día ${activeDays}/4): Límite de seguridad restringido a ${effectiveDailyLimit} msgs/día (Límite normal: ${settings.dailyLimit}).`);
    }

    // Comprobar cuota diaria anti-ban
    if (this.sentTodayCount >= effectiveDailyLimit) {
      console.log(`🛡️ [AutonomousPipeline] Cuota diaria de seguridad alcanzada (${this.sentTodayCount}/${effectiveDailyLimit} mensajes hoy | Normal: ${settings.dailyLimit}). Detenido hasta mañana.`);
      this.scheduleNextTick(15 * 60 * 1000);
      return;
    }

    // 6. PRIORIDAD 1: Prospectos pendientes de Follow-Up (>48h sin respuesta)
    const followUpsDue = await OutreachRepo.getLeadsForFollowUp(activeService.id, 1);
    if (followUpsDue.length > 0) {
      const followUpLead = followUpsDue[0];
      await this.dispatchFollowUp(followUpLead, activeService, effectiveSettings);
      return;
    }

    // 7. Monitorear buffer de prospectos no contactados
    const uncontactedCount = await OutreachRepo.countUncontactedLeads(activeService.id);
    const minBuffer = 10;

    // Si el buffer es bajo y ha pasado al menos 15 minutos desde el último scraping
    const timeSinceLastScrape = Date.now() - this.lastScrapeTime;
    if (uncontactedCount < minBuffer && timeSinceLastScrape > 15 * 60 * 1000) {
      console.log(`🔍 [AutonomousPipeline] Buffer bajo (${uncontactedCount} prospectos). Disparando scraping en Apify...`);
      await this.triggerScrape(activeService);
    }

    // 8. PRIORIDAD 2: Siguiente nuevo lead en frío
    const leadsToContact = await OutreachRepo.getLeadsForOutreach(1);
    if (leadsToContact.length === 0) {
      console.log('ℹ️ [AutonomousPipeline] No hay prospectos pendientes en cola. Esperando recarga de buffer...');
      this.scheduleNextTick(30000);
      return;
    }

    const lead = leadsToContact[0];
    await this.dispatchLead(lead, activeService, effectiveSettings);
  }

  /**
   * Despacha mensaje de seguimiento (Follow-up 1 o 2) con pausa anti-ban
   */
  private static async dispatchFollowUp(lead: any, service: any, settings: any): Promise<void> {
    const whatsapp = BaileysEngine.getInstance();
    const currentCount = lead.followUpCount || 0;
    const nextCount = currentCount + 1;

    let template = nextCount === 1 ? service.followUpTemplate1 : service.followUpTemplate2;
    if (!template) {
      template = nextCount === 1
        ? 'Hola {{name}}, un saludo breve. ¿Pudieron revisar la consulta anterior o los agarro en mala semana?'
        : 'Hola {{name}}, solo para cerrar este contacto con respeto: si más adelante desean evaluar la solución, quedo a su disposición por aquí. Saludos cordiales!';
    }

    let message = template.replace(/{{name}}/g, lead.companyName);
    message = message.replace(/{{phone}}/g, lead.phone);

    console.log(`🔁 [AutonomousPipeline] Despachando Follow-up #${nextCount} a ${lead.companyName} (${lead.phone})...`);
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
      await OutreachRepo.updateLeadFollowUp(lead.phone, nextCount);
      await OutreachRepo.addChatMessage(lead.phone, 'assistant', message);
      console.log(`✅ [AutonomousPipeline] Follow-up #${nextCount} entregado a ${lead.companyName}! (${this.sentTodayCount}/${settings.dailyLimit} hoy)`);

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
   * Despacha el mensaje de prospección con plantilla y pausa anti-ban
   */
  private static async dispatchLead(lead: any, service: any, settings: any): Promise<void> {
    // Formatear mensaje
    let message = service.outreachTemplate;
    message = message.replace(/{{name}}/g, lead.companyName);
    message = message.replace(/{{phone}}/g, lead.phone);

    console.log(`🚀 [AutonomousPipeline] Despachando prospección a ${lead.companyName} (${lead.phone})...`);

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
      await OutreachRepo.updateLeadStatus(lead.phone, 'OUTREACH_SENT');
      await OutreachRepo.addChatMessage(lead.phone, 'assistant', message);
      console.log(`✅ [AutonomousPipeline] Enviado con éxito a ${lead.companyName}! (${this.sentTodayCount}/${settings.dailyLimit} hoy)`);

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
   * Ejecuta scraping en Apify rotando queries y ubicaciones
   */
  public static async triggerScrape(service: any): Promise<{ inserted: number; skipped: number }> {
    this.lastScrapeTime = Date.now();

    const queries = service.apifyQueries.length > 0 ? service.apifyQueries : ['proveedores b2b lima'];
    const locations = service.targetLocations.length > 0 ? service.targetLocations : ['Lima, Peru'];

    const query = queries[this.currentQueryIndex % queries.length];
    const location = locations[this.currentQueryIndex % locations.length];
    this.currentQueryIndex++;

    try {
      console.log(`[AutonomousPipeline] Ejecutando Apify para "${query}" en "${location}"...`);
      const scraped = await ApifyScraper.scrapeGoogleMaps({
        query,
        location,
        maxResults: 15,
        scrapeContacts: true,
        countryCode: 'pe'
      });

      const { inserted, skipped } = await OutreachRepo.saveLeadsFromScraper(service.id, scraped);
      console.log(`✅ [AutonomousPipeline] Scraping finalizado: ${inserted} prospectos nuevos insertados, ${skipped} omitidos/duplicados.`);
      return { inserted, skipped };
    } catch (err: any) {
      console.error('❌ [AutonomousPipeline] Fallo al raspar Apify:', err.message);
      return { inserted: 0, skipped: 0 };
    }
  }
}
