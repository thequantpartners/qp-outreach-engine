import { OutreachRepo } from '../db/repo.js';
import { ZohoMailer } from './zoho_mailer.js';
import { ColdEmailGenerator } from './cold_email_generator.js';
import { ColdEmailCampaignStatus, EmailCampaignLead } from '../types/index.js';
import fs from 'fs';
import path from 'path';

export class ColdEmailScheduler {
  private static isRunning: boolean = false;
  private static loopTimer: NodeJS.Timeout | null = null;
  private static sentTodayCount: number = 0;
  private static sentMorningCount: number = 0;
  private static sentAfternoonCount: number = 0;
  private static lastSentAt: number = 0;
  private static currentDay: string = '';
  private static variantRotationIndex: number = 0;
  private static variantStats = { variantA: 0, variantB: 0, variantC: 0 };

  // Pausa anti-spam estricta: 240 segundos (4 minutos) entre correos
  private static readonly DELAY_BETWEEN_EMAILS_MS = 240 * 1000;
  // Límites por ventana horaria para blindaje de reputación de dominio
  private static readonly MAX_MORNING_EMAILS = 15;
  private static readonly MAX_AFTERNOON_EMAILS = 15;
  private static readonly MAX_DAILY_EMAILS = 30;

  /**
   * Obtiene la fecha actual en formato YYYY-MM-DD según la zona horaria oficial de Lima (America/Lima / UTC-5)
   */
  public static getLimaDateStr(): string {
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Lima',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });
    return formatter.format(new Date());
  }

  /**
   * Obtiene la hora actual en zona horaria oficial Lima (America/Lima / UTC-5)
   * Nota: Lima (PET) coincide con US Central Time (CDT) y está a 1h de US Eastern Time (EDT)
   */
  public static getLimaTime(): { hour: number; minute: number; dayOfWeek: number; timeStr: string } {
    const now = new Date();
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Lima',
      hour: 'numeric',
      minute: 'numeric',
      weekday: 'short',
      hourCycle: 'h23'
    });
    const parts = formatter.formatToParts(now);
    const hour = parseInt(parts.find(p => p.type === 'hour')?.value || '0', 10);
    const minute = parseInt(parts.find(p => p.type === 'minute')?.value || '0', 10);
    const dayOfWeek = now.getUTCDay(); // Aproximación UTC para día

    return {
      hour,
      minute,
      dayOfWeek,
      timeStr: `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
    };
  }

  /**
   * Determina si estamos dentro de alguna de las 2 Ventanas de Oro de lectura
   */
  public static getCurrentSlot(): 'MORNING_WINDOW' | 'AFTERNOON_WINDOW' | 'OFF_HOURS' | 'WEEKEND' {
    const { hour, minute, dayOfWeek } = this.getLimaTime();

    // Fines de semana: estrictamente apagado para no acumularse con spam del lunes
    if (dayOfWeek === 0 || dayOfWeek === 6) {
      return 'WEEKEND';
    }

    // Ventana 1 (Mañana): 09:00 AM a 11:30 AM
    if (hour >= 9 && (hour < 11 || (hour === 11 && minute <= 30))) {
      return 'MORNING_WINDOW';
    }

    // Ventana 2 (Tarde): 02:30 PM (14:30) a 04:30 PM (16:30)
    if ((hour === 14 && minute >= 30) || hour === 15 || (hour === 16 && minute <= 30)) {
      return 'AFTERNOON_WINDOW';
    }

    return 'OFF_HOURS';
  }

  public static start(): void {
    if (this.isRunning) return;
    this.isRunning = true;
    console.log('📧 [ColdEmailScheduler] Motor de Correos en Frío B2B (Perú + USA) INICIADO.');
    this.scheduleNextTick(5000);
  }

  public static stop(): void {
    this.isRunning = false;
    if (this.loopTimer) {
      clearTimeout(this.loopTimer);
      this.loopTimer = null;
    }
    console.log('🛑 [ColdEmailScheduler] Motor de Correos en Frío DETENIDO.');
  }

  public static getStatus(): ColdEmailCampaignStatus {
    const lima = this.getLimaTime();
    const slot = this.getCurrentSlot();

    return {
      isRunning: this.isRunning,
      limaTime: lima.timeStr,
      currentSlot: slot,
      sentToday: this.sentTodayCount,
      maxDaily: this.MAX_DAILY_EMAILS,
      totalQueued: 0,
      totalSent: this.sentTodayCount,
      lastSentAt: this.lastSentAt ? new Date(this.lastSentAt).toISOString() : null,
      activeVariants: { ...this.variantStats }
    };
  }

  private static scheduleNextTick(delayMs: number): void {
    if (!this.isRunning) return;
    if (this.loopTimer) clearTimeout(this.loopTimer);
    this.loopTimer = setTimeout(() => {
      this.tick().catch(err => {
        console.error('❌ [ColdEmailScheduler] Error en ciclo:', err.message);
        this.scheduleNextTick(30000);
      });
    }, delayMs);
  }

  /**
   * Despacha de inmediato el siguiente prospecto en cola (manual o programado)
   */
  public static async dispatchNextNow(force: boolean = false): Promise<{
    success: boolean;
    lead?: EmailCampaignLead;
    variant?: 'A' | 'B' | 'C';
    messageId?: string;
    error?: string;
  }> {
    const slot = this.getCurrentSlot();
    if (!force && (slot === 'WEEKEND' || slot === 'OFF_HOURS')) {
      return {
        success: false,
        error: `Fuera de ventana de oro (${slot}). Use force: true para forzar el despacho inmediato.`
      };
    }

    const lead = await OutreachRepo.getNextQueuedEmailLead();
    if (!lead) {
      return {
        success: false,
        error: 'No hay prospectos con correo corporativo en cola (QUEUED).'
      };
    }

    const variants: ('A' | 'B' | 'C')[] = ['A', 'B', 'C'];
    const variant = variants[this.variantRotationIndex % 3];
    this.variantRotationIndex++;

    const emailContent = ColdEmailGenerator.generate(lead, variant);
    console.log(`📨 [ColdEmailScheduler] Despachando correo a ${lead.email} (${lead.companyName}) [Variante ${variant}]...`);

    const cvPath = path.resolve('public/cv/Kenneth_Herrera_CV.pdf');
    const attachments = fs.existsSync(cvPath)
      ? [{ filename: 'Kenneth_Herrera_Senior_AI_Engineer_CV.pdf', path: cvPath }]
      : undefined;

    const isDev = ColdEmailGenerator.isDevContractorLead(lead);
    const fromName = isDev
      ? 'Kenneth Herrera · Senior AI & Full-Stack Engineer'
      : 'Kenneth Herrera · The Quant Partners';

    const sendResult = await ZohoMailer.sendEmail({
      to: lead.email,
      subject: emailContent.subject,
      text: emailContent.text,
      html: emailContent.html,
      fromName,
      attachments
    });

    if (sendResult.success) {
      this.lastSentAt = Date.now();
      this.sentTodayCount++;
      if (slot === 'MORNING_WINDOW') this.sentMorningCount++;
      if (slot === 'AFTERNOON_WINDOW') this.sentAfternoonCount++;

      if (variant === 'A') this.variantStats.variantA++;
      else if (variant === 'B') this.variantStats.variantB++;
      else if (variant === 'C') this.variantStats.variantC++;

      await OutreachRepo.markEmailLeadSent(lead.id!, sendResult.messageId || 'sent', variant);
      console.log(`✅ [ColdEmailScheduler] Correo entregado exitosamente a ${lead.email} (Id: ${sendResult.messageId}). Total hoy: ${this.sentTodayCount}/${this.MAX_DAILY_EMAILS}`);
      return {
        success: true,
        lead,
        variant,
        messageId: sendResult.messageId
      };
    } else {
      await OutreachRepo.markEmailLeadFailed(lead.id!, sendResult.error || 'Despacho fallido');
      console.error(`❌ [ColdEmailScheduler] Falló despacho a ${lead.email}: ${sendResult.error}`);
      return {
        success: false,
        lead,
        variant,
        error: sendResult.error
      };
    }
  }

  private static async tick(): Promise<void> {
    if (!this.isRunning) return;

    // Reset diario a medianoche de Lima (America/Lima)
    const today = ColdEmailScheduler.getLimaDateStr();
    if (today !== this.currentDay) {
      this.currentDay = today;
      this.sentTodayCount = 0;
      this.sentMorningCount = 0;
      this.sentAfternoonCount = 0;
    }

    const slot = this.getCurrentSlot();
    const lima = this.getLimaTime();

    if (slot === 'WEEKEND') {
      console.log(`⏸️ [ColdEmailScheduler] Fin de semana (${lima.timeStr} Lima). Despacho en frío pausado hasta el lunes.`);
      this.scheduleNextTick(15 * 60 * 1000); // Revisar cada 15 min
      return;
    }

    if (slot === 'OFF_HOURS') {
      // Fuera de las 2 ventanas de oro
      this.scheduleNextTick(60 * 1000); // Revisar cada 1 min hasta entrar en ventana
      return;
    }

    // Verificar límites por bloque horario
    if (slot === 'MORNING_WINDOW' && this.sentMorningCount >= this.MAX_MORNING_EMAILS) {
      this.scheduleNextTick(60 * 1000);
      return;
    }

    if (slot === 'AFTERNOON_WINDOW' && this.sentAfternoonCount >= this.MAX_AFTERNOON_EMAILS) {
      this.scheduleNextTick(60 * 1000);
      return;
    }

    if (this.sentTodayCount >= this.MAX_DAILY_EMAILS) {
      this.scheduleNextTick(5 * 60 * 1000);
      return;
    }

    // Verificar delay anti-ban entre correos
    const timeSinceLastSent = Date.now() - this.lastSentAt;
    if (timeSinceLastSent < this.DELAY_BETWEEN_EMAILS_MS) {
      const waitRemaining = this.DELAY_BETWEEN_EMAILS_MS - timeSinceLastSent;
      this.scheduleNextTick(waitRemaining);
      return;
    }

    // Obtener siguiente prospecto en cola
    const lead = await OutreachRepo.getNextQueuedEmailLead();
    if (!lead) {
      // No hay leads pendientes en la cola
      this.scheduleNextTick(30 * 1000);
      return;
    }

    // Rotación A/B/C
    const variants: ('A' | 'B' | 'C')[] = ['A', 'B', 'C'];
    const variant = variants[this.variantRotationIndex % 3];
    this.variantRotationIndex++;

    const emailContent = ColdEmailGenerator.generate(lead, variant);

    console.log(`📨 [ColdEmailScheduler] Despachando correo a ${lead.email} (${lead.companyName}) [Variante ${variant}]...`);

    const sendResult = await ZohoMailer.sendEmail({
      to: lead.email,
      subject: emailContent.subject,
      text: emailContent.text,
      html: emailContent.html,
      fromName: 'Kenneth Herrera · The Quant Partners'
    });

    if (sendResult.success) {
      this.lastSentAt = Date.now();
      this.sentTodayCount++;
      if (slot === 'MORNING_WINDOW') this.sentMorningCount++;
      if (slot === 'AFTERNOON_WINDOW') this.sentAfternoonCount++;

      if (variant === 'A') this.variantStats.variantA++;
      else if (variant === 'B') this.variantStats.variantB++;
      else if (variant === 'C') this.variantStats.variantC++;

      await OutreachRepo.markEmailLeadSent(lead.id!, sendResult.messageId || 'sent', variant);
      console.log(`✅ [ColdEmailScheduler] Correo entregado exitosamente a ${lead.email}. Total hoy: ${this.sentTodayCount}/${this.MAX_DAILY_EMAILS}`);
    } else {
      await OutreachRepo.markEmailLeadFailed(lead.id!, sendResult.error || 'Unknown SMTP error');
      console.error(`❌ [ColdEmailScheduler] Falló despacho a ${lead.email}: ${sendResult.error}`);
    }

    // Programar siguiente ciclo respetando el delay
    this.scheduleNextTick(this.DELAY_BETWEEN_EMAILS_MS);
  }
}
