import dotenv from 'dotenv';
import { EmailCampaignLead } from '../types/index.js';

dotenv.config();

export class InstantlyClient {
  private static get apiKey(): string {
    return process.env.INSTANTLY_API_KEY || 'MWJkZDZiNGUtNDg2NS00ZWM0LTk2YTYtMzA4OWZlMDJhZDE2OldmQm9Hc2pxY2FrZg==';
  }

  private static get headers(): Record<string, string> {
    return {
      'Authorization': `Bearer ${this.apiKey}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    };
  }

  /**
   * Consulta las cuentas de correo conectadas en el workspace de Instantly
   */
  public static async getAccounts(): Promise<any[]> {
    try {
      const res = await fetch('https://api.instantly.ai/api/v2/accounts?limit=50', {
        headers: this.headers
      });
      if (!res.ok) return [];
      const data: any = await res.json();
      return data.items || [];
    } catch (err: any) {
      console.error('[InstantlyClient] Error consultando cuentas:', err.message);
      return [];
    }
  }

  /**
   * Consulta las campañas existentes en Instantly
   */
  public static async getCampaigns(): Promise<any[]> {
    try {
      const res = await fetch('https://api.instantly.ai/api/v2/campaigns?limit=50', {
        headers: this.headers
      });
      if (!res.ok) return [];
      const data: any = await res.json();
      return data.items || [];
    } catch (err: any) {
      console.error('[InstantlyClient] Error consultando campañas:', err.message);
      return [];
    }
  }

  /**
   * Inyecta prospectos en una campaña de Instantly vía API v2
   */
  public static async addLeadsToCampaign(campaignId: string, leads: EmailCampaignLead[]): Promise<{
    success: boolean;
    addedCount: number;
    error?: string;
  }> {
    try {
      const payload = {
        campaign_id: campaignId,
        skip_if_in_workspace: true,
        leads: leads.map(l => ({
          email: l.email,
          first_name: l.firstName || (l.contactName ? l.contactName.split(' ')[0] : 'Director'),
          last_name: l.contactName && l.contactName.includes(' ') ? l.contactName.split(' ').slice(1).join(' ') : '',
          company_name: l.companyName,
          custom_variables: {
            title: l.title || 'Gerente',
            industry: l.industry || 'B2B',
            city: l.city || 'Lima',
            country: l.countryCode || 'PE'
          }
        }))
      };

      const res = await fetch('https://api.instantly.ai/api/v2/leads', {
        method: 'POST',
        headers: this.headers,
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        const errText = await res.text();
        return { success: false, addedCount: 0, error: `HTTP ${res.status}: ${errText}` };
      }

      const result: any = await res.json();
      console.log(`✅ [InstantlyClient] ${leads.length} leads inyectados en campaña ${campaignId} de Instantly.`);
      return {
        success: true,
        addedCount: result.total_added || leads.length
      };
    } catch (err: any) {
      console.error('[InstantlyClient] Error agregando leads:', err.message);
      return { success: false, addedCount: 0, error: err.message };
    }
  }
}
