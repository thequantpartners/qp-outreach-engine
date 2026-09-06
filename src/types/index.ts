import { z } from 'zod';

export type LeadStatus =
  | 'DISCOVERED'
  | 'QUEUED'
  | 'OUTREACH_SENT'
  | 'REPLIED'
  | 'QUALIFIED'
  | 'CLOSED_WON'
  | 'CLOSED_LOST'
  | 'HUMAN_TAKEOVER'
  | 'INVALID_PHONE';

export type ClosingType = 'MEETING_LINK' | 'PAYMENT_INFO' | 'VALUE_ASSET' | 'HUMAN_TAKEOVER';

export interface ServiceDefinition {
  id: string;
  name: string;
  description: string;
  targetPersona: string;
  apifyQueries: string[];
  targetLocations: string[];
  outreachTemplate: string;
  closingType: ClosingType;
  closingPayload: {
    meetingUrl?: string;
    paymentDetails?: string;
    assetUrl?: string;
    closingMessage?: string;
  };
  aiSystemPrompt: string;
  isActive: boolean;
  createdAt?: string;
}

export interface Lead {
  id?: number | string;
  serviceId: string;
  companyName: string;
  phone: string;
  website?: string;
  address?: string;
  category?: string;
  status: LeadStatus;
  lastMessageAt?: string;
  humanTakeoverAt?: string;
  customFields?: Record<string, any>;
  createdAt: string;
  updatedAt: string;
}

export interface ChatMessage {
  id?: number | string;
  leadPhone: string;
  role: 'assistant' | 'user' | 'human_agent' | 'system';
  content: string;
  createdAt: string;
}

export interface CampaignSettings {
  dailyLimit: number;
  minDelaySeconds: number;
  maxDelaySeconds: number;
  startHour: number;
  endHour: number;
  adminWhatsAppPhone: string;
  webhookUrl?: string;
  isAutonomousActive: boolean;
}

export const SendMessageSchema = z.object({
  to: z.string().describe("Número telefónico en formato internacional o local (ej. 51999999999 o +51 999 999 999)"),
  message: z.string().min(1).describe("Contenido del mensaje"),
  campaignId: z.string().optional(),
  metadata: z.record(z.any()).optional()
});

export type SendMessageRequest = z.infer<typeof SendMessageSchema>;

export interface SendMessageResponse {
  success: boolean;
  to: string;
  jid?: string;
  error?: string;
  timestamp: string;
}

export const CampaignLeadSchema = z.object({
  name: z.string(),
  phone: z.string(),
  customFields: z.record(z.string()).optional()
});

export type CampaignLead = z.infer<typeof CampaignLeadSchema>;

export const StartCampaignSchema = z.object({
  name: z.string().default("Campaña Outreach"),
  leads: z.array(CampaignLeadSchema).min(1),
  template: z.string().describe("Plantilla de mensaje con tags como {{name}}, {{phone}}, etc."),
  delaySeconds: z.number().min(30).default(210).describe("Pausa entre envíos en segundos (Anti-ban)")
});

export type StartCampaignRequest = z.infer<typeof StartCampaignSchema>;

export interface StartCampaignResponse {
  campaignId: string;
  name: string;
  totalLeads: number;
  status: 'RUNNING' | 'COMPLETED' | 'PAUSED';
  estimatedDurationMinutes: number;
  createdAt: string;
}

export const ScrapeGoogleMapsSchema = z.object({
  query: z.string().describe("Término de búsqueda (ej. proveedores medicos, clinicas, gimnasios)"),
  location: z.string().default("Lima, Peru").optional(),
  maxResults: z.number().min(1).max(100).default(10).optional(),
  countryCode: z.string().default("pe").optional(),
  scrapeContacts: z.boolean().default(true).optional(),
  serviceId: z.string().optional()
});

export type ScrapeGoogleMapsRequest = z.infer<typeof ScrapeGoogleMapsSchema>;

export interface ScrapedLead {
  title: string;
  phone?: string;
  phoneClean?: string;
  website?: string;
  email?: string;
  address?: string;
  city?: string;
  categoryName?: string;
  googleMapsUrl?: string;
}

export interface GatewayStatusResponse {
  isWhatsAppReady: boolean;
  qrAvailable: boolean;
  uptimeSeconds: number;
  activeCampaigns: number;
  version: string;
  storageDir: string;
  dbType: 'postgresql' | 'local_fallback';
  autonomousPipelineActive: boolean;
}
