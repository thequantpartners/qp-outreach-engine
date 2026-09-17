import { z } from 'zod';

export const ShalomCredentialsSchema = z.object({
  email: z.string().email('Email de Shalom Pro inválido'),
  password: z.string().min(4, 'La contraseña debe tener al menos 4 caracteres')
});

export type ShalomCredentials = z.infer<typeof ShalomCredentialsSchema>;

export interface ShalomSession {
  sessionToken: string;
  expiresAt: string;
  cookies?: string[];
}

export const ShalomAgencySchema = z.object({
  id: z.number(),
  name: z.string(),
  department: z.string(),
  province: z.string(),
  district: z.string(),
  address: z.string(),
  latitude: z.number().optional(),
  longitude: z.number().optional(),
  hasAirService: z.boolean().default(false)
});

export type ShalomAgency = z.infer<typeof ShalomAgencySchema>;

export const ShalomReceiverSchema = z.object({
  documentType: z.enum(['DNI', 'RUC', 'CE']).default('DNI'),
  document: z.string().min(8, 'Documento inválido'),
  name: z.string().min(2, 'Nombre requerido'),
  lastName: z.string().min(2, 'Apellido requerido'),
  surName: z.string().optional().default(''),
  phone: z.string().min(9, 'Teléfono debe tener al menos 9 dígitos')
});

export type ShalomReceiver = z.infer<typeof ShalomReceiverSchema>;

export const ShalomCreateOrderPayloadSchema = z.object({
  originTerminalId: z.number(),
  destinyTerminalId: z.number(),
  productId: z.number().default(3), // 3 = Sobre, 4 = Caja XXS / S
  quantity: z.number().default(1),
  payer: z.enum(['sender', 'receiver']).default('sender'),
  declaracionJurada: z.string().default('Prendas de vestir / Artículos comerciales'),
  receiver: ShalomReceiverSchema,
  pickupCode: z.string().length(4, 'La clave de retiro debe tener exactamente 4 dígitos')
});

export type ShalomCreateOrderPayload = z.infer<typeof ShalomCreateOrderPayloadSchema>;

export interface ShalomOrderResult {
  success: boolean;
  guia: string;
  codigo: string;
  serie?: string;
  oseId: number;
  labelPdfUrl?: string;
  voucherPdfUrl?: string;
  error?: string;
}

export interface ShalomTrackingMilestone {
  fecha: string;
  completo?: boolean;
  cargueros?: string[];
  carguero?: string;
}

export interface ShalomTrackingStatus {
  success: boolean;
  detailed: boolean;
  guia: string;
  codigo: string;
  status: {
    registrado?: ShalomTrackingMilestone | null;
    origen?: ShalomTrackingMilestone | null;
    transito?: ShalomTrackingMilestone | null;
    demora?: ShalomTrackingMilestone | null;
    destino?: ShalomTrackingMilestone | null;
    entregado?: ShalomTrackingMilestone | null;
    reparto?: ShalomTrackingMilestone | null;
  };
  error?: string;
}

export interface ShalomStoreConfig {
  storeName: string;
  adminWhatsAppPhone: string;
  originAgencyId: number;
  originAgencyName: string;
  shalomEmail: string;
  shalomPasswordEncrypted: string;
  updatedAt: string;
}
