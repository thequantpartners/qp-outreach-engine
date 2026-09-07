import { z } from 'zod';

export type LeadStatus =
  | 'DISCOVERED'
  | 'QUEUED'
  | 'OUTREACH_SENT'
  | 'FOLLOW_UP_SENT'
  | 'REPLIED'
  | 'QUALIFIED'
  | 'MEETING_SCHEDULED'
  | 'CLOSED_WON'
  | 'CLOSED_LOST'
  | 'NO_RESPONSE'
  | 'HUMAN_TAKEOVER'
  | 'INVALID_PHONE'
  | 'OPT_OUT';

export type ClosingType = 'MEETING_LINK' | 'PAYMENT_INFO' | 'VALUE_ASSET' | 'HUMAN_TAKEOVER';

export interface ServiceDefinition {
  id: string;
  name: string;
  description: string;
  targetPersona: string;
  apifyQueries: string[];
  targetLocations: string[];
  outreachTemplate: string;
  followUpTemplate1?: string;
  followUpTemplate2?: string;
  assetFilePath?: string;
  assetFileName?: string;
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
  serviceName?: string;
  companyName: string;
  phone: string;
  website?: string;
  address?: string;
  category?: string;
  status: LeadStatus;
  followUpCount?: number;
  lastOutreachAt?: string;
  scheduledMeetingAt?: string;
  lastMessageAt?: string;
  humanTakeoverAt?: string;
  assignedRepName?: string;
  assignedRepPhone?: string;
  handoffNotes?: string;
  closingMode?: 'MEETING_LINK' | 'PHONE_HANDOFF' | 'HYBRID_SMART';
  meetingAttendanceStatus?: 'ATTENDED' | 'NO_SHOW' | 'PENDING';
  source?: LeadSource;
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

export interface SalesRep {
  id: string;
  name: string;
  phone: string;
  pin?: string;
  isActive: boolean;
  leadsAssignedCount: number;
  createdAt?: string;
}

export interface CampaignSettings {
  dailyLimit: number;
  minDelaySeconds: number;
  maxDelaySeconds: number;
  startHour: number;
  endHour: number;
  adminWhatsAppPhone: string;
  webhookUrl?: string;
  alertWebhookUrl?: string;
  isAutonomousActive: boolean;
  salesReps?: SalesRep[];
  roundRobinIndex?: number;
  aiProvider?: 'openrouter' | 'gemini' | 'openai';
  aiApiKey?: string;
  aiModel?: string;
  currency?: string;
  monthlyRetainerFee?: number;
  successFeePerMeeting?: number;
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

export type LeadSource = 'google_maps' | 'meta_ads' | 'instagram' | 'apollo_b2b' | 'google_search' | 'csv_import';

export const ScrapeGoogleMapsSchema = z.object({
  query: z.string().describe("Término de búsqueda (ej. proveedores medicos, clinicas, gimnasios)"),
  location: z.string().default("Lima, Peru").optional(),
  maxResults: z.number().min(1).max(100).default(10).optional(),
  countryCode: z.string().default("pe").optional(),
  scrapeContacts: z.boolean().default(true).optional(),
  serviceId: z.string().optional()
});

export type ScrapeGoogleMapsRequest = z.infer<typeof ScrapeGoogleMapsSchema>;

export const ScrapeMetaAdsSchema = z.object({
  query: z.string().describe("Palabra clave o nicho pautando anuncios (ej. clinicas esteticas, abogados corporativos, departamentos surco)"),
  countryCode: z.string().default("PE").optional().describe("Código ISO de país (ej. PE, CO, MX, CL)"),
  maxResults: z.number().min(1).max(100).default(15).optional(),
  serviceId: z.string().optional()
});

export type ScrapeMetaAdsRequest = z.infer<typeof ScrapeMetaAdsSchema>;

export const ScrapeInstagramSchema = z.object({
  query: z.string().describe("Término de búsqueda o hashtag para perfiles de negocio (ej. odontologia lima, inmobiliaria peru, spa miraflores)"),
  maxResults: z.number().min(1).max(100).default(15).optional(),
  serviceId: z.string().optional()
});

export type ScrapeInstagramRequest = z.infer<typeof ScrapeInstagramSchema>;

export const ScrapeApolloSchema = z.object({
  query: z.string().describe("Industria, cargo o palabras clave B2B (ej. Software Lima, Logistica Callao, Gerentes Comerciales)"),
  location: z.string().default("Peru").optional(),
  maxResults: z.number().min(1).max(100).default(15).optional(),
  countryCode: z.string().default("pe").optional(),
  serviceId: z.string().optional()
});

export type ScrapeApolloRequest = z.infer<typeof ScrapeApolloSchema>;

export const ScrapeGoogleSearchSchema = z.object({
  query: z.string().describe("Búsqueda en Google de empresas con teléfonos públicos (ej. proveedores industriales lima whatsapp)"),
  countryCode: z.string().default("pe").optional(),
  maxResults: z.number().min(1).max(100).default(15).optional(),
  serviceId: z.string().optional()
});

export type ScrapeGoogleSearchRequest = z.infer<typeof ScrapeGoogleSearchSchema>;

export const UnifiedScrapeSchema = z.object({
  source: z.enum(['google_maps', 'meta_ads', 'instagram', 'apollo_b2b', 'google_search']).default('google_maps'),
  query: z.string().describe("Término de búsqueda o palabras clave"),
  location: z.string().optional(),
  countryCode: z.string().default("pe").optional(),
  maxResults: z.number().min(1).max(100).default(15).optional(),
  serviceId: z.string().optional()
});

export type UnifiedScrapeRequest = z.infer<typeof UnifiedScrapeSchema>;

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
  source?: LeadSource;
  adText?: string;
  metadata?: Record<string, any>;
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

export const ImportLeadSchema = z.object({
  name: z.string().min(1).describe("Nombre de la empresa o contacto"),
  phone: z.string().min(6).describe("Teléfono (con o sin código de país)"),
  website: z.string().optional(),
  address: z.string().optional(),
  category: z.string().optional(),
  customFields: z.record(z.any()).optional()
});

export type ImportLeadItem = z.infer<typeof ImportLeadSchema>;

export const ImportLeadsRequestSchema = z.object({
  serviceId: z.string().describe("ID de la campaña o servicio al que se asignarán los prospectos"),
  leads: z.array(ImportLeadSchema).min(1).describe("Lista de prospectos a importar")
});

export type ImportLeadsRequest = z.infer<typeof ImportLeadsRequestSchema>;

export const SendDocumentSchema = z.object({
  to: z.string().describe("Número telefónico de destino"),
  filePathOrUrl: z.string().describe("Ruta local al archivo (ej. storage/assets/dictamen.pdf) o URL descargable"),
  fileName: z.string().describe("Nombre visible del archivo (ej. Dictamen_QP.pdf)"),
  caption: z.string().optional().describe("Mensaje opcional que acompaña al documento")
});

export type SendDocumentRequest = z.infer<typeof SendDocumentSchema>;

export const ConfigureSettingsSchema = z.object({
  dailyLimit: z.number().min(1).max(200).optional(),
  minDelaySeconds: z.number().min(30).optional(),
  maxDelaySeconds: z.number().min(60).optional(),
  startHour: z.number().min(0).max(23).optional(),
  endHour: z.number().min(1).max(24).optional(),
  adminWhatsAppPhone: z.string().optional(),
  webhookUrl: z.string().optional(),
  alertWebhookUrl: z.string().optional(),
  isAutonomousActive: z.boolean().optional(),
  currency: z.string().optional(),
  monthlyRetainerFee: z.number().optional(),
  successFeePerMeeting: z.number().optional()
});

export type ConfigureSettingsRequest = z.infer<typeof ConfigureSettingsSchema>;

// ==========================================
// SAAR HUB & SPOKE / FLEET MANAGEMENT TYPES
// ==========================================

export type ClosingMode = 'MEETING_LINK' | 'PHONE_HANDOFF' | 'HYBRID_SMART';

export interface SalesRepConfig {
  name: string;
  phone: string;
  pin?: string;
}

export interface NicheBlueprint {
  id: string; // ej: 'inmobiliarias', 'clinicas_salud', 'estudios_abogados'
  nicheName: string;
  description: string;
  recommendedClosingMode: ClosingMode;
  defaultApifyQueries: string[];
  defaultTargetLocations: string[];
  outreachTemplate: string;
  followUpTemplate1: string;
  followUpTemplate2: string;
  systemPromptTemplate: string;
  typicalObjections: Array<{ objection: string; responseGuidance: string }>;
}

export interface FleetClientRecord {
  clientId: string; // slug único: ej. 'inmobiliaria-los-robles'
  companyName: string;
  niche: string;
  status: 'PROVISIONING' | 'ACTIVE' | 'PAUSED' | 'DISCONNECTED' | 'ERROR';
  deployTarget: 'railway' | 'vps';
  dashboardUrl: string;
  adminPhone: string;
  salesReps: SalesRepConfig[];
  clientPin: string;
  closingMode: ClosingMode;
  serviceName?: string;
  railwayProjectId?: string;
  railwayServiceId?: string;
  vpsContainerId?: string;
  lastHeartbeat?: string;
  totalLeads?: number;
  repliedLeads?: number;
  qualifiedLeads?: number;
  meetingsBooked?: number;
  isWhatsAppConnected?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface HeartbeatPayload {
  clientId: string;
  isWhatsAppConnected: boolean;
  hasQr: boolean;
  totalLeads: number;
  repliedLeads: number;
  qualifiedLeads: number;
  meetingsBooked: number;
  timestamp: string;
}

export interface DashboardOverviewResponse {
  companyName: string;
  serviceName: string;
  isWhatsAppReady: boolean;
  hasQr: boolean;
  qrData?: string;
  salesReps: SalesRepConfig[];
  metrics: {
    totalLeads: number;
    outreachSent: number;
    replied: number;
    replyRatePercent: number;
    qualified: number;
    meetingsScheduled: number;
    attendedMeetings: number;
    noShowMeetings: number;
    humanTakeover: number;
    closedWon: number;
    settlement: {
      baseRetainer: number;
      successFeePerMeeting: number;
      variableTotal: number;
      grandTotal: number;
      currency: string;
    };
    warmup: {
      isWarmupActive: boolean;
      currentDay: number;
      dailyLimit: number;
    };
  };
  kanban: {
    discovered: Lead[];
    outreachSent: Lead[];
    replied: Lead[];
    qualified: Lead[];
    closedWon: Lead[];
    humanTakeover: Lead[];
  };
  activeChats: Array<{
    leadPhone: string;
    leadName: string;
    status: LeadStatus;
    assignedRepName?: string;
    isHumanTakeover: boolean;
    lastMessageSnippet: string;
    lastMessageAt: string;
  }>;
}

export const ProvisionClientSchema = z.object({
  companyName: z.string().min(2).describe("Nombre de la empresa cliente (ej. Inmobiliaria Los Robles)"),
  niche: z.string().describe("ID de nicho (inmobiliarias, clinicas_salud, estudios_abogados, construccion_b2b) o 'custom'"),
  adminPhone: z.string().describe("Teléfono celular del Gerente o responsable de alertas (ej. 51902105668)"),
  salesReps: z.array(z.object({
    name: z.string(),
    phone: z.string()
  })).min(1).describe("Lista de vendedores para distribución Round-Robin"),
  closingMode: z.enum(['MEETING_LINK', 'PHONE_HANDOFF', 'HYBRID_SMART']).default('HYBRID_SMART').optional(),
  meetingUrl: z.string().optional().describe("URL de Cal.com si el cliente usa agendamiento en calendario"),
  serviceName: z.string().optional().describe("Nombre de la oferta o solución a prospectar"),
  deployTarget: z.enum(['railway', 'vps']).default('railway').optional(),
  clientPin: z.string().optional().describe("PIN de 4 dígitos para que el cliente acceda a su dashboard (si se omite se genera uno)"),
  clientId: z.string().optional().describe("Slug identificador único (si se omite se genera desde companyName)")
});

export type ProvisionClientRequest = z.infer<typeof ProvisionClientSchema>;

export const CloneClientSchema = z.object({
  sourceClientId: z.string().describe("ID del cliente existente a clonar"),
  newCompanyName: z.string().describe("Nombre de la nueva empresa cliente"),
  newAdminPhone: z.string().describe("Teléfono celular del nuevo Gerente"),
  newSalesReps: z.array(z.object({
    name: z.string(),
    phone: z.string()
  })).min(1).describe("Lista de nuevos vendedores para Round-Robin"),
  newClientPin: z.string().optional().describe("Nuevo PIN de acceso"),
  deployTarget: z.enum(['railway', 'vps']).default('railway')
});

export type CloneClientRequest = z.infer<typeof CloneClientSchema>;


