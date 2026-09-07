import express, { Request, Response, NextFunction } from 'express';
import dotenv from 'dotenv';
import { BaileysEngine } from '../whatsapp/baileys_engine.js';
import { ApifyScraper } from '../scraper/apify_scraper.js';
import { DripOrchestrator } from '../queue/drip_orchestrator.js';
import { OutreachRepo } from '../db/repo.js';
import { DbConnection } from '../db/connection.js';
import { AutonomousPipeline } from '../pipeline/autonomous_pipeline.js';
import {
  SendMessageSchema,
  StartCampaignSchema,
  ScrapeGoogleMapsSchema,
  ScrapeMetaAdsSchema,
  ScrapeInstagramSchema,
  ScrapeApolloSchema,
  ScrapeGoogleSearchSchema,
  UnifiedScrapeSchema,
  GatewayStatusResponse,
  ImportLeadsRequestSchema,
  SendDocumentSchema,
  ConfigureSettingsSchema
} from '../types/index.js';
import fs from 'fs';
import path from 'path';
import { RoundRobinManager } from '../pipeline/round_robin.js';
import { ClientRegistry } from '../master/client_registry.js';
import { OpenRouterCloser } from '../ai/openrouter_closer.js';

dotenv.config();

const app = express();
app.use(express.json());

// Middleware de CORS para Vercel y clientes autorizados
app.use((req: Request, res: Response, next: NextFunction) => {
  const origin = req.headers.origin;
  res.setHeader('Access-Control-Allow-Origin', origin || '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-api-key, x-client-pin, Cache-Control');
  res.setHeader('Access-Control-Allow-Credentials', 'true');

  if (req.method === 'OPTIONS') {
    res.sendStatus(204);
    return;
  }
  next();
});

// Montar Dashboard Web estático
const publicDashboardDir = fs.existsSync(path.resolve('public/dashboard'))
  ? path.resolve('public/dashboard')
  : path.resolve(__dirname, '../../public/dashboard');

app.use('/dashboard', express.static(publicDashboardDir));
app.get(['/', '/dashboard'], (_req: Request, res: Response) => {
  res.sendFile(path.join(publicDashboardDir, 'index.html'));
});

// Suscriptores SSE para tiempo real en el Dashboard
const clientSseSubscribers = new Set<Response>();

export function broadcastDashboardEvent(event: { type: string; [key: string]: any }) {
  const payload = `data: ${JSON.stringify(event)}\n\n`;
  for (const client of clientSseSubscribers) {
    try {
      client.write(payload);
    } catch {
      clientSseSubscribers.delete(client);
    }
  }
}

const PORT = process.env.PORT || 3100;
const API_SECRET_KEY = process.env.API_SECRET_KEY || 'qp-master-secret-2026';
const startTime = Date.now();

import { McpServerManager } from '../mcp/server.js';

// Instancia única de WhatsApp
const whatsapp = BaileysEngine.getInstance();

// 1. Montar endpoints de Servidor MCP (SSE para clientes de IA remotos en Railway)
McpServerManager.mountSseEndpoints(app);

// Middleware de Autenticación por API Key para rutas /api/
function authenticate(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  const apiKeyHeader = req.headers['x-api-key'];
  const queryKey = req.query.apiKey as string;

  let token = (apiKeyHeader as string) || queryKey;
  if (!token && authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.slice(7).trim();
  }

  if (!token || token !== API_SECRET_KEY) {
    res.status(401).json({
      error: 'No autorizado. Proporcione una clave válida en header "x-api-key" o "Authorization: Bearer <token>"'
    });
    return;
  }
  next();
}

// Middleware de autenticación por PIN para el Dashboard del Cliente
function authenticateClientPin(req: Request, res: Response, next: NextFunction): void {
  const configuredPin = process.env.CLIENT_PIN || '1234';
  const providedPin = (req.headers['x-client-pin'] as string) || (req.query.pin as string);
  if (!providedPin || providedPin !== configuredPin) {
    res.status(401).json({ error: 'PIN de acceso no autorizado o inválido.' });
    return;
  }
  next();
}

// 2. Información Headless en Root (o redirección a Dashboard en modo cliente)
app.get('/', (_req: Request, res: Response) => {
  if (process.env.MODE === 'client') {
    res.redirect('/dashboard');
    return;
  }

  const waStatus = whatsapp.getStatus();
  res.json({
    service: 'qp-outreach-engine',
    version: '2.0.0',
    mode: process.env.MODE || 'master',
    status: 'online',
    whatsappConnected: waStatus.isReady,
    mcp: {
      protocol: 'Model Context Protocol (MCP)',
      sseEndpoint: '/sse',
      messagesEndpoint: '/messages',
      tools: [
        'outreach_status',
        'list_campaigns',
        'launch_campaign',
        'list_leads',
        'get_chat_history',
        'send_whatsapp_message',
        'toggle_human_takeover',
        'trigger_scraping'
      ]
    },
    documentation: 'https://github.com/the-quant-partners/qp-outreach-engine/blob/main/AGENTS.md'
  });
});

// --- CLIENT DASHBOARD API ---
app.post('/api/client/auth', (req: Request, res: Response) => {
  const configuredPin = process.env.CLIENT_PIN || '1234';
  const { pin } = req.body || {};
  if (pin && String(pin).trim() === configuredPin) {
    res.json({
      success: true,
      companyName: process.env.COMPANY_NAME || 'Centro Comercial B2B',
      serviceName: process.env.SERVICE_NAME || 'Departamento Comercial Autónomo'
    });
  } else {
    res.status(401).json({ success: false, error: 'PIN incorrecto' });
  }
});

app.get('/api/client/overview', authenticateClientPin, async (_req: Request, res: Response) => {
  try {
    const waStatus = whatsapp.getStatus();
    const overview = await OutreachRepo.getDashboardOverview();
    const salesReps = RoundRobinManager.getSalesReps();

    let qrData: string | undefined;
    const latestQr = whatsapp.getLatestQr();
    if (latestQr && !waStatus.isReady) {
      const QRCode = (await import('qrcode')).default;
      qrData = await QRCode.toDataURL(latestQr, { width: 450, margin: 2 });
    }

    res.json({
      companyName: process.env.COMPANY_NAME || 'The Quant Partners',
      serviceName: process.env.SERVICE_NAME || 'Departamento Comercial Autónomo',
      isWhatsAppReady: waStatus.isReady,
      hasQr: waStatus.hasQr,
      qrData,
      salesReps,
      metrics: overview.metrics,
      kanban: overview.kanban,
      activeChats: overview.activeChats
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Endpoint público para ver y escanear el QR en vivo desde el navegador
app.get('/api/client/qr', async (_req: Request, res: Response) => {
  try {
    const latestQr = whatsapp.getLatestQr();
    if (!latestQr) {
      if (whatsapp.getStatus().isReady) {
        res.send('<div style="font-family:sans-serif;text-align:center;padding:50px;background:#0d1117;color:#10b981;min-height:100vh"><h2>✅ WhatsApp ya está vinculado y conectado exitosamente.</h2><p style="color:#94a3b8">Puedes cerrar esta ventana y regresar al dashboard.</p></div>');
      } else {
        res.send('<div style="font-family:sans-serif;text-align:center;padding:50px;background:#0d1117;color:#f59e0b;min-height:100vh"><h2>⏳ Generando nuevo código QR de WhatsApp...</h2><p style="color:#94a3b8">Espere 3 segundos.</p><meta http-equiv="refresh" content="3"></div>');
      }
      return;
    }
    const QRCode = (await import('qrcode')).default;
    const buffer = await QRCode.toBuffer(latestQr, { width: 450, margin: 3 });
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.send(buffer);
  } catch (err: any) {
    res.status(500).send(err.message);
  }
});

app.get('/qr', (_req: Request, res: Response) => {
  res.redirect('/api/client/qr');
});

// Obtener configuración comercial y estado de WhatsApp
app.get('/api/client/settings', authenticateClientPin, async (_req: Request, res: Response) => {
  try {
    const settings = await OutreachRepo.getSettings();
    const waStatus = whatsapp.getStatus();
    res.json({
      success: true,
      settings: {
        startHour: settings.startHour ?? 9,
        endHour: settings.endHour ?? 19,
        minDelaySeconds: settings.minDelaySeconds ?? 180,
        maxDelaySeconds: settings.maxDelaySeconds ?? 300,
        dailyLimit: settings.dailyLimit ?? 15,
        adminWhatsAppPhone: settings.adminWhatsAppPhone || '',
        isAutonomousActive: settings.isAutonomousActive ?? false
      },
      whatsapp: waStatus
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Guardar configuración comercial
app.post('/api/client/settings', authenticateClientPin, async (req: Request, res: Response) => {
  try {
    const { startHour, endHour, minDelaySeconds, maxDelaySeconds, dailyLimit, adminWhatsAppPhone } = req.body || {};
    
    await OutreachRepo.updateSettings({
      ...(startHour !== undefined ? { startHour: parseInt(startHour, 10) } : {}),
      ...(endHour !== undefined ? { endHour: parseInt(endHour, 10) } : {}),
      ...(minDelaySeconds !== undefined ? { minDelaySeconds: parseInt(minDelaySeconds, 10) } : {}),
      ...(maxDelaySeconds !== undefined ? { maxDelaySeconds: parseInt(maxDelaySeconds, 10) } : {}),
      ...(dailyLimit !== undefined ? { dailyLimit: parseInt(dailyLimit, 10) } : {}),
      ...(adminWhatsAppPhone !== undefined ? { adminWhatsAppPhone: String(adminWhatsAppPhone).replace(/[^0-9]/g, '') } : {})
    });

    const updated = await OutreachRepo.getSettings();
    broadcastDashboardEvent({
      type: 'settings_updated',
      settings: updated
    });

    res.json({ success: true, settings: updated });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Desconectar y limpiar sesión de WhatsApp para nuevo número
app.post('/api/client/whatsapp/disconnect', authenticateClientPin, async (_req: Request, res: Response) => {
  try {
    await whatsapp.disconnectAndClearSession();
    broadcastDashboardEvent({
      type: 'whatsapp_disconnected'
    });
    res.json({
      success: true,
      message: 'Sesión de WhatsApp desvinculada exitosamente. Se ha iniciado el proceso para un nuevo código QR.'
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/client/chat/:phone', authenticateClientPin, async (req: Request, res: Response) => {
  try {
    const clean = String(req.params.phone).replace(/[^0-9]/g, '');
    const lead = await OutreachRepo.getLeadByPhone(clean);
    const messages = await OutreachRepo.getChatHistory(clean, 60);
    res.json({ lead, messages });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/client/chat/send', authenticateClientPin, async (req: Request, res: Response) => {
  try {
    const { phone, message } = req.body || {};
    if (!phone || !message) {
      res.status(400).json({ error: 'phone y message son requeridos' });
      return;
    }
    const clean = String(phone).replace(/[^0-9]/g, '');
    const result = await whatsapp.send(clean, message);

    if (result.success) {
      await OutreachRepo.updateLeadStatus(clean, 'HUMAN_TAKEOVER', {
        humanTakeoverAt: new Date().toISOString()
      });
      await OutreachRepo.addChatMessage(clean, 'human_agent', message);

      broadcastDashboardEvent({
        type: 'new_message',
        phone: clean,
        role: 'human_agent',
        content: message,
        createdAt: new Date().toISOString()
      });

      res.json({ success: true });
    } else {
      res.status(500).json({ error: result.error || 'Fallo enviando WhatsApp' });
    }
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/client/chat/:phone/suggest', authenticateClientPin, async (req: Request, res: Response) => {
  try {
    const clean = String(req.params.phone).replace(/[^0-9]/g, '');
    const lead = await OutreachRepo.getLeadByPhone(clean);
    if (!lead) {
      res.status(404).json({ error: 'Lead no encontrado' });
      return;
    }
    const service = lead.serviceId ? await OutreachRepo.getServiceById(lead.serviceId) : undefined;
    const suggestions = await OpenRouterCloser.generateCopilotSuggestions(lead, service || undefined);
    res.json({ success: true, suggestions });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/client/chat/send-document', authenticateClientPin, async (req: Request, res: Response) => {
  try {
    const { phone, filePathOrUrl, fileName, caption } = req.body || {};
    if (!phone || !filePathOrUrl || !fileName) {
      res.status(400).json({ error: 'phone, filePathOrUrl y fileName son requeridos' });
      return;
    }
    const clean = String(phone).replace(/[^0-9]/g, '');
    const result = await whatsapp.sendDocument(clean, filePathOrUrl, fileName, caption);

    if (result.success) {
      await OutreachRepo.updateLeadStatus(clean, 'HUMAN_TAKEOVER', {
        humanTakeoverAt: new Date().toISOString()
      });
      const docMsg = `📄 [DOCUMENTO: ${fileName}] ${caption || ''}`.trim();
      await OutreachRepo.addChatMessage(clean, 'human_agent', docMsg);

      broadcastDashboardEvent({
        type: 'new_message',
        phone: clean,
        role: 'human_agent',
        content: docMsg,
        createdAt: new Date().toISOString()
      });

      res.json({ success: true, fileName, jid: result.jid });
    } else {
      res.status(500).json({ error: result.error || 'Fallo despachando documento por WhatsApp' });
    }
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/client/takeover', authenticateClientPin, async (req: Request, res: Response) => {
  try {
    const { phone } = req.body || {};
    const clean = String(phone).replace(/[^0-9]/g, '');
    const lead = await OutreachRepo.getLeadByPhone(clean);
    if (!lead) {
      res.status(404).json({ error: 'Lead no encontrado' });
      return;
    }

    const isCurrentlyTakeover = lead.status === 'HUMAN_TAKEOVER' || !!lead.humanTakeoverAt;
    const newStatus = isCurrentlyTakeover ? 'REPLIED' : 'HUMAN_TAKEOVER';
    const newTakeoverTime = isCurrentlyTakeover ? null : new Date().toISOString();

    await OutreachRepo.updateLeadStatus(clean, newStatus, {
      humanTakeoverAt: newTakeoverTime
    });

    broadcastDashboardEvent({
      type: 'lead_updated',
      phone: clean,
      status: newStatus,
      isHumanTakeover: !isCurrentlyTakeover
    });

    res.json({ success: true, isHumanTakeover: !isCurrentlyTakeover });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/client/leads/status', authenticateClientPin, async (req: Request, res: Response) => {
  try {
    const { phone, status } = req.body || {};
    const clean = String(phone).replace(/[^0-9]/g, '');
    await OutreachRepo.updateLeadStatus(clean, status);

    broadcastDashboardEvent({
      type: 'lead_updated',
      phone: clean,
      status
    });

    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/client/leads/meeting-attendance', authenticateClientPin, async (req: Request, res: Response) => {
  try {
    const { phone, attendanceStatus } = req.body || {};
    if (!phone || !attendanceStatus || !['ATTENDED', 'NO_SHOW', 'PENDING'].includes(attendanceStatus)) {
      res.status(400).json({ error: 'phone y attendanceStatus válidos (ATTENDED, NO_SHOW, PENDING) son requeridos' });
      return;
    }
    const clean = String(phone).replace(/[^0-9]/g, '');
    await OutreachRepo.updateMeetingAttendance(clean, attendanceStatus);

    broadcastDashboardEvent({
      type: 'meeting_attendance_updated',
      phone: clean,
      attendanceStatus
    });

    res.json({ success: true, phone: clean, attendanceStatus });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/client/services', authenticateClientPin, async (_req: Request, res: Response) => {
  try {
    const services = await OutreachRepo.getServices();
    res.json({
      success: true,
      services: services.map(s => ({
        id: s.id,
        name: s.name,
        isActive: s.isActive,
        targetLocations: s.targetLocations
      }))
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/client/leads/import', authenticateClientPin, async (req: Request, res: Response) => {
  try {
    const { serviceId, leads } = req.body || {};
    if (!serviceId || !Array.isArray(leads) || leads.length === 0) {
      res.status(400).json({ error: 'serviceId y un array de leads no vacío son requeridos' });
      return;
    }

    const result = await OutreachRepo.importLeads(serviceId, leads);

    broadcastDashboardEvent({
      type: 'lead_updated',
      serviceId,
      importedCount: result.inserted
    });

    res.json({
      success: true,
      serviceId,
      ...result
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Copiloto Autónomo de Prospección IA: Sugerir queries y fuentes enriquecidas
app.post('/api/client/scrape/suggest', authenticateClientPin, async (req: Request, res: Response) => {
  try {
    const { niche, location = 'Lima, Peru' } = req.body || {};
    if (!niche || !niche.trim()) {
      res.status(400).json({ error: 'El campo "nicho" es requerido' });
      return;
    }

    const cleanNiche = niche.trim().toLowerCase();
    const cleanLocation = location.trim() || 'Lima, Peru';

    let recommendedSource: 'google_maps' | 'meta_ads' | 'instagram' | 'multi_source' = 'google_maps';
    let sourceExplanation = 'Google Maps es óptimo para negocios con ubicación física y números directos de atención.';
    let suggestedQueries: string[] = [];
    let commercialAngle = 'Consultoría de optimización operativa y captación de clientes.';
    let recommendedMaxLeads = 15;

    if (cleanNiche.includes('abogad') || cleanNiche.includes('legal') || cleanNiche.includes('juridic') || cleanNiche.includes('tributari') || cleanNiche.includes('penal')) {
      recommendedSource = 'google_maps';
      sourceExplanation = 'Google Maps concentra estudios jurídicos y bufetes corporativos con teléfonos de mesa directos y WhatsApp institucional verificado.';
      suggestedQueries = [
        `estudios de abogados corporativos ${cleanLocation}`,
        `asesoria legal tributaria ${cleanLocation}`,
        `estudio juridico laboral y compliance ${cleanLocation}`,
        `abogados especialistas en licitaciones ${cleanLocation}`
      ];
      commercialAngle = 'Dictámenes periciales y salvaguarda preventiva frente a penalidades contractuales.';
    } else if (cleanNiche.includes('clinic') || cleanNiche.includes('estetic') || cleanNiche.includes('odontolog') || cleanNiche.includes('dental') || cleanNiche.includes('salud') || cleanNiche.includes('med')) {
      recommendedSource = 'meta_ads';
      sourceExplanation = 'Meta Ads Library es superior para clínicas porque filtra negocios con inversión activa en pauta y conversión a WhatsApp.';
      suggestedQueries = [
        `clinica estetica ${cleanLocation}`,
        `centro odontologico y diseño de sonrisa ${cleanLocation}`,
        `dermatologia y rejuvenecimiento facial ${cleanLocation}`,
        `implantes dentales ${cleanLocation}`
      ];
      commercialAngle = 'Agente IA de atención y agendamiento 24/7 en WhatsApp para triplicar la conversión de pacientes.';
    } else if (cleanNiche.includes('inmobiliari') || cleanNiche.includes('construct') || cleanNiche.includes('inmueble') || cleanNiche.includes('arquitect') || cleanNiche.includes('propiedad')) {
      recommendedSource = 'multi_source';
      sourceExplanation = 'Multi-Fuente (Google Maps + Meta Ads) captura tanto las constructoras con sede física como los proyectos inmobiliarios con pauta activa.';
      suggestedQueries = [
        `inmobiliarias y proyectos residenciales ${cleanLocation}`,
        `empresas constructoras y contratistas generales ${cleanLocation}`,
        `venta de departamentos y departamentos en planos ${cleanLocation}`,
        `gerencia de proyectos inmobiliarios ${cleanLocation}`
      ];
      commercialAngle = 'Calificación automática de prospectos interesados con filtro de presupuesto antes de la llamada.';
    } else if (cleanNiche.includes('moda') || cleanNiche.includes('ropa') || cleanNiche.includes('joy') || cleanNiche.includes('marca') || cleanNiche.includes('fit') || cleanNiche.includes('gimnasio')) {
      recommendedSource = 'instagram';
      sourceExplanation = 'Instagram Business es la fuente con mayor densidad de decisores directos y enlaces wa.me para marcas visuales y fitness.';
      suggestedQueries = [
        `marca de ropa deportiva ${cleanLocation}`,
        `boutique de moda y calzado ${cleanLocation}`,
        `joyeria fina y accesorios ${cleanLocation}`,
        `gimnasios y centros de entrenamiento ${cleanLocation}`
      ];
      commercialAngle = 'Recuperación de pedidos y ventas directas asistidas por WhatsApp.';
    } else {
      recommendedSource = 'google_maps';
      sourceExplanation = 'Google Maps permite prospectar directamente a los decisores y oficinas comerciales de este sector en la zona objetivo.';
      suggestedQueries = [
        `${cleanNiche} ${cleanLocation}`,
        `empresas de ${cleanNiche} ${cleanLocation}`,
        `proveedores de ${cleanNiche} ${cleanLocation}`,
        `distribuidora de ${cleanNiche} ${cleanLocation}`
      ];
      commercialAngle = 'Automatización comercial y prospección B2B de alta retención.';
    }

    res.json({
      success: true,
      niche,
      location: cleanLocation,
      recommendedSource,
      sourceExplanation,
      suggestedQueries,
      recommendedMaxLeads,
      commercialAngle
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Ejecutor de Scraping Multi-Fuente para Previsualización en Dashboard
app.post('/api/client/scrape/execute', authenticateClientPin, async (req: Request, res: Response) => {
  try {
    const { source = 'google_maps', query, location = 'Lima, Peru', maxResults = 15, countryCode = 'pe' } = req.body || {};
    if (!query || !String(query).trim()) {
      res.status(400).json({ error: 'El término de búsqueda (query) es requerido' });
      return;
    }

    const safeMax = Math.min(Math.max(1, parseInt(String(maxResults), 10) || 15), 30);
    const cleanQuery = String(query).trim();
    const cleanLocation = String(location).trim() || 'Lima, Peru';

    let rawLeads: any[] = [];
    if (source === 'meta_ads') {
      rawLeads = await ApifyScraper.scrapeMetaAds({ query: cleanQuery, maxResults: safeMax, countryCode });
    } else if (source === 'instagram') {
      rawLeads = await ApifyScraper.scrapeInstagram({ query: cleanQuery, maxResults: safeMax });
    } else if (source === 'multi_source') {
      rawLeads = await ApifyScraper.scrapeMultiSource({ source: 'google_maps', query: cleanQuery, location: cleanLocation, maxResults: safeMax, countryCode });
    } else {
      rawLeads = await ApifyScraper.scrapeGoogleMaps({ query: cleanQuery, location: cleanLocation, maxResults: safeMax, countryCode });
    }

    // Identificar prospectos que ya están en PostgreSQL para advertir duplicados
    const cleanPhones = rawLeads
      .map(l => l.phoneClean || (l.phone ? l.phone.replace(/[^0-9]/g, '') : ''))
      .filter(p => p && p.length >= 8);
    
    const existingPhonesSet = new Set<string>();

    if (cleanPhones.length > 0 && DbConnection.isPg()) {
      const checkRes = await DbConnection.getPool().query(
        `SELECT phone FROM leads WHERE phone = ANY($1)`,
        [cleanPhones]
      );
      checkRes.rows.forEach(r => existingPhonesSet.add(r.phone));
    }

    const processedLeads = rawLeads.map(l => {
      const phoneClean = l.phoneClean || (l.phone ? l.phone.replace(/[^0-9]/g, '') : '');
      const isAlreadyInDb = existingPhonesSet.has(phoneClean);
      return {
        title: l.title || 'Empresa B2B',
        phone: l.phone || (phoneClean ? `+${phoneClean}` : 'No disponible'),
        phoneClean,
        website: l.website || '',
        address: l.address || cleanLocation,
        source: l.source || source,
        categoryName: l.categoryName || '',
        alreadyInDatabase: isAlreadyInDb,
        selected: !isAlreadyInDb && !!phoneClean
      };
    });

    res.json({
      success: true,
      source,
      query: cleanQuery,
      location: cleanLocation,
      totalFound: processedLeads.length,
      newLeadsCount: processedLeads.filter(l => !l.alreadyInDatabase && !!l.phoneClean).length,
      alreadyInDbCount: processedLeads.filter(l => l.alreadyInDatabase).length,
      leads: processedLeads
    });
  } catch (err: any) {
    console.error('Error ejecutando scraping en cliente:', err);
    res.status(500).json({ error: 'Error ejecutando scraping en Apify', details: err.message });
  }
});

app.get('/api/client/stream', (req: Request, res: Response) => {
  const configuredPin = process.env.CLIENT_PIN || '1234';
  const queryPin = req.query.pin as string;

  if (!queryPin || queryPin !== configuredPin) {
    res.status(401).end();
    return;
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  clientSseSubscribers.add(res);
  res.write(`data: ${JSON.stringify({ type: 'connected', timestamp: new Date().toISOString() })}\n\n`);

  req.on('close', () => {
    clientSseSubscribers.delete(res);
  });
});

// --- MASTER HEARTBEAT RECEIVER ---
app.post('/api/master/heartbeat', async (req: Request, res: Response) => {
  try {
    await ClientRegistry.recordHeartbeat(req.body);
    res.json({ success: true, recorded: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 3. Healthcheck público
app.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', service: 'qp-outreach-engine', timestamp: new Date().toISOString() });
});

// 3. Estado del Gateway
app.get('/api/status', authenticate, (_req: Request, res: Response) => {
  const waStatus = whatsapp.getStatus();
  const storageDir = path.resolve(process.env.STORAGE_DIR || './storage');

  const response: GatewayStatusResponse = {
    isWhatsAppReady: waStatus.isReady,
    qrAvailable: waStatus.hasQr,
    uptimeSeconds: Math.floor((Date.now() - startTime) / 1000),
    activeCampaigns: DripOrchestrator.listCampaigns().filter(c => c.status === 'RUNNING').length,
    version: '2.0.0',
    storageDir,
    dbType: DbConnection.isPg() ? 'postgresql' : 'local_fallback',
    autonomousPipelineActive: AutonomousPipeline.getStatus().isRunning
  };

  res.json(response);
});

// 4. Estadísticas del Embudo
app.get('/api/pipeline/stats', authenticate, async (_req: Request, res: Response) => {
  try {
    const stats = await OutreachRepo.getStats();
    res.json(stats);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 5. Listar Leads con filtros
app.get('/api/leads', authenticate, async (req: Request, res: Response) => {
  try {
    const serviceId = req.query.serviceId as string;
    const status = req.query.status as any;
    const search = req.query.search as string;
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 100;

    const leads = await OutreachRepo.getLeads({ serviceId, status, search, limit });
    res.json(leads);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 6. Historial de Chat de un Lead
app.get('/api/leads/:phone/chat', authenticate, async (req: Request, res: Response) => {
  try {
    const phone = req.params.phone as string;
    const messages = await OutreachRepo.getChatHistory(phone);
    res.json(messages);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 7. Respuesta manual a un Lead (activa Human Takeover)
app.post('/api/leads/:phone/reply', authenticate, async (req: Request, res: Response) => {
  try {
    const phone = req.params.phone as string;
    const { message } = req.body;
    if (!message) {
      res.status(400).json({ error: 'El campo message es requerido' });
      return;
    }

    const result = await whatsapp.sendManualReply(phone, message);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 8. Alternar Human Takeover
app.post('/api/leads/:phone/toggle-takeover', authenticate, async (req: Request, res: Response) => {
  try {
    const phone = req.params.phone as string;
    const lead = await OutreachRepo.getLeadByPhone(phone);
    if (!lead) {
      res.status(404).json({ error: 'Lead no encontrado' });
      return;
    }

    const isCurrentlyTakeover = lead.status === 'HUMAN_TAKEOVER';
    if (isCurrentlyTakeover) {
      // Reanudar IA
      await OutreachRepo.updateLeadStatus(phone, 'REPLIED', { humanTakeoverAt: null });
      res.json({ isTakeover: false, message: 'IA reanudada para este contacto.' });
    } else {
      // Activar Takeover Humano
      await OutreachRepo.updateLeadStatus(phone, 'HUMAN_TAKEOVER', { humanTakeoverAt: new Date().toISOString() });
      res.json({ isTakeover: true, message: 'Modo Humano activado. La IA no responderá a este contacto.' });
    }
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 9. Forzar ciclo de Scraping inmediato
app.post('/api/pipeline/trigger', authenticate, async (_req: Request, res: Response) => {
  try {
    const activeService = await OutreachRepo.getActiveService();
    if (!activeService) {
      res.status(400).json({ error: 'No hay servicio activo configurado' });
      return;
    }

    const result = await AutonomousPipeline.triggerScrape(activeService);
    res.json({ success: true, ...result });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 10. Alternar estado del pipeline autónomo (Pausar / Reanudar)
app.post('/api/pipeline/toggle', authenticate, async (_req: Request, res: Response) => {
  try {
    const settings = await OutreachRepo.getSettings();
    const newActive = !settings.isAutonomousActive;
    await OutreachRepo.updateSettings({ isAutonomousActive: newActive });

    if (newActive) {
      AutonomousPipeline.start();
    } else {
      AutonomousPipeline.stop();
    }

    res.json({ active: newActive });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 11. Gestión de Servicios
app.get('/api/services', authenticate, async (_req: Request, res: Response) => {
  try {
    const services = await OutreachRepo.getServices();
    res.json(services);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/services', authenticate, async (req: Request, res: Response) => {
  try {
    await OutreachRepo.saveService(req.body);
    res.json({ success: true, service: req.body });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 12. Obtener QR
app.get('/api/qr', authenticate, (req: Request, res: Response) => {
  const qrString = whatsapp.getLatestQr();
  const format = req.query.format as string;

  if (!qrString) {
    if (whatsapp.getStatus().isReady) {
      res.json({ message: 'WhatsApp ya está conectado y listo. No se requiere código QR.' });
      return;
    }
    res.status(404).json({ message: 'Código QR no disponible aún o ya fue utilizado.' });
    return;
  }

  if (format === 'image') {
    const storageDir = path.resolve(process.env.STORAGE_DIR || './storage');
    const qrPng = path.join(storageDir, 'whatsapp_qr.png');
    if (fs.existsSync(qrPng)) {
      res.sendFile(qrPng);
      return;
    }
  }

  res.json({ qr: qrString, instructions: 'Escanee con WhatsApp > Dispositivos Vinculados' });
});

// 13. Envío individual inmediato (Transaccional para agentes satélite)
app.post('/api/send', authenticate, async (req: Request, res: Response) => {
  const parseResult = SendMessageSchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({ error: 'Datos de envío inválidos', details: parseResult.error.format() });
    return;
  }

  const { to, message } = parseResult.data;
  const result = await whatsapp.send(to, message);

  if (result.success) {
    res.json({
      success: true,
      to,
      jid: result.jid,
      timestamp: new Date().toISOString()
    });
  } else {
    res.status(500).json({
      success: false,
      to,
      error: result.error,
      timestamp: new Date().toISOString()
    });
  }
});

// 14. Iniciar Campaña Drip Manual
app.post('/api/campaign', authenticate, (req: Request, res: Response) => {
  const parseResult = StartCampaignSchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({ error: 'Parámetros de campaña inválidos', details: parseResult.error.format() });
    return;
  }

  const campaign = DripOrchestrator.startCampaign(parseResult.data);
  res.status(202).json(campaign);
});

app.get('/api/campaign/:id', authenticate, (req: Request, res: Response) => {
  const campaign = DripOrchestrator.getCampaign(req.params.id as string);
  if (!campaign) {
    res.status(404).json({ error: 'Campaña no encontrada' });
    return;
  }
  res.json(campaign);
});

app.get('/api/campaigns', authenticate, (_req: Request, res: Response) => {
  res.json(DripOrchestrator.listCampaigns());
});

// 15. Scraping Google Maps manual
app.post('/api/scrape/google-maps', authenticate, async (req: Request, res: Response) => {
  const parseResult = ScrapeGoogleMapsSchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({ error: 'Parámetros de scraping inválidos', details: parseResult.error.format() });
    return;
  }

  try {
    const leads = await ApifyScraper.scrapeGoogleMaps(parseResult.data);
    
    // Si viene serviceId o hay servicio activo, guardar en DB
    if (parseResult.data.serviceId) {
      await OutreachRepo.saveLeadsFromScraper(parseResult.data.serviceId, leads);
    }

    res.json({
      success: true,
      query: parseResult.data.query,
      location: parseResult.data.location,
      totalFound: leads.length,
      leads
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Error ejecutando scraping en Apify', details: err.message });
  }
});

// 15b. Scraping Meta Ads Library (Empresas con Pauta Publicitaria Activa)
app.post('/api/scrape/meta-ads', authenticate, async (req: Request, res: Response) => {
  const parseResult = ScrapeMetaAdsSchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({ error: 'Parámetros inválidos para Meta Ads', details: parseResult.error.format() });
    return;
  }

  try {
    const leads = await ApifyScraper.scrapeMetaAds(parseResult.data);
    if (parseResult.data.serviceId) {
      await OutreachRepo.saveLeadsFromScraper(parseResult.data.serviceId, leads);
    }
    res.json({
      success: true,
      source: 'meta_ads',
      query: parseResult.data.query,
      totalFound: leads.length,
      leads
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Error ejecutando scraping en Meta Ads', details: err.message });
  }
});

// 15c. Scraping Instagram Business
app.post('/api/scrape/instagram', authenticate, async (req: Request, res: Response) => {
  const parseResult = ScrapeInstagramSchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({ error: 'Parámetros inválidos para Instagram', details: parseResult.error.format() });
    return;
  }

  try {
    const leads = await ApifyScraper.scrapeInstagram(parseResult.data);
    if (parseResult.data.serviceId) {
      await OutreachRepo.saveLeadsFromScraper(parseResult.data.serviceId, leads);
    }
    res.json({
      success: true,
      source: 'instagram',
      query: parseResult.data.query,
      totalFound: leads.length,
      leads
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Error ejecutando scraping en Instagram', details: err.message });
  }
});

// 15d. Scraping Apollo / B2B Leads
app.post('/api/scrape/apollo', authenticate, async (req: Request, res: Response) => {
  const parseResult = ScrapeApolloSchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({ error: 'Parámetros inválidos para Apollo', details: parseResult.error.format() });
    return;
  }

  try {
    const leads = await ApifyScraper.scrapeApollo(parseResult.data);
    if (parseResult.data.serviceId) {
      await OutreachRepo.saveLeadsFromScraper(parseResult.data.serviceId, leads);
    }
    res.json({
      success: true,
      source: 'apollo_b2b',
      query: parseResult.data.query,
      totalFound: leads.length,
      leads
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Error ejecutando scraping en Apollo B2B', details: err.message });
  }
});

// 15e. Scraping Google Search
app.post('/api/scrape/google-search', authenticate, async (req: Request, res: Response) => {
  const parseResult = ScrapeGoogleSearchSchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({ error: 'Parámetros inválidos para Google Search', details: parseResult.error.format() });
    return;
  }

  try {
    const leads = await ApifyScraper.scrapeGoogleSearch(parseResult.data);
    if (parseResult.data.serviceId) {
      await OutreachRepo.saveLeadsFromScraper(parseResult.data.serviceId, leads);
    }
    res.json({
      success: true,
      source: 'google_search',
      query: parseResult.data.query,
      totalFound: leads.length,
      leads
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Error ejecutando scraping en Google Search', details: err.message });
  }
});

// 15f. Scraping Multi-Fuente Unificado
app.post('/api/scrape/multi', authenticate, async (req: Request, res: Response) => {
  const parseResult = UnifiedScrapeSchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({ error: 'Parámetros inválidos para Scraping Multi-Fuente', details: parseResult.error.format() });
    return;
  }

  try {
    const leads = await ApifyScraper.scrapeMultiSource(parseResult.data);
    if (parseResult.data.serviceId) {
      await OutreachRepo.saveLeadsFromScraper(parseResult.data.serviceId, leads);
    }
    res.json({
      success: true,
      source: parseResult.data.source,
      query: parseResult.data.query,
      totalFound: leads.length,
      leads
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Error ejecutando scraping multi-fuente', details: err.message });
  }
});

// 16. Importación masiva de prospectos (CSV / JSON)
app.post('/api/leads/import', authenticate, async (req: Request, res: Response) => {
  const parseResult = ImportLeadsRequestSchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({ error: 'Datos de importación inválidos', details: parseResult.error.format() });
    return;
  }

  try {
    const { serviceId, leads } = parseResult.data;
    const result = await OutreachRepo.importLeads(serviceId, leads);
    res.json({ success: true, serviceId, ...result });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 17. Webhook Cal.com / Agendamiento de Citas (Público para recibir eventos de Cal.com)
app.post('/api/webhooks/cal', async (req: Request, res: Response) => {
  try {
    const body = req.body || {};
    const event = body.triggerEvent || body.event || 'BOOKING_CREATED';
    const payload = body.payload || body;

    console.log(`📥 [Webhook Cal.com] Evento recibido: ${event}`);

    if (event === 'BOOKING_CREATED' || event === 'booking.created') {
      // Extraer datos del asistente
      const responses = payload.responses || {};
      const rawPhone = responses.phone?.value || responses.phone || payload.attendees?.[0]?.phone || payload.phone || '';
      const name = responses.name?.value || responses.name || payload.attendees?.[0]?.name || payload.name || 'Cliente';
      const startTime = payload.startTime || payload.start_time || new Date().toISOString();
      const cleanPhone = (rawPhone as string).replace(/[^0-9]/g, '');

      if (cleanPhone) {
        let phoneFormatted = cleanPhone;
        if (phoneFormatted.length === 9 && phoneFormatted.startsWith('9')) {
          phoneFormatted = `51${phoneFormatted}`;
        }

        console.log(`📅 [Webhook Cal.com] Cita confirmada para ${name} (${phoneFormatted}) a las ${startTime}`);

        // Actualizar lead en la base de datos
        await OutreachRepo.updateLeadSchedule(phoneFormatted, startTime, {
          bookingId: payload.uid || payload.id,
          bookingEmail: payload.attendees?.[0]?.email || responses.email?.value
        });

        // Enviar mensaje de confirmación inmediata por WhatsApp
        const dateStr = new Date(startTime).toLocaleString('es-PE', { timeZone: 'America/Lima' });
        const confirmationMsg = `¡Confirmado ${name}! Quedó agendada nuestra sesión técnica para el ${dateStr}. Kenneth se conectará puntualmente en el enlace acordado. ¡Un gusto saludarlo!`;
        
        await whatsapp.send(phoneFormatted, confirmationMsg);
        await OutreachRepo.addChatMessage(phoneFormatted, 'assistant', confirmationMsg);

        // Notificar al comercial vía Round-Robin
        const lead = await OutreachRepo.getLeadByPhone(phoneFormatted);
        if (lead) {
          await RoundRobinManager.assignAndAlertLead(
            lead,
            'Cita Confirmada en Cal.com',
            `Sesión agendada para: ${dateStr}`,
            'MEETING_LINK'
          );
        } else {
          await whatsapp.notifyAdmin(
            `📅 *NUEVA CITA AGENDADA EN CAL.COM*\n\nContacto: *${name}*\nTeléfono: *+${phoneFormatted}*\nFecha y Hora: *${dateStr}*`
          );
        }

        // Emitir evento en tiempo real a los dashboards conectados
        broadcastDashboardEvent({
          type: 'appointment_booked',
          phone: phoneFormatted,
          name,
          startTime
        });
      }
    }

    res.json({ received: true });
  } catch (err: any) {
    console.error('[Webhook Cal.com] Error procesando evento:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// 18. Envío de documentos nativos (PDFs)
app.post('/api/send/document', authenticate, async (req: Request, res: Response) => {
  const parseResult = SendDocumentSchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({ error: 'Parámetros inválidos', details: parseResult.error.format() });
    return;
  }

  const { to, filePathOrUrl, fileName, caption } = parseResult.data;
  const result = await whatsapp.sendDocument(to, filePathOrUrl, fileName, caption);
  if (result.success) {
    res.json(result);
  } else {
    res.status(500).json(result);
  }
});

// 19. Configuración del sistema
app.get('/api/settings', authenticate, async (_req: Request, res: Response) => {
  try {
    const settings = await OutreachRepo.getSettings();
    res.json(settings);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/settings', authenticate, async (req: Request, res: Response) => {
  const parseResult = ConfigureSettingsSchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({ error: 'Parámetros inválidos', details: parseResult.error.format() });
    return;
  }

  try {
    await OutreachRepo.updateSettings(parseResult.data);
    const updated = await OutreachRepo.getSettings();
    res.json({ success: true, settings: updated });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});


// Iniciar servidor, base de datos, WhatsApp y Pipeline Autónomo
app.listen(PORT, async () => {
  console.log('================================================================');
  console.log(`🚀 QP OUTREACH ENGINE v2.0 ACTIVO EN PUERTO ${PORT}`);
  console.log(`Dashboard Web: http://localhost:${PORT}/dashboard`);
  console.log('================================================================');

  // 1. Inicializar Base de Datos (PostgreSQL o fallback)
  await OutreachRepo.init();

  // 2. Inicializar WhatsApp Baileys
  await whatsapp.init();

  // 3. Iniciar Pipeline Continuo Autónomo
  AutonomousPipeline.start();
});

