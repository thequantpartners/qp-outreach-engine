import { DbConnection } from './connection.js';
import {
  ServiceDefinition,
  Lead,
  LeadStatus,
  ChatMessage,
  CampaignSettings,
  ScrapedLead
} from '../types/index.js';

export class OutreachRepo {
  private static defaultServices: ServiceDefinition[] = [
    {
      id: 'licitaciones-qp',
      name: 'Licitaciones QP - Dictámenes Periciales y Compras Estatales',
      description: 'Consultoría técnica y dictámenes periciales para empresas contratistas del estado (EsSalud, MINSA, Gobiernos Regionales).',
      targetPersona: 'Gerentes de operaciones, directores comerciales y jefes de licitaciones de empresas proveedoras de salud e infraestructura.',
      apifyQueries: [
        'distribuidora medica lima',
        'equipos medicos lima',
        'mantenimiento biomedico lima'
      ],
      targetLocations: ['Lima, Peru', 'Piura, Peru', 'Arequipa, Peru'],
      outreachTemplate: 'Buenas tardes, un gusto saludarlos.\n\nLe escribe Kenneth de Licitaciones QP al equipo de {{name}}.\n\nRevisamos las bases del concurso de EsSalud Piura (CP-03) de S/. 2.85M en mantenimiento biomédico y detectamos 2 penalidades operativas severas del 5% de la UIT.\n\nPreparamos un dictamen en PDF de 3 páginas para su área técnica; ¿me permite compartírselo por aquí?',
      closingType: 'MEETING_LINK',
      closingPayload: {
        meetingUrl: 'https://cal.com/kenneth-qp/dictamen-licitaciones',
        closingMessage: 'Excelente, podemos revisar los hallazgos críticos del dictamen en una sesión técnica de 15 minutos. Le comparto el enlace directo para agendar la fecha que mejor le acomode:\nhttps://cal.com/kenneth-qp/dictamen-licitaciones'
      },
      aiSystemPrompt: 'Eres Kenneth, socio consultor en Licitaciones QP. Tu objetivo es conversar con directivos de empresas contratistas con un tono consultivo, analítico, seguro y profesional. NUNCA envíes enlaces web en el primer mensaje. Si muestran interés o aceptan ver el dictamen, ofrece una breve reunión de 15 minutos compartiendo el enlace. Si tienen objeciones técnicas o de costo, aclara que el dictamen preliminar no tiene costo y busca blindar sus contratos.',
      isActive: true
    },
    {
      id: 'lar-engine',
      name: 'LAR Engine - Infraestructura y Cierre High-Ticket B2B',
      description: 'Implementación de arquitectura y motores de conversión y cierre en WhatsApp para agencias, consultores y coaches B2B.',
      targetPersona: 'Dueños de agencias, consultores de negocios y coaches B2B que facturan más de $3,000/mes.',
      apifyQueries: [
        'agencia de marketing digital lima',
        'consultoria de negocios lima',
        'coaching empresarial lima'
      ],
      targetLocations: ['Lima, Peru', 'Bogota, Colombia', 'Santiago, Chile'],
      outreachTemplate: 'Hola {{name}}, un saludo.\n\nLe escribe Kenneth de The Quant Partners.\n\nEstuvimos revisando el posicionamiento de {{name}} en consultoría y notamos una oportunidad inmediata para triplicar la tasa de respuesta en WhatsApp con prospección B2B automatizada.\n\n¿Me permite compartirle un video de 3 minutos con el desglose exacto de la arquitectura?',
      closingType: 'MEETING_LINK',
      closingPayload: {
        meetingUrl: 'https://cal.com/kenneth-qp/estrategia-b2b',
        closingMessage: 'Perfecto. Le dejo aquí el acceso para coordinar una sesión estratégica de 20 minutos donde revisaremos la viabilidad técnica para su agencia:\nhttps://cal.com/kenneth-qp/estrategia-b2b'
      },
      aiSystemPrompt: 'Eres Kenneth de The Quant Partners. Hablas como un estratega de adquisición B2B de alto nivel. Respuestas concisas (máximo 2 a 3 oraciones por mensaje). No hagas discursos largos. Si preguntan detalles, califica si tienen volumen comercial y guíalos a agendar una sesión de estrategia.',
      isActive: true
    },
    {
      id: 'custom-service',
      name: 'Servicio B2B Personalizado',
      description: 'Plantilla adaptable para prospección continua de cualquier producto o servicio B2B.',
      targetPersona: 'Directores y dueños de empresas B2B.',
      apifyQueries: ['empresas de logistica lima', 'proveedores industriales lima'],
      targetLocations: ['Lima, Peru'],
      outreachTemplate: 'Buenas tardes al equipo de {{name}}.\n\nLe escribe Kenneth de The Quant Partners. Hemos desarrollado una solución específica para optimizar operaciones en su sector.\n\n¿Me permite compartirle un breve resumen por este medio?',
      closingType: 'PAYMENT_INFO',
      closingPayload: {
        paymentDetails: 'BCP Soles: 191-XXXXXXXX-0-XX\nInterbank: 200-XXXXXXXX-XX\nYape/Plin: 519XXXXXXXX',
        closingMessage: 'Con gusto coordinamos la activación. Los datos bancarios corporativos para la confirmación del servicio son:\nBCP Soles: 191-XXXXXXXX-0-XX (CCI: 002191...)\nYape/Plin: 519XXXXXXXX\nUna vez realizado nos remite el comprobante para emitir la factura.'
      },
      aiSystemPrompt: 'Eres un asesor comercial consultivo. Atiende dudas y consultas con cordialidad y precisión. Si el cliente solicita contratar o pagar, proporciona los datos de pago y confirma el inicio del servicio.',
      isActive: false
    }
  ];

  public static async init(): Promise<void> {
    await DbConnection.init();

    if (DbConnection.isPg()) {
      await OutreachRepo.initPgSchema();
    } else {
      await OutreachRepo.initFallbackSchema();
    }
  }

  private static async initPgSchema(): Promise<void> {
    const pool = DbConnection.getPool();

    await pool.query(`
      CREATE TABLE IF NOT EXISTS services (
        id VARCHAR(100) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        target_persona TEXT,
        apify_queries JSONB NOT NULL DEFAULT '[]',
        target_locations JSONB NOT NULL DEFAULT '[]',
        outreach_template TEXT NOT NULL,
        closing_type VARCHAR(50) NOT NULL DEFAULT 'MEETING_LINK',
        closing_payload JSONB NOT NULL DEFAULT '{}',
        ai_system_prompt TEXT NOT NULL,
        is_active BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS leads (
        id SERIAL PRIMARY KEY,
        service_id VARCHAR(100) REFERENCES services(id) ON DELETE SET NULL,
        company_name VARCHAR(255) NOT NULL,
        phone VARCHAR(50) UNIQUE NOT NULL,
        website VARCHAR(500),
        address TEXT,
        category VARCHAR(150),
        status VARCHAR(50) NOT NULL DEFAULT 'DISCOVERED',
        last_message_at TIMESTAMP WITH TIME ZONE,
        human_takeover_at TIMESTAMP WITH TIME ZONE,
        custom_fields JSONB DEFAULT '{}',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS chat_messages (
        id SERIAL PRIMARY KEY,
        lead_phone VARCHAR(50) NOT NULL,
        role VARCHAR(20) NOT NULL,
        content TEXT NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS campaign_settings (
        id VARCHAR(50) PRIMARY KEY,
        daily_limit INT NOT NULL DEFAULT 35,
        min_delay_seconds INT NOT NULL DEFAULT 180,
        max_delay_seconds INT NOT NULL DEFAULT 300,
        start_hour INT NOT NULL DEFAULT 9,
        end_hour INT NOT NULL DEFAULT 19,
        admin_whatsapp_phone VARCHAR(50) NOT NULL DEFAULT '',
        webhook_url VARCHAR(500),
        is_autonomous_active BOOLEAN NOT NULL DEFAULT true,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Comprobar si existen servicios iniciales
    const checkServices = await pool.query('SELECT COUNT(*) FROM services');
    if (parseInt(checkServices.rows[0].count, 10) === 0) {
      console.log('[OutreachRepo] Insertando presets de servicios iniciales en PostgreSQL...');
      for (const s of OutreachRepo.defaultServices) {
        await pool.query(
          `INSERT INTO services (id, name, description, target_persona, apify_queries, target_locations, outreach_template, closing_type, closing_payload, ai_system_prompt, is_active)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
           ON CONFLICT (id) DO NOTHING`,
          [
            s.id,
            s.name,
            s.description,
            s.targetPersona,
            JSON.stringify(s.apifyQueries),
            JSON.stringify(s.targetLocations),
            s.outreachTemplate,
            s.closingType,
            JSON.stringify(s.closingPayload),
            s.aiSystemPrompt,
            s.isActive
          ]
        );
      }
    }

    // Configuración inicial
    const initialAdminPhone = process.env.ADMIN_WHATSAPP_PHONE || '';
    await pool.query(`
      INSERT INTO campaign_settings (id, daily_limit, min_delay_seconds, max_delay_seconds, start_hour, end_hour, admin_whatsapp_phone, is_autonomous_active)
      VALUES ('main_config', 35, 180, 300, 9, 19, $1, true)
      ON CONFLICT (id) DO NOTHING;
    `, [initialAdminPhone]);

    console.log('✅ [OutreachRepo] Tablas y esquema de PostgreSQL listos.');
  }

  private static async initFallbackSchema(): Promise<void> {
    const data = DbConnection.getFallbackData();
    if (!data.services || data.services.length === 0) {
      data.services = OutreachRepo.defaultServices;
      DbConnection.saveFallbackData(data);
      console.log('✅ [OutreachRepo] Servicios iniciales cargados en fallback local.');
    }
  }

  // --- SERVICIOS ---
  public static async getServices(): Promise<ServiceDefinition[]> {
    if (DbConnection.isPg()) {
      const res = await DbConnection.getPool().query('SELECT * FROM services ORDER BY created_at ASC');
      return res.rows.map(r => ({
        id: r.id,
        name: r.name,
        description: r.description,
        targetPersona: r.target_persona,
        apifyQueries: r.apify_queries || [],
        targetLocations: r.target_locations || [],
        outreachTemplate: r.outreach_template,
        closingType: r.closing_type,
        closingPayload: r.closing_payload || {},
        aiSystemPrompt: r.ai_system_prompt,
        isActive: r.is_active,
        createdAt: r.created_at?.toISOString()
      }));
    } else {
      const data = DbConnection.getFallbackData();
      return data.services || [];
    }
  }

  public static async getServiceById(id: string): Promise<ServiceDefinition | null> {
    const services = await OutreachRepo.getServices();
    return services.find(s => s.id === id) || null;
  }

  public static async getActiveService(): Promise<ServiceDefinition | null> {
    const services = await OutreachRepo.getServices();
    return services.find(s => s.isActive) || services[0] || null;
  }

  public static async saveService(s: ServiceDefinition): Promise<void> {
    if (DbConnection.isPg()) {
      await DbConnection.getPool().query(
        `INSERT INTO services (id, name, description, target_persona, apify_queries, target_locations, outreach_template, closing_type, closing_payload, ai_system_prompt, is_active)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         ON CONFLICT (id) DO UPDATE SET
           name = EXCLUDED.name,
           description = EXCLUDED.description,
           target_persona = EXCLUDED.target_persona,
           apify_queries = EXCLUDED.apify_queries,
           target_locations = EXCLUDED.target_locations,
           outreach_template = EXCLUDED.outreach_template,
           closing_type = EXCLUDED.closing_type,
           closing_payload = EXCLUDED.closing_payload,
           ai_system_prompt = EXCLUDED.ai_system_prompt,
           is_active = EXCLUDED.is_active;`,
        [
          s.id,
          s.name,
          s.description,
          s.targetPersona,
          JSON.stringify(s.apifyQueries),
          JSON.stringify(s.targetLocations),
          s.outreachTemplate,
          s.closingType,
          JSON.stringify(s.closingPayload),
          s.aiSystemPrompt,
          s.isActive
        ]
      );
    } else {
      const data = DbConnection.getFallbackData();
      const idx = (data.services || []).findIndex((x: any) => x.id === s.id);
      if (idx >= 0) {
        data.services[idx] = s;
      } else {
        data.services.push(s);
      }
      DbConnection.saveFallbackData(data);
    }
  }

  public static async deleteService(id: string, deleteLeads: boolean = true): Promise<{ success: boolean; message: string }> {
    if (DbConnection.isPg()) {
      const pool = DbConnection.getPool();
      if (deleteLeads) {
        await pool.query('DELETE FROM leads WHERE service_id = $1', [id]);
      }
      const res = await pool.query('DELETE FROM services WHERE id = $1', [id]);
      const success = (res.rowCount ?? 0) > 0;
      return {
        success,
        message: success ? `Campaña "${id}" eliminada exitosamente.` : `No se encontró la campaña "${id}".`
      };
    } else {
      const data = DbConnection.getFallbackData();
      const initialServiceCount = (data.services || []).length;
      data.services = (data.services || []).filter((s: any) => s.id !== id);

      let deletedLeadsCount = 0;
      if (deleteLeads && data.leads) {
        const initialLeadCount = data.leads.length;
        data.leads = data.leads.filter((l: any) => l.serviceId !== id);
        deletedLeadsCount = initialLeadCount - data.leads.length;
      }

      DbConnection.saveFallbackData(data);
      const wasDeleted = data.services.length < initialServiceCount;
      return {
        success: wasDeleted,
        message: wasDeleted
          ? `Campaña "${id}" eliminada exitosamente (${deletedLeadsCount} prospectos removidos).`
          : `No se encontró la campaña "${id}".`
      };
    }
  }

  // --- LEADS ---
  public static async saveLeadsFromScraper(serviceId: string, items: ScrapedLead[]): Promise<{ inserted: number; skipped: number }> {
    let inserted = 0;
    let skipped = 0;

    for (const item of items) {
      if (!item.phoneClean || item.phoneClean.length < 8) {
        skipped++;
        continue;
      }

      // Estandarizar teléfonos peruanos si tienen 9 dígitos
      let clean = item.phoneClean;
      if (clean.length === 9 && clean.startsWith('9')) {
        clean = `51${clean}`;
      }

      const leadData: Lead = {
        serviceId,
        companyName: item.title || 'Empresa B2B',
        phone: clean,
        website: item.website,
        address: item.address,
        category: item.categoryName,
        status: 'DISCOVERED',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      if (DbConnection.isPg()) {
        try {
          const res = await DbConnection.getPool().query(
            `INSERT INTO leads (service_id, company_name, phone, website, address, category, status, created_at, updated_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
             ON CONFLICT (phone) DO NOTHING RETURNING id`,
            [leadData.serviceId, leadData.companyName, leadData.phone, leadData.website, leadData.address, leadData.category, leadData.status]
          );
          if (res.rowCount && res.rowCount > 0) {
            inserted++;
          } else {
            skipped++;
          }
        } catch {
          skipped++;
        }
      } else {
        const data = DbConnection.getFallbackData();
        const exists = (data.leads || []).some((l: Lead) => l.phone === clean);
        if (!exists) {
          data.leads = data.leads || [];
          data.leads.push(leadData);
          DbConnection.saveFallbackData(data);
          inserted++;
        } else {
          skipped++;
        }
      }
    }

    return { inserted, skipped };
  }

  public static async getLeadByPhone(phone: string): Promise<Lead | null> {
    const clean = phone.replace(/[^0-9]/g, '');
    if (DbConnection.isPg()) {
      const res = await DbConnection.getPool().query('SELECT * FROM leads WHERE phone = $1', [clean]);
      if (res.rows.length === 0) return null;
      const r = res.rows[0];
      return {
        id: r.id,
        serviceId: r.service_id,
        companyName: r.company_name,
        phone: r.phone,
        website: r.website,
        address: r.address,
        category: r.category,
        status: r.status,
        lastMessageAt: r.last_message_at?.toISOString(),
        humanTakeoverAt: r.human_takeover_at?.toISOString(),
        customFields: r.custom_fields || {},
        createdAt: r.created_at?.toISOString(),
        updatedAt: r.updated_at?.toISOString()
      };
    } else {
      const data = DbConnection.getFallbackData();
      return (data.leads || []).find((l: Lead) => l.phone === clean) || null;
    }
  }

  public static async getLeads(filters?: { serviceId?: string; status?: LeadStatus; search?: string; limit?: number }): Promise<Lead[]> {
    const limit = filters?.limit || 100;

    if (DbConnection.isPg()) {
      let query = 'SELECT * FROM leads WHERE 1=1';
      const params: any[] = [];
      let pIndex = 1;

      if (filters?.serviceId) {
        query += ` AND service_id = $${pIndex++}`;
        params.push(filters.serviceId);
      }
      if (filters?.status) {
        query += ` AND status = $${pIndex++}`;
        params.push(filters.status);
      }
      if (filters?.search) {
        query += ` AND (company_name ILIKE $${pIndex} OR phone ILIKE $${pIndex})`;
        params.push(`%${filters.search}%`);
        pIndex++;
      }

      query += ` ORDER BY updated_at DESC LIMIT $${pIndex}`;
      params.push(limit);

      const res = await DbConnection.getPool().query(query, params);
      return res.rows.map(r => ({
        id: r.id,
        serviceId: r.service_id,
        companyName: r.company_name,
        phone: r.phone,
        website: r.website,
        address: r.address,
        category: r.category,
        status: r.status,
        lastMessageAt: r.last_message_at?.toISOString(),
        humanTakeoverAt: r.human_takeover_at?.toISOString(),
        customFields: r.custom_fields || {},
        createdAt: r.created_at?.toISOString(),
        updatedAt: r.updated_at?.toISOString()
      }));
    } else {
      const data = DbConnection.getFallbackData();
      let list: Lead[] = data.leads || [];

      if (filters?.serviceId) {
        list = list.filter(l => l.serviceId === filters.serviceId);
      }
      if (filters?.status) {
        list = list.filter(l => l.status === filters.status);
      }
      if (filters?.search) {
        const s = filters.search.toLowerCase();
        list = list.filter(l => l.companyName.toLowerCase().includes(s) || l.phone.includes(s));
      }

      return list.slice(0, limit);
    }
  }

  public static async updateLeadStatus(phone: string, status: LeadStatus, extra?: { humanTakeoverAt?: string | null }): Promise<void> {
    const clean = phone.replace(/[^0-9]/g, '');
    if (DbConnection.isPg()) {
      let query = 'UPDATE leads SET status = $1, updated_at = NOW()';
      const params: any[] = [status];
      let pIndex = 2;

      if (extra?.humanTakeoverAt !== undefined) {
        query += `, human_takeover_at = $${pIndex++}`;
        params.push(extra.humanTakeoverAt);
      }

      query += `, last_message_at = NOW() WHERE phone = $${pIndex}`;
      params.push(clean);

      await DbConnection.getPool().query(query, params);
    } else {
      const data = DbConnection.getFallbackData();
      const lead = (data.leads || []).find((l: Lead) => l.phone === clean);
      if (lead) {
        lead.status = status;
        lead.updatedAt = new Date().toISOString();
        lead.lastMessageAt = new Date().toISOString();
        if (extra?.humanTakeoverAt !== undefined) {
          lead.humanTakeoverAt = extra.humanTakeoverAt || undefined;
        }
        DbConnection.saveFallbackData(data);
      }
    }
  }

  public static async getLeadsForOutreach(limit: number = 30): Promise<Lead[]> {
    if (DbConnection.isPg()) {
      const res = await DbConnection.getPool().query(
        `SELECT * FROM leads 
         WHERE status IN ('DISCOVERED', 'QUEUED')
         ORDER BY id ASC LIMIT $1`,
        [limit]
      );
      return res.rows.map(r => ({
        id: r.id,
        serviceId: r.service_id,
        companyName: r.company_name,
        phone: r.phone,
        website: r.website,
        address: r.address,
        category: r.category,
        status: r.status,
        lastMessageAt: r.last_message_at?.toISOString(),
        humanTakeoverAt: r.human_takeover_at?.toISOString(),
        createdAt: r.created_at?.toISOString(),
        updatedAt: r.updated_at?.toISOString()
      }));
    } else {
      const data = DbConnection.getFallbackData();
      return (data.leads || [])
        .filter((l: Lead) => l.status === 'DISCOVERED' || l.status === 'QUEUED')
        .slice(0, limit);
    }
  }

  public static async countUncontactedLeads(serviceId?: string): Promise<number> {
    if (DbConnection.isPg()) {
      let query = "SELECT COUNT(*) FROM leads WHERE status IN ('DISCOVERED', 'QUEUED')";
      const params: any[] = [];
      if (serviceId) {
        query += ' AND service_id = $1';
        params.push(serviceId);
      }
      const res = await DbConnection.getPool().query(query, params);
      return parseInt(res.rows[0].count, 10);
    } else {
      const data = DbConnection.getFallbackData();
      return (data.leads || []).filter((l: Lead) => {
        const matchesService = !serviceId || l.serviceId === serviceId;
        return matchesService && (l.status === 'DISCOVERED' || l.status === 'QUEUED');
      }).length;
    }
  }

  // --- CHAT MESSAGES ---
  public static async addChatMessage(leadPhone: string, role: 'assistant' | 'user' | 'human_agent' | 'system', content: string): Promise<void> {
    const clean = leadPhone.replace(/[^0-9]/g, '');
    if (DbConnection.isPg()) {
      await DbConnection.getPool().query(
        `INSERT INTO chat_messages (lead_phone, role, content, created_at)
         VALUES ($1, $2, $3, NOW())`,
        [clean, role, content]
      );
    } else {
      const data = DbConnection.getFallbackData();
      data.messages = data.messages || [];
      data.messages.push({
        leadPhone: clean,
        role,
        content,
        createdAt: new Date().toISOString()
      });
      DbConnection.saveFallbackData(data);
    }
  }

  public static async getChatHistory(leadPhone: string, limit: number = 30): Promise<ChatMessage[]> {
    const clean = leadPhone.replace(/[^0-9]/g, '');
    if (DbConnection.isPg()) {
      const res = await DbConnection.getPool().query(
        `SELECT * FROM chat_messages WHERE lead_phone = $1 ORDER BY created_at ASC LIMIT $2`,
        [clean, limit]
      );
      return res.rows.map(r => ({
        id: r.id,
        leadPhone: r.lead_phone,
        role: r.role,
        content: r.content,
        createdAt: r.created_at?.toISOString()
      }));
    } else {
      const data = DbConnection.getFallbackData();
      return (data.messages || [])
        .filter((m: ChatMessage) => m.leadPhone === clean)
        .slice(-limit);
    }
  }

  // --- SETTINGS ---
  public static async getSettings(): Promise<CampaignSettings> {
    if (DbConnection.isPg()) {
      const res = await DbConnection.getPool().query('SELECT * FROM campaign_settings LIMIT 1');
      if (res.rows.length === 0) {
        return {
          dailyLimit: 35,
          minDelaySeconds: 180,
          maxDelaySeconds: 300,
          startHour: 9,
          endHour: 19,
          adminWhatsAppPhone: process.env.ADMIN_WHATSAPP_PHONE || '',
          isAutonomousActive: true
        };
      }
      const r = res.rows[0];
      return {
        dailyLimit: r.daily_limit,
        minDelaySeconds: r.min_delay_seconds,
        maxDelaySeconds: r.max_delay_seconds,
        startHour: r.start_hour,
        endHour: r.end_hour,
        adminWhatsAppPhone: r.admin_whatsapp_phone,
        webhookUrl: r.webhook_url,
        isAutonomousActive: r.is_autonomous_active
      };
    } else {
      const data = DbConnection.getFallbackData();
      return data.settings || {
        dailyLimit: 35,
        minDelaySeconds: 180,
        maxDelaySeconds: 300,
        startHour: 9,
        endHour: 19,
        adminWhatsAppPhone: process.env.ADMIN_WHATSAPP_PHONE || '',
        isAutonomousActive: true
      };
    }
  }

  public static async updateSettings(settings: Partial<CampaignSettings>): Promise<void> {
    if (DbConnection.isPg()) {
      const current = await OutreachRepo.getSettings();
      const updated = { ...current, ...settings };
      await DbConnection.getPool().query(
        `UPDATE campaign_settings SET
           daily_limit = $1,
           min_delay_seconds = $2,
           max_delay_seconds = $3,
           start_hour = $4,
           end_hour = $5,
           admin_whatsapp_phone = $6,
           webhook_url = $7,
           is_autonomous_active = $8,
           updated_at = NOW()
         WHERE id = 'main_config'`,
        [
          updated.dailyLimit,
          updated.minDelaySeconds,
          updated.maxDelaySeconds,
          updated.startHour,
          updated.endHour,
          updated.adminWhatsAppPhone,
          updated.webhookUrl,
          updated.isAutonomousActive
        ]
      );
    } else {
      const data = DbConnection.getFallbackData();
      data.settings = { ...(data.settings || {}), ...settings };
      DbConnection.saveFallbackData(data);
    }
  }

  // --- STATS ---
  public static async getStats(): Promise<{
    totalLeads: number;
    discovered: number;
    outreachSent: number;
    replied: number;
    qualified: number;
    humanTakeover: number;
    closedWon: number;
    closedLost: number;
  }> {
    const leads = await OutreachRepo.getLeads({ limit: 10000 });
    return {
      totalLeads: leads.length,
      discovered: leads.filter(l => l.status === 'DISCOVERED' || l.status === 'QUEUED').length,
      outreachSent: leads.filter(l => l.status === 'OUTREACH_SENT').length,
      replied: leads.filter(l => l.status === 'REPLIED').length,
      qualified: leads.filter(l => l.status === 'QUALIFIED').length,
      humanTakeover: leads.filter(l => l.status === 'HUMAN_TAKEOVER').length,
      closedWon: leads.filter(l => l.status === 'CLOSED_WON').length,
      closedLost: leads.filter(l => l.status === 'CLOSED_LOST').length
    };
  }
}
