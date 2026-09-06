import { BaileysEngine } from '../whatsapp/baileys_engine.js';
import { ApifyScraper } from '../scraper/apify_scraper.js';
import { OutreachRepo } from '../db/repo.js';

export class AutonomousPipeline {
  private static isRunning: boolean = false;
  private static loopTimer: NodeJS.Timeout | null = null;
  private static sentTodayCount: number = 0;
  private static currentDay: string = new Date().toISOString().slice(0, 10);
  private static lastScrapeTime: number = 0;
  private static currentQueryIndex: number = 0;

  /**
   * Inicia el orquestador continuo autónomo
   */
  public static start(): void {
    if (this.isRunning) return;
    this.isRunning = true;
    console.log('⚡ [AutonomousPipeline] Orquestador continuo de adquisición y prospección INICIADO.');
    this.scheduleNextTick(5000);
  }

  public static stop(): void {
    this.isRunning = false;
    if (this.loopTimer) {
      clearTimeout(this.loopTimer);
      this.loopTimer = null;
    }
    console.log('🛑 [AutonomousPipeline] Orquestador continuo DETENIDO.');
  }

  private static scheduleNextTick(delayMs: number): void {
    if (!this.isRunning) return;
    this.loopTimer = setTimeout(() => {
      this.runTick().catch((err) => {
        console.error('❌ [AutonomousPipeline] Error en ciclo:', err.message);
        this.scheduleNextTick(30000); // reintentar en 30s tras error
      });
    }, delayMs);
  }

  /**
   * Ciclo principal del pipeline
   */
  private static async runTick(): Promise<void> {
    if (!this.isRunning) return;

    // 1. Resetear contador diario si cambió la fecha
    const today = new Date().toISOString().slice(0, 10);
    if (today !== this.currentDay) {
      this.currentDay = today;
      this.sentTodayCount = 0;
      console.log(`📅 [AutonomousPipeline] Nuevo día detectado (${today}). Contador diario reiniciado.`);
    }

    const settings = await OutreachRepo.getSettings();
    if (!settings.isAutonomousActive) {
      this.scheduleNextTick(60000);
      return;
    }

    const whatsapp = BaileysEngine.getInstance();
    const waStatus = whatsapp.getStatus();

    if (!waStatus.isReady) {
      console.log('⏳ [AutonomousPipeline] Esperando que WhatsApp se conecte...');
      this.scheduleNextTick(15000);
      return;
    }

    // 2. Comprobar horario comercial (ej. 9am a 7pm hora local)
    const now = new Date();
    const currentHour = now.getHours();
    const isWorkingHours = currentHour >= settings.startHour && currentHour < settings.endHour;

    if (!isWorkingHours) {
      console.log(`🌙 [AutonomousPipeline] Fuera de horario comercial (${currentHour}:00). Horario configurado: ${settings.startHour}:00 - ${settings.endHour}:00. En pausa.`);
      this.scheduleNextTick(10 * 60 * 1000); // esperar 10 minutos
      return;
    }

    // 3. Comprobar cuota diaria anti-ban
    if (this.sentTodayCount >= settings.dailyLimit) {
      console.log(`🛡️ [AutonomousPipeline] Cuota diaria de seguridad alcanzada (${this.sentTodayCount}/${settings.dailyLimit} mensajes). Detenido hasta mañana.`);
      this.scheduleNextTick(15 * 60 * 1000);
      return;
    }

    // 4. Obtener servicio activo
    const activeService = await OutreachRepo.getActiveService();
    if (!activeService) {
      console.log('⚠️ [AutonomousPipeline] No hay servicios activos configurados.');
      this.scheduleNextTick(60000);
      return;
    }

    // 5. Monitorear buffer de prospectos no contactados
    const uncontactedCount = await OutreachRepo.countUncontactedLeads(activeService.id);
    const minBuffer = 10;

    // Si el buffer es bajo y ha pasado al menos 15 minutos desde el último scraping
    const timeSinceLastScrape = Date.now() - this.lastScrapeTime;
    if (uncontactedCount < minBuffer && timeSinceLastScrape > 15 * 60 * 1000) {
      console.log(`🔍 [AutonomousPipeline] Buffer bajo (${uncontactedCount} prospectos). Disparando scraping en Apify...`);
      await this.triggerScrape(activeService);
    }

    // 6. Tomar el siguiente lead para prospección
    const leadsToContact = await OutreachRepo.getLeadsForOutreach(1);
    if (leadsToContact.length === 0) {
      console.log('ℹ️ [AutonomousPipeline] No hay prospectos pendientes en cola. Esperando recarga de buffer...');
      this.scheduleNextTick(30000);
      return;
    }

    const lead = leadsToContact[0];
    await this.dispatchLead(lead, activeService, settings);
  }

  /**
   * Despacha el mensaje de prospección con plantilla y pausa anti-ban
   */
  private static async dispatchLead(lead: any, service: any, settings: any): Promise<void> {
    const whatsapp = BaileysEngine.getInstance();

    // Formatear mensaje
    let message = service.outreachTemplate;
    message = message.replace(/{{name}}/g, lead.companyName);
    message = message.replace(/{{phone}}/g, lead.phone);

    console.log(`🚀 [AutonomousPipeline] Despachando prospección a ${lead.companyName} (${lead.phone})...`);

    const result = await whatsapp.send(lead.phone, message);

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

  public static getStatus(): {
    isRunning: boolean;
    sentTodayCount: number;
    currentDay: string;
    lastScrapeTime: number;
  } {
    return {
      isRunning: this.isRunning,
      sentTodayCount: this.sentTodayCount,
      currentDay: this.currentDay,
      lastScrapeTime: this.lastScrapeTime
    };
  }
}
