import { BaileysEngine } from '../whatsapp/baileys_engine.js';
import { MetaCloudEngine } from '../whatsapp/meta_cloud_engine.js';
import { OutreachRepo } from '../db/repo.js';
import { StartCampaignRequest, StartCampaignResponse } from '../types/index.js';
import crypto from 'crypto';

export interface CampaignState {
  id: string;
  name: string;
  status: 'RUNNING' | 'COMPLETED' | 'PAUSED' | 'FAILED';
  totalLeads: number;
  sentCount: number;
  failedCount: number;
  currentIndex: number;
  delaySeconds: number;
  createdAt: string;
  logs: string[];
}

export class DripOrchestrator {
  private static campaigns: Map<string, CampaignState> = new Map();

  public static startCampaign(req: StartCampaignRequest): StartCampaignResponse {
    const id = crypto.randomUUID();
    const delay = req.delaySeconds || 210;

    const state: CampaignState = {
      id,
      name: req.name,
      status: 'RUNNING',
      totalLeads: req.leads.length,
      sentCount: 0,
      failedCount: 0,
      currentIndex: 0,
      delaySeconds: delay,
      createdAt: new Date().toISOString(),
      logs: [`Campaña iniciada con ${req.leads.length} prospectos (Intervalo: ${delay}s)`]
    };

    this.campaigns.set(id, state);

    // Ejecutar en segundo plano de forma desatendida
    this.runCampaignLoop(id, req).catch((err) => {
      console.error(`[DripOrchestrator] Error en campaña ${id}:`, err);
      state.status = 'FAILED';
      state.logs.push(`Error fatal: ${err.message}`);
    });

    const estimatedMinutes = Math.round((req.leads.length * delay) / 60);

    return {
      campaignId: id,
      name: req.name,
      totalLeads: req.leads.length,
      status: 'RUNNING',
      estimatedDurationMinutes: estimatedMinutes,
      createdAt: state.createdAt
    };
  }

  private static async runCampaignLoop(campaignId: string, req: StartCampaignRequest) {
    const state = this.campaigns.get(campaignId);
    if (!state) return;

    const whatsapp = BaileysEngine.getInstance();

    for (let i = 0; i < req.leads.length; i++) {
      state.currentIndex = i;
      const lead = req.leads[i];

      // Formatear plantilla
      let texto = req.template;
      texto = texto.replace(/{{name}}/g, lead.name);
      texto = texto.replace(/{{phone}}/g, lead.phone);

      if (lead.customFields) {
        for (const [key, val] of Object.entries(lead.customFields)) {
          const reg = new RegExp(`{{${key}}}`, 'g');
          texto = texto.replace(reg, val);
        }
      }

      console.log(`[DripOrchestrator][${i + 1}/${req.leads.length}] Enviando a ${lead.name} (${lead.phone})...`);
      
      const settings = await OutreachRepo.getSettings();
      const provider = settings.whatsappProvider || 'direct_qr';
      let result: { success: boolean; error?: string };

      if (provider === 'meta_cloud_api') {
        const metaRes = await MetaCloudEngine.sendTextMessage(lead.phone, texto);
        result = { success: metaRes.success, error: metaRes.error };
      } else {
        result = await whatsapp.send(lead.phone, texto);
      }

      if (result.success) {
        state.sentCount++;
        state.logs.push(`[${new Date().toLocaleTimeString('es-PE')}] Enviado con éxito a ${lead.name} (${lead.phone})`);
      } else {
        state.failedCount++;
        state.logs.push(`[${new Date().toLocaleTimeString('es-PE')}] Falló envío a ${lead.name} (${lead.phone}): ${result.error}`);
      }

      // Pausa anti-ban salvo para el último mensaje
      if (i < req.leads.length - 1) {
        console.log(`[DripOrchestrator] Pausa anti-ban de ${state.delaySeconds}s...`);
        await new Promise((resolve) => setTimeout(resolve, state.delaySeconds * 1000));
      }
    }

    state.status = 'COMPLETED';
    state.logs.push(`Campaña finalizada exitosamente: ${state.sentCount} enviados, ${state.failedCount} fallidos.`);
    console.log(`🎉 [DripOrchestrator] Campaña ${campaignId} completada.`);
  }

  public static getCampaign(id: string): CampaignState | undefined {
    return this.campaigns.get(id);
  }

  public static listCampaigns(): CampaignState[] {
    return Array.from(this.campaigns.values());
  }
}
