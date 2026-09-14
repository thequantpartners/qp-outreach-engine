// =================================================================
// THE QUANT PARTNERS · META CONVERSIONS API (CAPI v21.0)
// =================================================================

import crypto from 'crypto';
import { OutreachRepo } from '../db/repo.js';
import { MetaCAPIEvent, MetaCAPIResult, MetaCAPICustomData } from '../types/index.js';

export class MetaCAPIClient {
  private static readonly GRAPH_API_VERSION = 'v21.0';
  private static readonly BASE_URL = 'https://graph.facebook.com';

  /**
   * Hashea un string usando SHA-256 (requerimiento estricto de Meta CAPI)
   */
  public static hashSha256(value: string): string {
    return crypto.createHash('sha256').update(value.trim().toLowerCase()).digest('hex');
  }

  /**
   * Normaliza y hashea un número de teléfono en formato E.164 sin símbolos (+51999888777 -> 51999888777 -> sha256)
   */
  public static hashPhone(phone: string): string | null {
    if (!phone) return null;
    const cleanDigits = phone.replace(/[^0-9]/g, '');
    if (cleanDigits.length < 8) return null;
    return this.hashSha256(cleanDigits);
  }

  /**
   * Normaliza y hashea un email
   */
  public static hashEmail(email: string): string | null {
    if (!email || !email.includes('@')) return null;
    return this.hashSha256(email.trim().toLowerCase());
  }

  /**
   * Obtiene la configuración de Meta CAPI (Dataset ID, Access Token y Test Code)
   */
  public static async getConfig(): Promise<{
    datasetId: string;
    accessToken: string;
    testEventCode?: string;
  }> {
    try {
      const settings = await OutreachRepo.getSettings();
      const datasetId = settings.metaDatasetId || process.env.META_DATASET_ID || process.env.META_PIXEL_ID || '';
      const accessToken = settings.metaCapiToken || settings.metaAccessToken || process.env.META_CAPI_ACCESS_TOKEN || process.env.META_ACCESS_TOKEN || '';
      const testEventCode = settings.metaTestEventCode || process.env.META_TEST_EVENT_CODE;

      return { datasetId, accessToken, testEventCode };
    } catch {
      return {
        datasetId: process.env.META_DATASET_ID || process.env.META_PIXEL_ID || '',
        accessToken: process.env.META_CAPI_ACCESS_TOKEN || process.env.META_ACCESS_TOKEN || '',
        testEventCode: process.env.META_TEST_EVENT_CODE
      };
    }
  }

  /**
   * Verifica si Meta CAPI tiene las credenciales mínimas configuradas
   */
  public static async isConfigured(): Promise<boolean> {
    const { datasetId, accessToken } = await this.getConfig();
    return !!(datasetId && accessToken);
  }

  /**
   * Valida credenciales realizando una prueba en vivo contra Meta Graph API
   */
  public static async testConnection(datasetId: string, accessToken: string, testEventCode?: string): Promise<{ success: boolean; error?: string }> {
    const url = `${this.BASE_URL}/${this.GRAPH_API_VERSION}/${datasetId}/events`;
    const hashedPhone = this.hashPhone('51900000000');
    const requestBody: Record<string, any> = {
      data: [{
        event_name: 'TestPing',
        event_time: Math.floor(Date.now() / 1000),
        event_id: crypto.randomUUID(),
        action_source: 'chat',
        user_data: { ph: [hashedPhone] },
        custom_data: { test: true }
      }]
    };
    if (testEventCode) {
      requestBody.test_event_code = testEventCode;
    }
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody)
      });
      const json = await response.json() as any;
      if (!response.ok) {
        return { success: false, error: json?.error?.message || `HTTP ${response.status}` };
      }
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  /**
   * Envía un evento unitario de conversión offline a Meta Graph API
   */
  public static async sendEvent(
    eventName: 'Lead' | 'Schedule' | 'Purchase' | 'Contact',
    phone: string,
    customData?: MetaCAPICustomData,
    email?: string,
    eventId?: string
  ): Promise<MetaCAPIResult> {
    const { datasetId, accessToken, testEventCode } = await this.getConfig();

    if (!datasetId || !accessToken) {
      console.warn(`⚠️ [MetaCAPI] No configurado (Falta META_DATASET_ID o META_CAPI_ACCESS_TOKEN). Evento ${eventName} omitido.`);
      return {
        success: false,
        error: 'Meta CAPI no está configurado con Dataset ID o Access Token.'
      };
    }

    const hashedPhone = this.hashPhone(phone);
    if (!hashedPhone) {
      return {
        success: false,
        error: `Teléfono inválido para hashing CAPI: ${phone}`
      };
    }

    const uniqueEventId = eventId || crypto.randomUUID();
    const eventTime = Math.floor(Date.now() / 1000);

    const eventPayload: MetaCAPIEvent = {
      event_name: eventName,
      event_time: eventTime,
      event_id: uniqueEventId,
      action_source: 'chat',
      user_data: {
        ph: [hashedPhone]
      },
      custom_data: {
        ...customData,
        lead_phone: phone
      }
    };

    if (email) {
      const hashedEmail = this.hashEmail(email);
      if (hashedEmail) {
        eventPayload.user_data.em = [hashedEmail];
      }
    }

    const requestBody: Record<string, any> = {
      data: [eventPayload]
    };

    if (testEventCode) {
      requestBody.test_event_code = testEventCode;
    }

    const url = `${this.BASE_URL}/${this.GRAPH_API_VERSION}/${datasetId}/events`;

    try {
      console.log(`📡 [MetaCAPI] Enviando evento '${eventName}' para ${phone} (EventID: ${uniqueEventId})...`);
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody)
      });

      const json = await response.json() as any;

      if (!response.ok) {
        const errorMsg = json?.error?.message || `HTTP Error ${response.status}`;
        console.error(`❌ [MetaCAPI] Error al registrar ${eventName}:`, errorMsg);
        return {
          success: false,
          error: errorMsg,
          fbtraceId: json?.error?.fbtrace_id
        };
      }

      console.log(`✅ [MetaCAPI] Evento '${eventName}' recibido exitosamente por Meta. (Received: ${json.events_received})`);
      return {
        success: true,
        eventsReceived: json.events_received,
        fbtraceId: json.fbtrace_id
      };
    } catch (err: any) {
      console.error(`💥 [MetaCAPI] Error de red al comunicar con Meta Graph API:`, err.message);
      return {
        success: false,
        error: err.message
      };
    }
  }

  /**
   * Atajo para registrar un LEAD calificado
   */
  public static async trackQualifiedLead(phone: string, serviceId: string, leadName?: string): Promise<MetaCAPIResult> {
    return this.sendEvent('Lead', phone, {
      service_id: serviceId,
      lead_name: leadName,
      lead_status: 'QUALIFIED'
    });
  }

  /**
   * Atajo para registrar una CITA AGENDADA (Schedule)
   */
  public static async trackMeetingScheduled(phone: string, serviceId: string, leadName?: string): Promise<MetaCAPIResult> {
    return this.sendEvent('Schedule', phone, {
      service_id: serviceId,
      lead_name: leadName,
      lead_status: 'MEETING_SCHEDULED'
    });
  }

  /**
   * Atajo para registrar una VENTA CERRADA (Purchase) con valor monetario real
   */
  public static async trackPurchase(
    phone: string,
    amount: number,
    currency: 'USD' | 'PEN' = 'USD',
    serviceId: string = 'general',
    leadName?: string
  ): Promise<MetaCAPIResult> {
    return this.sendEvent('Purchase', phone, {
      value: amount,
      currency: currency,
      service_id: serviceId,
      lead_name: leadName,
      lead_status: 'CLOSED_WON'
    });
  }
}
