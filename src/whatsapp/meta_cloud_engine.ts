// =================================================================
// THE QUANT PARTNERS · META WHATSAPP CLOUD API OFICIAL (v21.0)
// =================================================================

import { OutreachRepo } from '../db/repo.js';

export interface MetaSendResult {
  success: boolean;
  messageId?: string;
  error?: string;
  isWindowClosed?: boolean;
}

export class MetaCloudEngine {
  private static readonly GRAPH_API_VERSION = 'v21.0';
  private static readonly BASE_URL = 'https://graph.facebook.com';

  /**
   * Obtiene la configuración activa de Meta Cloud API
   */
  public static async getConfig() {
    const settings = await OutreachRepo.getSettings();
    return {
      provider: settings.whatsappProvider || 'direct_qr',
      phoneNumberId: settings.metaPhoneNumberId || process.env.META_PHONE_NUMBER_ID || '',
      wabaId: settings.metaWabaId || process.env.META_WABA_ID || '',
      accessToken: settings.metaAccessToken || process.env.META_ACCESS_TOKEN || '',
      verifyToken: settings.metaWebhookVerifyToken || process.env.META_WEBHOOK_VERIFY_TOKEN || 'qp_verify_token_2026'
    };
  }

  /**
   * Verifica si la API oficial está configurada con credenciales mínimas
   */
  public static async isConfigured(): Promise<boolean> {
    const config = await this.getConfig();
    return !!(config.phoneNumberId && config.accessToken);
  }

  /**
   * Envía un mensaje de texto plano a través de Meta Graph API
   */
  public static async sendTextMessage(to: string, message: string): Promise<MetaSendResult> {
    const config = await this.getConfig();
    if (!config.phoneNumberId || !config.accessToken) {
      return {
        success: false,
        error: 'Meta WhatsApp Cloud API no está configurada (Faltan Phone Number ID o Access Token).'
      };
    }

    const cleanPhone = to.replace(/[^0-9]/g, '');
    const url = `${this.BASE_URL}/${this.GRAPH_API_VERSION}/${config.phoneNumberId}/messages`;

    try {
      const resp = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${config.accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: cleanPhone,
          type: 'text',
          text: {
            preview_url: false,
            body: message
          }
        })
      });

      const data = (await resp.json()) as any;

      if (!resp.ok || data.error) {
        const errorMsg = data.error?.message || 'Error desconocido al enviar por Meta Cloud API';
        const errorCode = data.error?.code;
        const errorSubcode = data.error?.error_subcode;
        const isWindowClosed = errorCode === 131047 || errorSubcode === 2494010;

        console.error(`❌ [MetaCloudEngine] Error enviando a ${cleanPhone}:`, data.error);
        return {
          success: false,
          error: errorMsg,
          isWindowClosed
        };
      }

      const messageId = data.messages?.[0]?.id;
      console.log(`✅ [MetaCloudEngine] Mensaje entregado a ${cleanPhone} (ID: ${messageId})`);
      return {
        success: true,
        messageId
      };
    } catch (err: any) {
      console.error(`❌ [MetaCloudEngine] Excepción de conexión con Graph API:`, err.message);
      return {
        success: false,
        error: `Excepción de conexión con Meta Graph API: ${err.message}`
      };
    }
  }

  /**
   * Envía un documento (PDF, etc.) alojado en URL pública mediante Meta Graph API
   */
  public static async sendDocumentMessage(
    to: string,
    documentUrl: string,
    fileName: string,
    caption?: string
  ): Promise<MetaSendResult> {
    const config = await this.getConfig();
    if (!config.phoneNumberId || !config.accessToken) {
      return {
        success: false,
        error: 'Meta WhatsApp Cloud API no está configurada.'
      };
    }

    const cleanPhone = to.replace(/[^0-9]/g, '');
    const url = `${this.BASE_URL}/${this.GRAPH_API_VERSION}/${config.phoneNumberId}/messages`;

    try {
      const resp = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${config.accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: cleanPhone,
          type: 'document',
          document: {
            link: documentUrl,
            filename: fileName,
            caption: caption || ''
          }
        })
      });

      const data = (await resp.json()) as any;

      if (!resp.ok || data.error) {
        return {
          success: false,
          error: data.error?.message || 'Error enviando documento por Meta Cloud API'
        };
      }

      const messageId = data.messages?.[0]?.id;
      return {
        success: true,
        messageId
      };
    } catch (err: any) {
      return {
        success: false,
        error: err.message
      };
    }
  }
}
