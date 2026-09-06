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
  GatewayStatusResponse
} from '../types/index.js';
import fs from 'fs';
import path from 'path';

dotenv.config();

const app = express();
app.use(express.json());

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

// 2. Información Headless en Root
app.get('/', (_req: Request, res: Response) => {
  const waStatus = whatsapp.getStatus();
  res.json({
    service: 'qp-outreach-engine',
    version: '2.0.0',
    mode: 'headless-ai-gateway',
    status: 'online',
    whatsappConnected: waStatus.isReady,
    mcp: {
      protocol: 'Model Context Protocol (MCP)',
      sseEndpoint: '/sse',
      messagesEndpoint: '/messages',
      tools: [
        'outreach_status',
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

