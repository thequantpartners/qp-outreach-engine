// =================================================================
// THE QUANT PARTNERS · GHOST CRM (Headless Autonomous Engine)
// =================================================================

import crypto from 'crypto';
import { OutreachRepo } from '../db/repo.js';
import { Lead, LeadStatus } from '../types/index.js';
import { MetaCAPIClient } from './meta_capi.js';

export interface GhostCRMTransitionResult {
  success: boolean;
  lead?: Lead;
  previousStatus?: LeadStatus;
  newStatus?: LeadStatus;
  capiSynced: boolean;
  capiError?: string;
  message: string;
}

export interface GhostCRMFunnelSummary {
  totalLeads: number;
  discovered: number;
  outreachSent: number;
  followUpSent: number;
  replied: number;
  qualified: number;
  meetingScheduled: number;
  closedWon: number;
  closedLost: number;
  humanTakeover: number;
  totalRevenueUSD: number;
  totalRevenuePEN: number;
  metaCapiEventsFired: number;
  dueColdFollowUp?: number;
  dueConversationalFollowUp?: number;
}

export class GhostCRM {
  /**
   * Avanza el estado de un lead en el CRM invisible y dispara los hooks necesarios
   */
  public static async transitionStatus(
    phone: string,
    newStatus: LeadStatus,
    metadata?: {
      assignedRepName?: string;
      assignedRepPhone?: string;
      handoffNotes?: string;
      saleAmount?: number;
      saleCurrency?: 'USD' | 'PEN';
      scheduledMeetingAt?: string;
    }
  ): Promise<GhostCRMTransitionResult> {
    const cleanPhone = phone.replace(/[^0-9]/g, '');
    const lead = await OutreachRepo.getLead(cleanPhone);

    if (!lead) {
      return {
        success: false,
        capiSynced: false,
        message: `Lead no encontrado en Ghost CRM con el teléfono ${cleanPhone}`
      };
    }

    const previousStatus = lead.status;
    let capiSynced = false;
    let capiError: string | undefined;

    // 1. Preparar campos de actualización
    const updates: Partial<Lead> = {
      status: newStatus,
      updatedAt: new Date().toISOString()
    };

    if (metadata?.assignedRepName) updates.assignedRepName = metadata.assignedRepName;
    if (metadata?.assignedRepPhone) updates.assignedRepPhone = metadata.assignedRepPhone;
    if (metadata?.handoffNotes) updates.handoffNotes = metadata.handoffNotes;
    if (metadata?.scheduledMeetingAt) updates.scheduledMeetingAt = metadata.scheduledMeetingAt;

    if (newStatus === 'HUMAN_TAKEOVER' || newStatus === 'QUALIFIED') {
      updates.humanTakeoverAt = new Date().toISOString();
    }

    // 2. Disparar Meta Conversions API (CAPI) según la nueva etapa
    if (newStatus === 'QUALIFIED') {
      try {
        const capiRes = await MetaCAPIClient.trackQualifiedLead(cleanPhone, lead.serviceId, lead.companyName);
        capiSynced = capiRes.success;
        if (!capiRes.success) capiError = capiRes.error;
        if (capiRes.success) {
          updates.capiSyncedAt = new Date().toISOString();
          updates.capiEventId = crypto.randomUUID();
        }
      } catch (err: any) {
        capiError = err.message;
      }
    } else if (newStatus === 'MEETING_SCHEDULED') {
      try {
        const capiRes = await MetaCAPIClient.trackMeetingScheduled(cleanPhone, lead.serviceId, lead.companyName);
        capiSynced = capiRes.success;
        if (!capiRes.success) capiError = capiRes.error;
        if (capiRes.success) {
          updates.capiSyncedAt = new Date().toISOString();
        }
      } catch (err: any) {
        capiError = err.message;
      }
    } else if (newStatus === 'CLOSED_WON') {
      const amount = metadata?.saleAmount || lead.saleAmount || 0;
      const currency = metadata?.saleCurrency || (lead.saleCurrency as 'USD' | 'PEN') || 'USD';
      updates.saleAmount = amount;
      updates.saleCurrency = currency;

      try {
        const capiRes = await MetaCAPIClient.trackPurchase(cleanPhone, amount, currency, lead.serviceId, lead.companyName);
        capiSynced = capiRes.success;
        if (!capiRes.success) capiError = capiRes.error;
        if (capiRes.success) {
          updates.capiSyncedAt = new Date().toISOString();
          updates.capiEventId = crypto.randomUUID();
        }
      } catch (err: any) {
        capiError = err.message;
      }
    }

    // 3. Persistir en la base de datos de PostgreSQL
    const updatedLead = await OutreachRepo.updateLead(cleanPhone, updates);

    // 4. Sincronizar etiqueta oficial de WhatsApp Business
    try {
      const { WhatsAppLabelManager } = await import('../whatsapp/label_manager.js');
      const { BaileysEngine } = await import('../whatsapp/baileys_engine.js');
      const sock = (BaileysEngine as any).getInstance?.()?.getSocket?.() || null;
      await WhatsAppLabelManager.syncLeadLabel(sock, cleanPhone, newStatus, previousStatus);
    } catch {}

    console.log(`👻 [GhostCRM] Lead ${cleanPhone} (${lead.companyName}): ${previousStatus} ➔ ${newStatus} (CAPI: ${capiSynced ? 'SYNCED' : 'OFF'})`);

    return {
      success: true,
      lead: updatedLead || undefined,
      previousStatus,
      newStatus,
      capiSynced,
      capiError,
      message: `Lead ${cleanPhone} actualizado a ${newStatus}`
    };
  }

  /**
   * Registra una venta ganada (Purchase) y dispara CAPI con valor real
   */
  public static async recordWonSale(
    phone: string,
    amount: number,
    currency: 'USD' | 'PEN' = 'USD',
    closedByRep?: string
  ): Promise<GhostCRMTransitionResult> {
    return this.transitionStatus(phone, 'CLOSED_WON', {
      saleAmount: amount,
      saleCurrency: currency,
      handoffNotes: closedByRep ? `Venta cerrada por asesor: ${closedByRep}` : 'Venta cerrada y registrada'
    });
  }

  /**
   * Obtiene las métricas consolidadas del embudo de Ghost CRM
   */
  public static async getFunnelSummary(serviceId?: string): Promise<GhostCRMFunnelSummary> {
    const leads = await OutreachRepo.getLeads(serviceId ? { serviceId } : undefined);

    const summary: GhostCRMFunnelSummary = {
      totalLeads: leads.length,
      discovered: 0,
      outreachSent: 0,
      followUpSent: 0,
      replied: 0,
      qualified: 0,
      meetingScheduled: 0,
      closedWon: 0,
      closedLost: 0,
      humanTakeover: 0,
      totalRevenueUSD: 0,
      totalRevenuePEN: 0,
      metaCapiEventsFired: 0,
      dueColdFollowUp: 0,
      dueConversationalFollowUp: 0
    };

    for (const lead of leads) {
      switch (lead.status) {
        case 'DISCOVERED':
          summary.discovered++;
          break;
        case 'OUTREACH_SENT':
          summary.outreachSent++;
          break;
        case 'FOLLOW_UP_SENT':
          summary.followUpSent++;
          break;
        case 'REPLIED':
          summary.replied++;
          break;
        case 'QUALIFIED':
          summary.qualified++;
          break;
        case 'MEETING_SCHEDULED':
          summary.meetingScheduled++;
          break;
        case 'CLOSED_WON':
          summary.closedWon++;
          if (lead.saleAmount) {
            if (lead.saleCurrency === 'PEN') {
              summary.totalRevenuePEN += Number(lead.saleAmount);
            } else {
              summary.totalRevenueUSD += Number(lead.saleAmount);
            }
          }
          break;
        case 'CLOSED_LOST':
        case 'OPT_OUT':
          summary.closedLost++;
          break;
        case 'HUMAN_TAKEOVER':
          summary.humanTakeover++;
          break;
      }

      if (lead.capiSyncedAt) {
        summary.metaCapiEventsFired++;
      }
    }

    try {
      const dueCold = await OutreachRepo.getLeadsForFollowUp(serviceId, 1000);
      summary.dueColdFollowUp = dueCold.length;
      const dueConv = await OutreachRepo.getLeadsForConversationalFollowUp(serviceId, 1000);
      summary.dueConversationalFollowUp = dueConv.length;
    } catch {}

    return summary;
  }
}
