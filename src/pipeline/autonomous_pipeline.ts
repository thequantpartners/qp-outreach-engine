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

    // 4. Obtener todos los servicios activos
    const allServices = await OutreachRepo.getServices();
    const activeServices = allServices.filter(s => s.isActive && (s.type === 'OUTBOUND' || !s.type) && s.outreachTemplate && s.outreachTemplate.trim().length > 0);
    if (activeServices.length === 0) {
      console.log('⚠️ [AutonomousPipeline] No hay servicios activos configurados.');
      this.scheduleNextTick(60000);
      return;
    }

    const effectiveDailyLimit = settings.dailyLimit || 35;
    const effectiveSettings = { ...settings, dailyLimit: effectiveDailyLimit };

    // Comprobar cuota diaria anti-ban
    if (this.sentTodayCount >= effectiveDailyLimit) {
      console.log(`🛡️ [AutonomousPipeline] Cuota diaria de seguridad alcanzada (${this.sentTodayCount}/${effectiveDailyLimit} mensajes hoy | Normal: ${settings.dailyLimit}). Detenido hasta mañana.`);
      this.scheduleNextTick(15 * 60 * 1000);
      return;
    }

    // 6. PRIORIDAD 1: Prospectos pendientes de Follow-Up (>48h sin respuesta)
    let followUpLead: any = null;
    let followUpService: any = null;
    for (const s of activeServices) {
      const due = await OutreachRepo.getLeadsForFollowUp(s.id, 1);
      if (due.length > 0) {
        followUpLead = due[0];
        followUpService = s;
        break;
      }
    }
    if (followUpLead && followUpService) {
      await this.dispatchFollowUp(followUpLead, followUpService, effectiveSettings);
      return;
    }

    // 7. Monitorear buffer de prospectos no contactados por campaña activa (Flujo Constante de Adquisición)
    const timeSinceLastScrape = Date.now() - this.lastScrapeTime;
    const scrapeCooldownMs = 5 * 60 * 1000; // 5 minutos para auto-alimentar la cola constantemente
    if (timeSinceLastScrape > scrapeCooldownMs) {
      for (const s of activeServices) {
        if (!s.apifyQueries || s.apifyQueries.length === 0) continue;
        const uncontactedCount = await OutreachRepo.countUncontactedLeads(s.id);
        if (uncontactedCount < 15) {
          console.log(`🔄 [AutonomousPipeline - Flujo Constante] Buffer bajo para "${s.name}" (${uncontactedCount} prospectos). Auto-alimentando cola desde Apify...`);
          await this.triggerScrape(s);
          break; // Un scrape por ciclo
        }
      }
    }

    // 8. PRIORIDAD 2: Siguiente nuevo lead en frío (con aislamiento estricto por campaña)
    const leadsToContact = await OutreachRepo.getLeadsForOutreach(undefined, 1);
    if (leadsToContact.length === 0) {
      console.log(`⚠️ [AutonomousPipeline - Flujo Constante] Cola vacía. Disparando recarga automática inmediata desde Apify...`);
      for (const s of activeServices) {
        if (s.apifyQueries && s.apifyQueries.length > 0) {
          await this.triggerScrape(s);
          break;
        }
      }
      this.scheduleNextTick(20000);
      return;
    }

    const lead = leadsToContact[0];
    const specificService = lead.serviceId ? await OutreachRepo.getServiceById(lead.serviceId) : null;
    if (!specificService || !specificService.isActive) {
      console.warn(`⚠️ [AutonomousPipeline] Lead ${lead.phone} pertenece a campaña inactiva o inexistente "${lead.serviceId}". Saltando.`);
      this.scheduleNextTick(5000);
      return;
    }
    await this.dispatchLead(lead, specificService, effectiveSettings);
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

    // Formatear mensaje con variables dinámicas agnósticas
    let message = chosenTemplate;
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

    console.log(`🚀 [AutonomousPipeline] Despachando prospección (Variante ${variant}) a ${lead.companyName} (${lead.phone})...`);

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
      await OutreachRepo.updateLeadCustomFields(lead.phone, { abVariant: variant });
      await OutreachRepo.addChatMessage(lead.phone, 'assistant', message);
      console.log(`✅ [AutonomousPipeline] Enviado con éxito a ${lead.companyName} (Variante ${variant})! (${this.sentTodayCount}/${settings.dailyLimit} hoy)`);

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

    const isUSA = !!(location + ' ' + query).toLowerCase().match(/\b(usa|united states|eeuu|fl|florida|miami|doral|orlando|tampa|kissimmee|tx|texas|houston|dallas|austin|ny|new york|ca|california)\b/);
    const countryCode = isUSA ? 'us' : 'pe';

    try {
      console.log(`[AutonomousPipeline] Ejecutando Apify para "${query}" en "${location}" (País: ${countryCode.toUpperCase()})...`);
      const scraped = await ApifyScraper.scrapeGoogleMaps({
        query,
        location,
        maxResults: 20,
        scrapeContacts: true,
        countryCode
      });

      const { inserted, skipped } = await OutreachRepo.saveLeadsFromScraper(service.id, scraped);
      console.log(`✅ [AutonomousPipeline] Scraping finalizado para "${service.name}": ${inserted} prospectos nuevos insertados, ${skipped} omitidos/duplicados.`);
      return { inserted, skipped };
    } catch (err: any) {
      console.error('❌ [AutonomousPipeline] Fallo al raspar Apify:', err.message);
      return { inserted: 0, skipped: 0 };
    }
  }
}
