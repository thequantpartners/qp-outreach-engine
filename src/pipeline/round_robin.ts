import dotenv from 'dotenv';
import { SalesRepConfig, Lead } from '../types/index.js';
import { OutreachRepo } from '../db/repo.js';
import { BaileysEngine } from '../whatsapp/baileys_engine.js';

dotenv.config();

export class RoundRobinManager {
  private static currentIndex: number = 0;
  private static cachedReps: SalesRepConfig[] | null = null;

  /**
   * Obtiene la lista de ejecutivos comerciales configurados para la empresa
   */
  public static getSalesReps(): SalesRepConfig[] {
    if (this.cachedReps && this.cachedReps.length > 0) {
      return this.cachedReps;
    }

    const raw = process.env.SALES_REPS;
    const reps: SalesRepConfig[] = [];

    if (raw) {
      try {
        if (raw.trim().startsWith('[')) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) {
            for (const r of parsed) {
              if (r.name && r.phone) {
                reps.push({
                  name: String(r.name).trim(),
                  phone: String(r.phone).replace(/[^0-9]/g, '')
                });
              }
            }
          }
        } else {
          // Formato: "Kenneth:51902105668,Carlos:51911111111,Valeria:51922222222"
          const parts = raw.split(',');
          for (const part of parts) {
            const [name, phone] = part.split(':');
            if (name && phone) {
              reps.push({
                name: name.trim(),
                phone: phone.replace(/[^0-9]/g, '').trim()
              });
            }
          }
        }
      } catch (err: any) {
        console.warn('⚠️ [RoundRobinManager] Error parseando SALES_REPS:', err.message);
      }
    }

    // Fallback: Admin phone o Kenneth por defecto
    if (reps.length === 0) {
      const adminPhone = (process.env.ADMIN_WHATSAPP_PHONE || '51902105668').replace(/[^0-9]/g, '');
      reps.push({
        name: process.env.ADMIN_NAME || 'Ejecutivo Comercial',
        phone: adminPhone
      });
    }

    this.cachedReps = reps;
    return reps;
  }

  /**
   * Establece dinámicamente la lista de vendedores (por ejemplo al cargar configuración)
   */
  public static setSalesReps(reps: SalesRepConfig[]): void {
    if (reps && reps.length > 0) {
      this.cachedReps = reps;
      this.currentIndex = 0;
    }
  }

  /**
   * Obtiene el siguiente vendedor en la rotación 1 a 1 equitativa
   */
  public static getNextRep(): SalesRepConfig {
    const reps = this.getSalesReps();
    const rep = reps[this.currentIndex % reps.length];
    this.currentIndex = (this.currentIndex + 1) % reps.length;
    return rep;
  }

  /**
   * Asigna el prospecto calificado al siguiente vendedor y le dispara la alerta VIP por WhatsApp
   */
  public static async assignAndAlertLead(
    lead: Lead,
    reason: string,
    notes?: string,
    closingMode: 'MEETING_LINK' | 'PHONE_HANDOFF' | 'HYBRID_SMART' = 'HYBRID_SMART'
  ): Promise<{ rep: SalesRepConfig; alertSent: boolean }> {
    const rep = this.getNextRep();
    const cleanLeadPhone = lead.phone.replace(/[^0-9]/g, '');

    console.log(`🎯 [RoundRobinManager] Asignando lead ${lead.companyName} (${cleanLeadPhone}) a ${rep.name} (+${rep.phone})...`);

    // 1. Persistir asignación en la base de datos
    await OutreachRepo.assignLeadToRep(
      cleanLeadPhone,
      rep.name,
      rep.phone,
      notes || reason,
      closingMode
    );

    // 2. Construir alerta VIP de WhatsApp
    const publicUrl = process.env.PUBLIC_URL || process.env.RAILWAY_STATIC_URL
      ? `https://${process.env.RAILWAY_STATIC_URL || process.env.PUBLIC_URL}`
      : `http://localhost:${process.env.PORT || 3100}`;
    const dashboardLink = `${publicUrl}/dashboard?phone=${cleanLeadPhone}`;
    const directWaLink = `https://wa.me/${cleanLeadPhone}`;

    const alertMessage = [
      `🚨 *NUEVA OPORTUNIDAD CALIFICADA ASIGNADA*`,
      ``,
      `👤 *Vendedor Asignado:* ${rep.name}`,
      `🏢 *Empresa:* ${lead.companyName}`,
      `📱 *Teléfono:* +${cleanLeadPhone}`,
      `🎯 *Motivo:* ${reason}`,
      notes ? `📝 *Detalle:* ${notes}` : null,
      ``,
      `👉 *Escribir directo al prospecto:* ${directWaLink}`,
      `👉 *Abrir chat en Tablero:* ${dashboardLink}`
    ].filter(Boolean).join('\n');

    // 3. Despachar alerta al WhatsApp del comercial asignado
    let alertSent = false;
    try {
      const whatsapp = BaileysEngine.getInstance();
      const sendRes = await whatsapp.send(rep.phone, alertMessage);
      alertSent = sendRes.success;
      if (alertSent) {
        console.log(`✅ [RoundRobinManager] Alerta VIP enviada a ${rep.name} (+${rep.phone}) con éxito.`);
      } else {
        console.warn(`⚠️ [RoundRobinManager] No se pudo enviar alerta a ${rep.phone}: ${sendRes.error}`);
      }
    } catch (err: any) {
      console.error('❌ [RoundRobinManager] Error enviando alerta VIP de WhatsApp:', err.message);
    }

    return { rep, alertSent };
  }
}
