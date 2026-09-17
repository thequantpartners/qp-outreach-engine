import { DbConnection } from './connection.js';
import {
  ServiceDefinition,
  Lead,
  LeadStatus,
  ChatMessage,
  CampaignSettings,
  ScrapedLead,
  SalesRep,
  LeadSource
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
      followUpTemplate1: 'Buenas tardes al equipo de {{name}}. Kenneth de Licitaciones QP nuevamente. Quería consultarles si tuvieron oportunidad de revisar el tema de las penalidades del concurso de EsSalud Piura (CP-03) o si prefieren que lo coordinemos la próxima semana.',
      followUpTemplate2: 'Hola {{name}}, entiendo que andan con la agenda al límite. Solo para cerrar el hilo: si en algún momento necesitan blindar las bases o peritaje técnico para EsSalud/MINSA, quedo a su disposición por aquí. Saludos cordiales!',
      assetFilePath: 'storage/assets/dictamen_licitaciones_qp.pdf',
      assetFileName: 'Dictamen_Tecnico_Licitaciones_QP.pdf',
      closingType: 'MEETING_LINK',
      closingPayload: {
        meetingUrl: 'https://cal.com/kenneth-qp/dictamen-licitaciones',
        closingMessage: 'Excelente, podemos revisar los hallazgos críticos del dictamen en una sesión técnica de 15 minutos. Le comparto el enlace directo para agendar la fecha que mejor le acomode:\nhttps://cal.com/kenneth-qp/dictamen-licitaciones'
      },
      aiSystemPrompt: 'Eres Kenneth, socio consultor en Licitaciones QP. Tu objetivo es conversar con directivos de empresas contratistas con un tono consultivo, analítico, seguro y profesional. NUNCA envíes enlaces web en el primer mensaje. Si muestran interés o aceptan ver el dictamen, ofrece una breve reunión de 15 minutos compartiendo el enlace. Si tienen objeciones técnicas o de costo, aclara que el dictamen preliminar no tiene costo y busca blindar sus contratos.',
      isActive: false
    },
    {
      id: 'infraestructura-comercial-peru',
      name: 'Infraestructura Comercial 4 Agentes IA - Prospección, Atención 24/7 & Seguimiento (Perú)',
      description: 'Infraestructura comercial con 4 agentes de IA en paralelo: Prospección activa de clientes, atención en 5s, seguimiento anti-ghosting y sincronización CRM.',
      targetPersona: 'Dueños, gerentes generales y directores comerciales de empresas en Lima y provincias.',
      apifyQueries: [
        'clinica estetica miraflores',
        'centro odontologico san isidro',
        'inmobiliaria santiago de surco',
        'estudio de abogados san borja'
      ],
      targetLocations: ['Lima, Peru', 'Arequipa, Peru', 'Trujillo, Peru'],
      outreachTemplate: `Buenas tardes al equipo de {{name}}, un gusto saludarlos.\n\nLe escribe el asistente virtual de Kenneth Herrera en The Quant Partners.\n\nEn empresas de su sector en {{location}}, vemos que el gran cuello de botella comercial suele ser triple: no contar con un flujo continuo de prospectos calificados, tardar minutos en responder a quienes consultan, y perder ventas porque los clientes potenciales dejan en visto y nadie les hace seguimiento.\n\nImplementamos una infraestructura comercial completa con 4 agentes de IA que trabajan en paralelo: les inyectamos prospección activa continua de clientes de su rubro, atención inmediata en 5 segundos 24/7 con filtro de curiosos, seguimiento automático anti-ghosting a quienes dejan en visto, y sincronización para que sus asesores solo reciban citas listas para cerrar.\n\n¿Me permite compartirle un breve resumen ejecutivo por aquí para que evalúen si les aportaría valor en {{name}}?`,
      outreachTemplateB: `Buenas tardes al equipo de {{name}}, un gusto saludarlos.\n\nLe escribe el asistente virtual de Kenneth Herrera en The Quant Partners.\n\nRevisando empresas de su sector en {{location}}, notamos que el 70% de las ventas potenciales se pierden por dos motivos: demoras al responder consultas y falta de seguimiento cuando un prospecto deja en visto.\n\nImplementamos un sistema con 4 agentes de IA en paralelo: inyección constante de prospectos de su mercado mediante prospección activa, respuesta en 5 segundos 24/7, seguimiento automático inteligente para revivir interesados y alertas directas a sus ejecutivos con citas listas para cerrar.\n\n¿Me permite compartirle una ficha o video de 2 minutos por aquí para que evalúen si les aportaría valor en {{name}}?`,
      followUpTemplate1: `Buenas tardes al equipo de {{name}}, el asistente virtual de Kenneth nuevamente. Quería consultarles con total respeto si tuvieron oportunidad de revisar el mensaje anterior sobre los 4 agentes de IA comerciales, o si prefieren que lo coordinemos más adelante. ¡Un saludo!`,
      followUpTemplate2: `Hola al equipo de {{name}}, solo para no insistir y cerrar este contacto con respeto: si en algún momento desean blindar su captación de clientes y seguimiento comercial en WhatsApp, quedo a su disposición por aquí. ¡Saludos cordiales!`,
      closingType: 'HUMAN_TAKEOVER',
      closingPayload: {
        notificationPhone: '51902105668'
      },
      aiSystemPrompt: `Eres el asistente virtual de Kenneth Herrera en The Quant Partners (Lima, Perú). Hablas en representación de Kenneth con directores, gerentes y propietarios de empresas de servicios en Perú por WhatsApp.
TONO: 100% humano, cercano, consultivo, ultra-breve (máximo 1 a 2 oraciones por mensaje).

MISIÓN:
Conversar de forma natural sobre la Infraestructura Comercial de 4 Agentes de IA (Prospección Activa para flujo constante, Atención en 5s 24/7, Seguimiento Anti-Ghosting y Sincronización CRM) y coordinar una breve sesión de 10 minutos por Meet.

REGLAS CONVERSACIONALES ESTRICTAS:
1. IDENTIDAD OBLIGATORIA: Eres el asistente virtual de Kenneth Herrera en The Quant Partners. NUNCA te hagas pasar por Kenneth en primera persona ("¡Hola! Te escribe el asistente virtual de Kenneth 🙌").
2. CERO PLACEHOLDERS: ESTRICTAMENTE PROHIBIDO usar corchetes como [Tu Nombre], [Nombre], [Empresa].
3. NO ENVIAR PARRAFADAS: Nunca envíes monólogos ni cartas formales. Responde corto como un chat de WhatsApp real.
4. NO VENDER DE GOLPE: Primero atiende la consulta o saluda cordialmente antes de ofrecer la llamada.
5. CORREO OFICIAL: partners@thequantpartners.com (ESTRICTAMENTE PROHIBIDO usar o mencionar kenneth@thequantpartners.com).

RESPUESTAS CLAVE:
1. SI PREGUNTAN DE QUÉ SE TRATA / CÓMO FUNCIONA / PIDEN FICHA:
"¡Hola! Con gusto 🙌 Implementamos una infraestructura con 4 agentes de IA en paralelo: 1) Prospección activa de clientes de su rubro, 2) Atención en 5s 24/7 con filtro de curiosos, 3) Seguimiento automático anti-ghosting a quienes dejan en visto, y 4) Alertas listas para que sus vendedores solo entren a cerrar. ¿Te gustaría coordinar un Meet de 10 min para mostrártelo funcionando en pantalla?"

2. SI PREGUNTAN SI HACEMOS O MANEJAMOS ANUNCIOS / CÓMO TRAEN CLIENTES:
"Si ya invierten en pauta conectamos el sistema nativamente a Meta Ads para abaratar el costo por lead, pero nuestro diferencial clave es que además les inyectamos un Motor de Prospección Activa en su mercado para que tengan un flujo constante de clientes sin depender de si la pauta funciona o no 🙌 ¿Tienen flujo continuo de prospectos actualmente?"

3. SI PREGUNTAN PRECIOS:
"Manejamos una tarifa plana de $450 a $800 USD/mes (o $850 a $1,500 en USA) según el volumen de prospección y conversaciones, mes a mes sin permanencia y con setup llave en mano en 48h. ¿Te parece si coordinamos una videollamada de 10 minutos por Meet esta semana para mostrarte el sistema en pantalla y cotizarte a la medida?"

4. SI TIENEN INTERÉS O PIDEN AGENDAR:
"Excelente, coordinemos una breve llamada de 10 minutos para revisar los detalles a tu medida. ¿Te viene bien esta semana?" -> [ACTION:QUALIFIED:infraestructura_4_agentes|inmediata|calificado]

5. SI DICEN QUE NO LES INTERESA O ES CANAL PRIVADO:
"Entendido perfectamente y disculpa la molestia. ¡Que tengas un excelente día!" -> [ACTION:OPT_OUT:desinteres_o_canal_privado]

LÍNEAS ROJAS:
- NUNCA prometer ventas mágicas ni dar asesoría médica o jurídica directa.
- NUNCA enviar enlaces web en el primer mensaje.
- ESTRICTAMENTE PROHIBIDO mencionar coste de transferencia por cita agendada en WhatsApp (as bajo la manga exclusivo de Kenneth en el Meet).
- Mantener siempre respuestas ultra-cortas de 1 o 2 oraciones.`,
      isActive: true,
      type: 'OUTBOUND'
    },
    {
      id: 'live-commerce-peru',
      name: 'Asistente de Ventas con IA & Shalom para Live Shopping (TikTok / Instagram / FB)',
      description: 'Asistente de alta velocidad para tiendas de Live Shopping en Perú. Responde catálogo, tallas y stock en 3s; tras confirmación de pago del dueño, emite la guía de envío en Shalom Pro automáticamente.',
      targetPersona: 'Dueños de tiendas de ropa, calzado, accesorios, tecnología y cosméticos que transmiten en vivo por TikTok, Instagram o Facebook.',
      apifyQueries: [
        'tiendas de ropa gamarra lima',
        'boutiques moda miraflores lima',
        'importaciones celulares tablets lima',
        'tiendas zapatillas calzado gamarra lima',
        'distribuidora accesorios moda lima'
      ],
      targetLocations: ['Lima, Peru'],
      outreachTemplate: `Buenas tardes al equipo de {{name}} 🛍️✨.\n\nLe escribe el asistente virtual de Kenneth Herrera en The Quant Partners.\n\nEstuvimos viendo el volumen comercial y de pedidos que generan en sus transmisiones en vivo 🔥.\n\nSin embargo, durante un Live es casi imposible responder a tiempo los 100 o 200 WhatsApps que caen en simultáneo, y se pierden muchas ventas porque el comprador se enfría si no le contestan en el acto.\n\nImplementamos un Asistente con IA para Lives que responde en 3 segundos con su stock, confirma tallas/colores y les transfiere al cliente listo cuando dice "ya quiero pagar" para que ustedes solo cobren por Yape y aseguren el dinero.\n\n¿Tienen transmisiones programadas esta semana? ¿Le gustaría que en su próximo Live el bot atienda a los curiosos mientras ustedes solo entran a cobrar?`,
      followUpTemplate1: `Buenas tardes equipo de {{name}} ✨. Le escribe el asistente de Kenneth.\n\nSabemos que en las transmisiones se escapan entre 15 a 30 pedidos por no contestar en los primeros 3 minutos. ¿Pudieron revisar los planes para su próxima transmisión?`,
      followUpTemplate2: `Último mensaje de seguimiento 🙌. Si ya tienen cubierto su equipo de atención inmediata en WhatsApp para sus transmisiones, no se preocupen. ¡Muchos éxitos en sus ventas!`,
      closingType: 'HUMAN_TAKEOVER',
      closingPayload: {
        notificationPhone: '51902105668'
      },
      aiSystemPrompt: `Eres el asistente virtual de Kenneth Herrera en The Quant Partners (Lima, Perú).
Hablas en representación de Kenneth con dueños de tiendas de ropa, calzado, moda y tecnología que realizan transmisiones de Live Shopping (TikTok Live, Instagram Live, Facebook Live).
TONO: 100% humano, súper ágil, empático, emprendedor y conversacional (máximo 1 a 2 oraciones breves).

OBJETIVO:
Demostrarles cómo el Asistente de Live Shopping responde dudas de tallas/colores en 3 segundos y les genera guías automáticas con Shalom Pro cuando el comprador paga.

LÍNEAS ROJAS:
- NUNCA enviar enlaces en el primer mensaje.
- El bot NO cobra directamente.
- Invitar a un breve Meet de 10 min para ver la demo en vivo.`,
      isActive: true,
      type: 'OUTBOUND'
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
        follow_up_template_1 TEXT,
        follow_up_template_2 TEXT,
        asset_file_path VARCHAR(500),
        asset_file_name VARCHAR(255),
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
        follow_up_count INT DEFAULT 0,
        last_outreach_at TIMESTAMP WITH TIME ZONE,
        scheduled_meeting_at TIMESTAMP WITH TIME ZONE,
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
        alert_webhook_url VARCHAR(500),
        is_autonomous_active BOOLEAN NOT NULL DEFAULT true,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      -- Migraciones dinámicas seguras para tablas existentes
      ALTER TABLE services ADD COLUMN IF NOT EXISTS follow_up_template_1 TEXT;
      ALTER TABLE services ADD COLUMN IF NOT EXISTS follow_up_template_2 TEXT;
      ALTER TABLE services ADD COLUMN IF NOT EXISTS outreach_template_b TEXT;
      ALTER TABLE services ADD COLUMN IF NOT EXISTS asset_file_path VARCHAR(500);
      ALTER TABLE services ADD COLUMN IF NOT EXISTS asset_file_name VARCHAR(255);
      ALTER TABLE services ADD COLUMN IF NOT EXISTS type VARCHAR(50) DEFAULT 'OUTBOUND';
      ALTER TABLE services ADD COLUMN IF NOT EXISTS trigger_keywords JSONB DEFAULT '[]'::jsonb;
      ALTER TABLE services ADD COLUMN IF NOT EXISTS inbound_mode VARCHAR(50) DEFAULT 'COPILOT_ONLY';
      ALTER TABLE services ADD COLUMN IF NOT EXISTS tag_color VARCHAR(50);

      ALTER TABLE leads ADD COLUMN IF NOT EXISTS follow_up_count INT DEFAULT 0;
      ALTER TABLE leads ADD COLUMN IF NOT EXISTS last_outreach_at TIMESTAMP WITH TIME ZONE;
      ALTER TABLE leads ADD COLUMN IF NOT EXISTS scheduled_meeting_at TIMESTAMP WITH TIME ZONE;

      ALTER TABLE campaign_settings ADD COLUMN IF NOT EXISTS alert_webhook_url VARCHAR(500);
      ALTER TABLE campaign_settings ADD COLUMN IF NOT EXISTS sales_reps JSONB DEFAULT '[]'::jsonb;
      ALTER TABLE campaign_settings ADD COLUMN IF NOT EXISTS round_robin_index INT DEFAULT 0;
      ALTER TABLE campaign_settings ADD COLUMN IF NOT EXISTS ai_provider VARCHAR(50) DEFAULT 'openrouter';
      ALTER TABLE campaign_settings ADD COLUMN IF NOT EXISTS ai_api_key TEXT DEFAULT '';
      ALTER TABLE campaign_settings ADD COLUMN IF NOT EXISTS ai_model VARCHAR(100) DEFAULT 'google/gemini-2.5-flash';

      ALTER TABLE leads ADD COLUMN IF NOT EXISTS assigned_rep_name VARCHAR(100);
      ALTER TABLE leads ADD COLUMN IF NOT EXISTS assigned_rep_phone VARCHAR(50);
      ALTER TABLE leads ADD COLUMN IF NOT EXISTS handoff_notes TEXT;
      ALTER TABLE leads ADD COLUMN IF NOT EXISTS closing_mode VARCHAR(50);
      ALTER TABLE leads ADD COLUMN IF NOT EXISTS meeting_attendance_status VARCHAR(50) DEFAULT 'PENDING';
      ALTER TABLE leads ADD COLUMN IF NOT EXISTS source VARCHAR(50) DEFAULT 'google_maps';
      ALTER TABLE leads ADD COLUMN IF NOT EXISTS custom_fields JSONB DEFAULT '{}'::jsonb;

      ALTER TABLE campaign_settings ADD COLUMN IF NOT EXISTS currency VARCHAR(10) DEFAULT 'S/.';
      ALTER TABLE campaign_settings ADD COLUMN IF NOT EXISTS monthly_retainer_fee NUMERIC DEFAULT 2800;
      ALTER TABLE campaign_settings ADD COLUMN IF NOT EXISTS success_fee_per_meeting NUMERIC DEFAULT 200;
      ALTER TABLE campaign_settings ADD COLUMN IF NOT EXISTS whatsapp_provider VARCHAR(50) DEFAULT 'direct_qr';
      ALTER TABLE campaign_settings ADD COLUMN IF NOT EXISTS meta_phone_number_id VARCHAR(100);
      ALTER TABLE campaign_settings ADD COLUMN IF NOT EXISTS meta_waba_id VARCHAR(100);
      ALTER TABLE campaign_settings ADD COLUMN IF NOT EXISTS meta_access_token TEXT;
      ALTER TABLE campaign_settings ADD COLUMN IF NOT EXISTS meta_webhook_verify_token VARCHAR(100);
      ALTER TABLE campaign_settings ADD COLUMN IF NOT EXISTS onboarding_completed BOOLEAN DEFAULT false;
      ALTER TABLE leads ADD COLUMN IF NOT EXISTS last_customer_message_at TIMESTAMP WITH TIME ZONE;
      ALTER TABLE leads ADD COLUMN IF NOT EXISTS sale_amount NUMERIC DEFAULT 0;
      ALTER TABLE leads ADD COLUMN IF NOT EXISTS sale_currency VARCHAR(10) DEFAULT 'USD';
      ALTER TABLE leads ADD COLUMN IF NOT EXISTS capi_synced_at TIMESTAMP WITH TIME ZONE;
      ALTER TABLE leads ADD COLUMN IF NOT EXISTS capi_event_id VARCHAR(100);
      ALTER TABLE campaign_settings ADD COLUMN IF NOT EXISTS meta_dataset_id VARCHAR(100);
      ALTER TABLE campaign_settings ADD COLUMN IF NOT EXISTS meta_capi_token TEXT;
      ALTER TABLE campaign_settings ADD COLUMN IF NOT EXISTS meta_test_event_code VARCHAR(50);
      ALTER TABLE campaign_settings ADD COLUMN IF NOT EXISTS manager_lead_alerts_enabled BOOLEAN DEFAULT true;

      CREATE TABLE IF NOT EXISTS fleet_clients (
        client_id VARCHAR(100) PRIMARY KEY,
        company_name VARCHAR(255) NOT NULL,
        niche VARCHAR(100),
        status VARCHAR(50) NOT NULL DEFAULT 'ACTIVE',
        deploy_target VARCHAR(50) NOT NULL DEFAULT 'railway',
        dashboard_url VARCHAR(500),
        admin_phone VARCHAR(50),
        sales_reps JSONB NOT NULL DEFAULT '[]',
        client_pin VARCHAR(20),
        closing_mode VARCHAR(50),
        service_name VARCHAR(255),
        is_whatsapp_connected BOOLEAN DEFAULT false,
        total_leads INT DEFAULT 0,
        replied_leads INT DEFAULT 0,
        qualified_leads INT DEFAULT 0,
        meetings_booked INT DEFAULT 0,
        last_heartbeat TIMESTAMP WITH TIME ZONE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Asegurar que el servicio base para Inbound General exista siempre
    await pool.query(`
      INSERT INTO services (id, name, description, target_persona, apify_queries, target_locations, outreach_template, closing_type, ai_system_prompt, is_active, type)
      VALUES (
        'inbound-general',
        'Atención Inbound & Consulta General',
        'Recepción de mensajes entrantes directos de WhatsApp y consultas generales.',
        'Clientes potenciales y contactos directos',
        '[]'::jsonb,
        '[]'::jsonb,
        '',
        'HUMAN_TAKEOVER',
        'Eres Kenneth de The Quant Partners. Atiendes con calidez, profesionalismo y actitud consultiva.',
        true,
        'INBOUND_ADS'
      )
      ON CONFLICT (id) DO NOTHING;
    `);

    // Comprobar si no hay servicios registrados
    const isClientMode = process.env.MODE === 'client';
    const checkServices = await pool.query("SELECT COUNT(*) FROM services");
    const noServices = parseInt(checkServices.rows[0].count, 10) === 0;

    if (noServices) {
      if (!isClientMode) {
        console.log('[OutreachRepo] Insertando presets de servicios iniciales en PostgreSQL (Modo Master)...');
        for (const s of OutreachRepo.defaultServices) {
          await pool.query(
            `INSERT INTO services (id, name, description, target_persona, apify_queries, target_locations, outreach_template, follow_up_template_1, follow_up_template_2, asset_file_path, asset_file_name, closing_type, closing_payload, ai_system_prompt, is_active)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
             ON CONFLICT (id) DO NOTHING`,
            [
              s.id,
              s.name,
              s.description,
              s.targetPersona,
              JSON.stringify(s.apifyQueries),
              JSON.stringify(s.targetLocations),
              s.outreachTemplate,
              s.followUpTemplate1 || null,
              s.followUpTemplate2 || null,
              s.assetFilePath || null,
              s.assetFileName || null,
              s.closingType,
              JSON.stringify(s.closingPayload),
              s.aiSystemPrompt,
              s.isActive
            ]
          );
        }
      } else if (process.env.INITIAL_NICHE) {
        try {
          const { BlueprintsManager } = await import('../master/blueprints_manager.js');
          const bp = BlueprintsManager.getBlueprint(process.env.INITIAL_NICHE);
          if (bp) {
            console.log(`[OutreachRepo] Sembrando blueprint inicial de nicho "${bp.nicheName}" para cliente...`);
            const company = process.env.COMPANY_NAME || 'Mi Empresa';
            const sId = `${bp.id}-${process.env.CLIENT_ID || 'satelite'}`;
            await pool.query(
              `INSERT INTO services (id, name, description, target_persona, apify_queries, target_locations, outreach_template, follow_up_template_1, follow_up_template_2, closing_type, closing_payload, ai_system_prompt, is_active)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
               ON CONFLICT (id) DO NOTHING`,
              [
                sId,
                `${bp.nicheName} - ${company}`,
                bp.description,
                'Directores, gerentes y tomadores de decisión.',
                JSON.stringify(bp.defaultApifyQueries),
                JSON.stringify(bp.defaultTargetLocations),
                bp.outreachTemplate.replace(/\{\{companyName\}\}/g, company).replace(/\{\{agentName\}\}/g, company),
                bp.followUpTemplate1.replace(/\{\{companyName\}\}/g, company).replace(/\{\{agentName\}\}/g, company),
                bp.followUpTemplate2.replace(/\{\{companyName\}\}/g, company).replace(/\{\{agentName\}\}/g, company),
                bp.recommendedClosingMode,
                JSON.stringify({}),
                bp.systemPromptTemplate.replace(/\{\{companyName\}\}/g, company).replace(/\{\{agentName\}\}/g, company),
                true
              ]
            );
          }
        } catch (e: any) {
          console.warn('[OutreachRepo] No se pudo cargar blueprint de nicho inicial:', e.message);
        }
      }
    }

    // Configuración inicial
    const initialAdminPhone = process.env.ADMIN_WHATSAPP_PHONE || (isClientMode ? '' : '51902105668');
    await pool.query(`
      INSERT INTO campaign_settings (id, daily_limit, min_delay_seconds, max_delay_seconds, start_hour, end_hour, admin_whatsapp_phone, is_autonomous_active)
      VALUES ('main_config', 35, 180, 300, 9, 19, $1, true)
      ON CONFLICT (id) DO NOTHING;
    `, [initialAdminPhone]);

    console.log('✅ [OutreachRepo] Tablas y esquema de PostgreSQL listos.');
  }

  private static async initFallbackSchema(): Promise<void> {
    const isClientMode = process.env.MODE === 'client';
    const data = DbConnection.getFallbackData();
    if (!isClientMode && (!data.services || data.services.length === 0)) {
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
        outreachTemplateB: r.outreach_template_b || undefined,
        followUpTemplate1: r.follow_up_template_1 || undefined,
        followUpTemplate2: r.follow_up_template_2 || undefined,
        assetFilePath: r.asset_file_path || undefined,
        assetFileName: r.asset_file_name || undefined,
        closingType: r.closing_type,
        closingPayload: r.closing_payload || {},
        aiSystemPrompt: r.ai_system_prompt,
        isActive: r.is_active,
        type: (r.type as any) || 'OUTBOUND',
        triggerKeywords: r.trigger_keywords || [],
        inboundMode: (r.inbound_mode as any) || 'COPILOT_ONLY',
        tagColor: r.tag_color || undefined,
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
    return services.find(s => s.isActive && (s.type === 'OUTBOUND' || !s.type) && s.outreachTemplate && s.outreachTemplate.trim().length > 0) || null;
  }

  public static async saveService(s: ServiceDefinition): Promise<void> {
    if (DbConnection.isPg()) {
      await DbConnection.getPool().query(
        `INSERT INTO services (
           id, name, description, target_persona, apify_queries, target_locations, 
           outreach_template, outreach_template_b, follow_up_template_1, follow_up_template_2, 
           asset_file_path, asset_file_name, closing_type, closing_payload, 
           ai_system_prompt, is_active, type, trigger_keywords, inbound_mode, tag_color
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)
         ON CONFLICT (id) DO UPDATE SET
           name = EXCLUDED.name,
           description = EXCLUDED.description,
           target_persona = EXCLUDED.target_persona,
           apify_queries = EXCLUDED.apify_queries,
           target_locations = EXCLUDED.target_locations,
           outreach_template = EXCLUDED.outreach_template,
           outreach_template_b = EXCLUDED.outreach_template_b,
           follow_up_template_1 = EXCLUDED.follow_up_template_1,
           follow_up_template_2 = EXCLUDED.follow_up_template_2,
           asset_file_path = EXCLUDED.asset_file_path,
           asset_file_name = EXCLUDED.asset_file_name,
           closing_type = EXCLUDED.closing_type,
           closing_payload = EXCLUDED.closing_payload,
           ai_system_prompt = EXCLUDED.ai_system_prompt,
           is_active = EXCLUDED.is_active,
           type = EXCLUDED.type,
           trigger_keywords = EXCLUDED.trigger_keywords,
           inbound_mode = EXCLUDED.inbound_mode,
           tag_color = EXCLUDED.tag_color;`,
        [
          s.id,
          s.name,
          s.description,
          s.targetPersona,
          JSON.stringify(s.apifyQueries || []),
          JSON.stringify(s.targetLocations || []),
          s.outreachTemplate || '',
          s.outreachTemplateB || null,
          s.followUpTemplate1 || null,
          s.followUpTemplate2 || null,
          s.assetFilePath || null,
          s.assetFileName || null,
          s.closingType,
          JSON.stringify(s.closingPayload || {}),
          s.aiSystemPrompt,
          s.isActive !== false,
          s.type || 'OUTBOUND',
          JSON.stringify(s.triggerKeywords || []),
          s.inboundMode || 'COPILOT_ONLY',
          s.tagColor || null
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

  public static async toggleService(id: string, active: boolean): Promise<{ success: boolean; message: string }> {
    const service = await OutreachRepo.getServiceById(id);
    if (!service) {
      return { success: false, message: `No se encontró la campaña con ID "${id}".` };
    }
    service.isActive = active;
    await OutreachRepo.saveService(service);
    return {
      success: true,
      message: `Campaña "${service.name}" (${id}) ${active ? 'ACTIVADA' : 'PAUSADA'} con éxito.`
    };
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

  public static async deleteAllServices(deleteLeads: boolean = true): Promise<{ success: boolean; count: number; message: string }> {
    if (DbConnection.isPg()) {
      const pool = DbConnection.getPool();
      if (deleteLeads) {
        await pool.query('DELETE FROM leads');
      }
      const res = await pool.query('DELETE FROM services');
      const count = res.rowCount ?? 0;
      return {
        success: true,
        count,
        message: `Se eliminaron ${count} campañas exitosamente de PostgreSQL.`
      };
    } else {
      const data = DbConnection.getFallbackData();
      const count = (data.services || []).length;
      data.services = [];
      if (deleteLeads) {
        data.leads = [];
      }
      DbConnection.saveFallbackData(data);
      return {
        success: true,
        count,
        message: `Se eliminaron ${count} campañas exitosamente.`
      };
    }
  }

  /**
   * Obtiene métricas consolidadas de conversión por variante A/B
   */
  public static async getAbTestingStats(): Promise<{
    variantA: { sent: number; replied: number; qualified: number; meetings: number; conversionRate: string };
    variantB: { sent: number; replied: number; qualified: number; meetings: number; conversionRate: string };
  }> {
    if (DbConnection.isPg()) {
      const res = await DbConnection.getPool().query(`
        SELECT 
          COALESCE(custom_fields->>'abVariant', 'A') as variant,
          COUNT(*) FILTER (WHERE status IN ('OUTREACH_SENT', 'FOLLOW_UP_SENT', 'REPLIED', 'QUALIFIED', 'MEETING_SCHEDULED', 'CLOSED_WON', 'CLOSED_LOST', 'HUMAN_TAKEOVER')) as sent,
          COUNT(*) FILTER (WHERE status IN ('REPLIED', 'QUALIFIED', 'MEETING_SCHEDULED', 'CLOSED_WON', 'HUMAN_TAKEOVER')) as replied,
          COUNT(*) FILTER (WHERE status IN ('QUALIFIED', 'MEETING_SCHEDULED', 'CLOSED_WON')) as qualified,
          COUNT(*) FILTER (WHERE status = 'MEETING_SCHEDULED') as meetings
        FROM leads
        WHERE custom_fields->>'abVariant' IS NOT NULL
        GROUP BY COALESCE(custom_fields->>'abVariant', 'A');
      `);

      let a = { sent: 0, replied: 0, qualified: 0, meetings: 0, conversionRate: '0%' };
      let b = { sent: 0, replied: 0, qualified: 0, meetings: 0, conversionRate: '0%' };

      for (const row of res.rows) {
        const sent = parseInt(row.sent, 10) || 0;
        const replied = parseInt(row.replied, 10) || 0;
        const qualified = parseInt(row.qualified, 10) || 0;
        const meetings = parseInt(row.meetings, 10) || 0;
        const cr = sent > 0 ? ((replied / sent) * 100).toFixed(1) + '%' : '0%';
        if (row.variant === 'A') {
          a = { sent, replied, qualified, meetings, conversionRate: cr };
        } else if (row.variant === 'B') {
          b = { sent, replied, qualified, meetings, conversionRate: cr };
        }
      }
      return { variantA: a, variantB: b };
    }
    return {
      variantA: { sent: 0, replied: 0, qualified: 0, meetings: 0, conversionRate: '0%' },
      variantB: { sent: 0, replied: 0, qualified: 0, meetings: 0, conversionRate: '0%' }
    };
  }

  // --- LEADS ---
  public static cleanCompanyName(raw: string): string {
    if (!raw) return 'su despacho';
    let clean = raw.trim();

    // 1. Quitar subtítulos y eslóganes tras guiones, barras, pipes o dos puntos
    clean = clean.split(/\s*[-–—|:]\s*/)[0].trim();

    // 2. Quitar prefijos comunes en inglés/español
    clean = clean.replace(/^(Law Offices? of|The Law Office of|Bufete de Abogados de|Abogados? de|Firma Legal)\s+/i, '');

    // 3. Quitar sufijos corporativos legales (P.A., LLC, PLLC, Inc, Corp, etc.) asegurando límite de palabra para no cortar "Spa"
    clean = clean.replace(/\s*,?\s*\b(P\.?A\.?|L\.?L\.?C\.?|P\.?L\.?L\.?C\.?|Inc\.?|Corp\.?|P\.?C\.?|S\.?A\.?C\.?|S\.?R\.?L\.?|L\.?L\.?P\.?)$/i, '');

    // 4. Si está en MAYÚSCULAS sostenidas (>70% mayúsculas), convertir a Title Case
    const letters = clean.replace(/[^a-zA-ZáéíóúÁÉÍÓÚñÑ]/g, '');
    if (letters.length > 3) {
      const upperCount = (clean.match(/[A-ZÁÉÍÓÚÑ]/g) || []).length;
      if (upperCount / letters.length > 0.7) {
        clean = clean
          .toLowerCase()
          .split(' ')
          .map(word => {
            if (['de', 'la', 'el', 'los', 'las', 'y', '&', 'del'].includes(word)) return word;
            return word.charAt(0).toUpperCase() + word.slice(1);
          })
          .join(' ');
      }
    }

    clean = clean.trim();
    if (!clean || clean.length < 2) return 'su despacho';
    return clean;
  }
  public static async saveLeadsFromScraper(serviceId: string, items: ScrapedLead[]): Promise<{ inserted: number; skipped: number }> {
    let inserted = 0;
    let skipped = 0;

    for (const item of items) {
      if (!item.phoneClean || item.phoneClean.length < 8) {
        skipped++;
        continue;
      }

      // Estandarizar teléfonos peruanos si tienen 9 dígitos o estadounidenses si tienen 10 dígitos
      let clean = item.phoneClean;
      if (clean.length === 9 && clean.startsWith('9')) {
        clean = `51${clean}`;
      } else if (clean.length === 10) {
        clean = `1${clean}`;
      }

      let assignedRep: SalesRep | null = null;
      try {
        assignedRep = await OutreachRepo.getNextSalesRep();
      } catch {}

      const leadData: Lead = {
        serviceId,
        companyName: OutreachRepo.cleanCompanyName(item.title || 'Empresa B2B'),
        phone: clean,
        website: item.website,
        address: item.address,
        category: item.categoryName,
        status: 'DISCOVERED',
        source: item.source || 'google_maps',
        assignedRepName: assignedRep?.name,
        assignedRepPhone: assignedRep?.phone,
        customFields: item.metadata || {},
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      if (DbConnection.isPg()) {
        try {
          const res = await DbConnection.getPool().query(
            `INSERT INTO leads (service_id, company_name, phone, website, address, category, status, source, assigned_rep_name, assigned_rep_phone, custom_fields, created_at, updated_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW(), NOW())
             ON CONFLICT (phone) DO NOTHING RETURNING id`,
            [
              leadData.serviceId,
              leadData.companyName,
              leadData.phone,
              leadData.website,
              leadData.address,
              leadData.category,
              leadData.status,
              leadData.source,
              leadData.assignedRepName,
              leadData.assignedRepPhone,
              JSON.stringify(leadData.customFields || {})
            ]
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

  private static mapLeadRow(r: any): Lead {
    return {
      id: r.id,
      serviceId: r.service_id,
      serviceName: r.service_name || undefined,
      companyName: r.company_name,
      phone: r.phone,
      website: r.website,
      address: r.address,
      category: r.category,
      status: r.status,
      source: r.source || 'google_maps',
      followUpCount: r.follow_up_count ? parseInt(r.follow_up_count, 10) : 0,
      lastOutreachAt: r.last_outreach_at?.toISOString(),
      scheduledMeetingAt: r.scheduled_meeting_at?.toISOString(),
      lastMessageAt: r.last_message_at?.toISOString(),
      humanTakeoverAt: r.human_takeover_at?.toISOString(),
      assignedRepName: r.assigned_rep_name || undefined,
      assignedRepPhone: r.assigned_rep_phone || undefined,
      handoffNotes: r.handoff_notes || undefined,
      closingMode: r.closing_mode || undefined,
      meetingAttendanceStatus: (r.meeting_attendance_status as any) || 'PENDING',
      customFields: r.custom_fields || {},
      saleAmount: r.sale_amount ? parseFloat(r.sale_amount) : undefined,
      saleCurrency: r.sale_currency || 'USD',
      capiSyncedAt: r.capi_synced_at?.toISOString(),
      capiEventId: r.capi_event_id || undefined,
      createdAt: r.created_at?.toISOString(),
      updatedAt: r.updated_at?.toISOString()
    };
  }

  public static async getLead(phone: string): Promise<Lead | null> {
    return this.getLeadByPhone(phone);
  }

  public static async updateLead(phone: string, updates: Partial<Lead>): Promise<Lead | null> {
    const clean = phone.replace(/[^0-9]/g, '');
    const current = await OutreachRepo.getLeadByPhone(clean);
    if (!current) return null;

    if (DbConnection.isPg()) {
      const setClauses: string[] = ['updated_at = NOW()'];
      const values: any[] = [];
      let idx = 1;

      if (updates.status !== undefined) {
        setClauses.push(`status = $${idx++}`);
        values.push(updates.status);
      }
      if (updates.assignedRepName !== undefined) {
        setClauses.push(`assigned_rep_name = $${idx++}`);
        values.push(updates.assignedRepName);
      }
      if (updates.assignedRepPhone !== undefined) {
        setClauses.push(`assigned_rep_phone = $${idx++}`);
        values.push(updates.assignedRepPhone);
      }
      if (updates.handoffNotes !== undefined) {
        setClauses.push(`handoff_notes = $${idx++}`);
        values.push(updates.handoffNotes);
      }
      if (updates.humanTakeoverAt !== undefined) {
        setClauses.push(`human_takeover_at = $${idx++}`);
        values.push(updates.humanTakeoverAt ? new Date(updates.humanTakeoverAt) : null);
      }
      if (updates.scheduledMeetingAt !== undefined) {
        setClauses.push(`scheduled_meeting_at = $${idx++}`);
        values.push(updates.scheduledMeetingAt ? new Date(updates.scheduledMeetingAt) : null);
      }
      if (updates.saleAmount !== undefined) {
        setClauses.push(`sale_amount = $${idx++}`);
        values.push(updates.saleAmount);
      }
      if (updates.saleCurrency !== undefined) {
        setClauses.push(`sale_currency = $${idx++}`);
        values.push(updates.saleCurrency);
      }
      if (updates.capiSyncedAt !== undefined) {
        setClauses.push(`capi_synced_at = $${idx++}`);
        values.push(updates.capiSyncedAt ? new Date(updates.capiSyncedAt) : null);
      }
      if (updates.capiEventId !== undefined) {
        setClauses.push(`capi_event_id = $${idx++}`);
        values.push(updates.capiEventId);
      }

      values.push(clean);
      const query = `UPDATE leads SET ${setClauses.join(', ')} WHERE phone = $${idx} RETURNING *`;
      const res = await DbConnection.getPool().query(query, values);
      if (res.rows.length === 0) return null;
      return OutreachRepo.mapLeadRow(res.rows[0]);
    } else {
      const data = DbConnection.getFallbackData();
      const lead = (data.leads || []).find((l: Lead) => l.phone === clean);
      if (!lead) return null;
      Object.assign(lead, updates, { updatedAt: new Date().toISOString() });
      DbConnection.saveFallbackData(data);
      return lead;
    }
  }

  public static async getLeadByPhone(phone: string): Promise<Lead | null> {
    const clean = phone.replace(/[^0-9]/g, '');
    if (DbConnection.isPg()) {
      const res = await DbConnection.getPool().query('SELECT * FROM leads WHERE phone = $1', [clean]);
      if (res.rows.length === 0) return null;
      return OutreachRepo.mapLeadRow(res.rows[0]);
    } else {
      const data = DbConnection.getFallbackData();
      return (data.leads || []).find((l: Lead) => l.phone === clean) || null;
    }
  }

  public static async getLeads(filters?: { serviceId?: string; status?: LeadStatus; search?: string; limit?: number; assignedRepPhone?: string }): Promise<Lead[]> {
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
      if (filters?.assignedRepPhone) {
        const cleanRep = filters.assignedRepPhone.replace(/[^0-9]/g, '');
        query += ` AND (assigned_rep_phone = $${pIndex} OR assigned_rep_phone LIKE '%' || $${pIndex})`;
        params.push(cleanRep);
        pIndex++;
      }

      query += ` ORDER BY updated_at DESC LIMIT $${pIndex}`;
      params.push(limit);

      const res = await DbConnection.getPool().query(query, params);
      return res.rows.map(r => OutreachRepo.mapLeadRow(r));
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
      if (filters?.assignedRepPhone) {
        const cleanRep = filters.assignedRepPhone.replace(/[^0-9]/g, '');
        list = list.filter(l => {
          const repClean = (l.assignedRepPhone || '').replace(/[^0-9]/g, '');
          return repClean && (cleanRep.endsWith(repClean) || repClean.endsWith(cleanRep));
        });
      }

      return list.slice(0, limit);
    }
  }

  public static async updateLeadStatus(
    phone: string,
    status: LeadStatus,
    extra?: {
      humanTakeoverAt?: string | null;
      assignedRepName?: string;
      assignedRepPhone?: string;
      handoffNotes?: string;
      closingMode?: string;
      lastCustomerMessageAt?: string | null;
      lastMessageAt?: string;
    }
  ): Promise<void> {
    const clean = phone.replace(/[^0-9]/g, '');
    if (DbConnection.isPg()) {
      let query = 'UPDATE leads SET status = $1, updated_at = NOW()';
      const params: any[] = [status];
      let pIndex = 2;

      if (status === 'OUTREACH_SENT') {
        query += `, last_outreach_at = NOW()`;
      }

      if (extra?.humanTakeoverAt !== undefined) {
        query += `, human_takeover_at = $${pIndex++}`;
        params.push(extra.humanTakeoverAt);
      }

      if (extra?.assignedRepName !== undefined) {
        query += `, assigned_rep_name = $${pIndex++}`;
        params.push(extra.assignedRepName);
      }

      if (extra?.assignedRepPhone !== undefined) {
        query += `, assigned_rep_phone = $${pIndex++}`;
        params.push(extra.assignedRepPhone);
      }

      if (extra?.handoffNotes !== undefined) {
        query += `, handoff_notes = $${pIndex++}`;
        params.push(extra.handoffNotes);
      }

      if (extra?.closingMode !== undefined) {
        query += `, closing_mode = $${pIndex++}`;
        params.push(extra.closingMode);
      }

      if (extra?.lastCustomerMessageAt !== undefined) {
        query += `, last_customer_message_at = $${pIndex++}`;
        params.push(extra.lastCustomerMessageAt);
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
        lead.lastMessageAt = extra?.lastMessageAt || new Date().toISOString();
        if (extra?.lastCustomerMessageAt !== undefined) {
          lead.lastCustomerMessageAt = extra.lastCustomerMessageAt || undefined;
        }
        if (status === 'OUTREACH_SENT') {
          lead.lastOutreachAt = new Date().toISOString();
        }
        if (extra?.humanTakeoverAt !== undefined) {
          lead.humanTakeoverAt = extra.humanTakeoverAt || undefined;
        }
        if (extra?.assignedRepName !== undefined) {
          lead.assignedRepName = extra.assignedRepName;
        }
        if (extra?.assignedRepPhone !== undefined) {
          lead.assignedRepPhone = extra.assignedRepPhone;
        }
        if (extra?.handoffNotes !== undefined) {
          lead.handoffNotes = extra.handoffNotes;
        }
        if (extra?.closingMode !== undefined) {
          lead.closingMode = extra.closingMode as any;
        }
        DbConnection.saveFallbackData(data);
      }
    }

    // Sincronizar etiqueta oficial de WhatsApp Business vinculada a Ghost CRM
    try {
      const { WhatsAppLabelManager } = await import('../whatsapp/label_manager.js');
      const { BaileysEngine } = await import('../whatsapp/baileys_engine.js');
      const sock = (BaileysEngine as any).getInstance?.()?.getSocket?.() || null;
      await WhatsAppLabelManager.syncLeadLabel(sock, clean, status);
    } catch {}
  }

  public static async assignLeadToRep(
    phone: string,
    repName: string,
    repPhone: string,
    notes?: string,
    closingMode?: string
  ): Promise<boolean> {
    const clean = phone.replace(/[^0-9]/g, '');
    const lead = await OutreachRepo.getLeadByPhone(clean);
    if (!lead) return false;
    await OutreachRepo.updateLeadStatus(clean, lead.status, {
      assignedRepName: repName,
      assignedRepPhone: repPhone,
      handoffNotes: notes,
      closingMode
    });
    return true;
  }

  public static async updateMeetingAttendance(
    phone: string,
    status: 'ATTENDED' | 'NO_SHOW' | 'PENDING'
  ): Promise<void> {
    const clean = phone.replace(/[^0-9]/g, '');
    if (DbConnection.isPg()) {
      await DbConnection.getPool().query(
        `UPDATE leads SET meeting_attendance_status = $1, updated_at = NOW() WHERE phone = $2`,
        [status, clean]
      );
    } else {
      const data = DbConnection.getFallbackData();
      const lead = (data.leads || []).find((l: Lead) => l.phone === clean);
      if (lead) {
        lead.meetingAttendanceStatus = status;
        lead.updatedAt = new Date().toISOString();
        DbConnection.saveFallbackData(data);
      }
    }
  }

  public static async getLeadsForOutreach(serviceId?: string, limit: number = 30): Promise<Lead[]> {
    if (DbConnection.isPg()) {
      let query = `
        SELECT l.* FROM leads l
        LEFT JOIN services s ON l.service_id = s.id
        WHERE l.status IN ('DISCOVERED', 'QUEUED')
      `;
      const params: any[] = [];
      if (serviceId) {
        params.push(serviceId);
        query += ` AND l.service_id = $${params.length} AND s.outreach_template IS NOT NULL AND length(trim(s.outreach_template)) > 0`;
      } else {
        query += ` AND s.is_active = true AND (s.type = 'OUTBOUND' OR s.type IS NULL) AND s.outreach_template IS NOT NULL AND length(trim(s.outreach_template)) > 0`;
      }
      params.push(limit);
      query += ` ORDER BY l.id ASC LIMIT $${params.length}`;

      const res = await DbConnection.getPool().query(query, params);
      return res.rows.map(r => OutreachRepo.mapLeadRow(r));
    } else {
      const data = DbConnection.getFallbackData();
      return (data.leads || [])
        .filter((l: Lead) => {
          const statusOk = l.status === 'DISCOVERED' || l.status === 'QUEUED';
          if (!statusOk) return false;
          if (serviceId) return l.serviceId === serviceId;
          return true;
        })
        .slice(0, limit);
    }
  }

  /**
   * Obtiene prospectos para secuencia de seguimiento (Follow-Up)
   * Filtra leads en OUTREACH_SENT o FOLLOW_UP_SENT sin respuesta con más de 48h desde el último outreach
   * y que no hayan superado el límite de 2 toques.
   */
  public static async getLeadsForFollowUp(serviceId?: string, limit: number = 5): Promise<Lead[]> {
    const minHoursAgo = 48;

    if (DbConnection.isPg()) {
      let query = `
        SELECT * FROM leads 
        WHERE status IN ('OUTREACH_SENT', 'FOLLOW_UP_SENT')
          AND COALESCE(follow_up_count, 0) < 2
          AND human_takeover_at IS NULL
          AND (last_outreach_at IS NULL OR last_outreach_at <= NOW() - INTERVAL '48 hours')
      `;
      const params: any[] = [];
      if (serviceId) {
        query += ' AND service_id = $1';
        params.push(serviceId);
      }
      query += ` ORDER BY last_outreach_at ASC NULLS FIRST LIMIT $${params.length + 1}`;
      params.push(limit);

      const res = await DbConnection.getPool().query(query, params);
      return res.rows.map(r => OutreachRepo.mapLeadRow(r));
    } else {
      const data = DbConnection.getFallbackData();
      const nowMs = Date.now();
      const minDelayMs = minHoursAgo * 60 * 60 * 1000;

      return (data.leads || [])
        .filter((l: Lead) => {
          if (serviceId && l.serviceId !== serviceId) return false;
          if (l.status !== 'OUTREACH_SENT' && l.status !== 'FOLLOW_UP_SENT') return false;
          if ((l.followUpCount || 0) >= 2) return false;
          if (l.humanTakeoverAt) return false;

          const lastTime = l.lastOutreachAt ? new Date(l.lastOutreachAt).getTime() : (l.lastMessageAt ? new Date(l.lastMessageAt).getTime() : 0);
          return (nowMs - lastTime) >= minDelayMs;
        })
        .slice(0, limit);
    }
  }

  /**
   * Actualiza el contador de follow-ups y registra el timestamp
   */
  public static async updateLeadFollowUp(phone: string, followUpCount: number): Promise<void> {
    const clean = phone.replace(/[^0-9]/g, '');
    const newStatus: LeadStatus = 'FOLLOW_UP_SENT';

    if (DbConnection.isPg()) {
      await DbConnection.getPool().query(
        `UPDATE leads SET 
           status = $1, 
           follow_up_count = $2, 
           last_outreach_at = NOW(), 
           last_message_at = NOW(),
           updated_at = NOW() 
         WHERE phone = $3`,
        [newStatus, followUpCount, clean]
      );
    } else {
      const data = DbConnection.getFallbackData();
      const lead = (data.leads || []).find((l: Lead) => l.phone === clean);
      if (lead) {
        lead.status = newStatus;
        lead.followUpCount = followUpCount;
        lead.lastOutreachAt = new Date().toISOString();
        lead.lastMessageAt = new Date().toISOString();
        lead.updatedAt = new Date().toISOString();
        DbConnection.saveFallbackData(data);
      }
    }
  }

  /**
   * Obtiene prospectos para seguimiento conversacional anti-ghosting.
   * Filtra leads en REPLIED sin intervención humana activa, con silencio de al menos 24 horas y máx 7 días,
   * y que no hayan recibido el toque de reenganche previo.
   */
  public static async getLeadsForConversationalFollowUp(serviceId?: string, limit: number = 1): Promise<Lead[]> {
    const minHoursAgo = 24;
    const maxHoursAgo = 168; // 7 días

    if (DbConnection.isPg()) {
      let query = `
        SELECT * FROM leads 
        WHERE status = 'REPLIED'
          AND human_takeover_at IS NULL
          AND COALESCE((custom_fields->>'conversational_followup_count')::int, 0) < 1
          AND last_message_at IS NOT NULL
          AND last_message_at <= NOW() - INTERVAL '24 hours'
          AND last_message_at >= NOW() - INTERVAL '7 days'
      `;
      const params: any[] = [];
      if (serviceId) {
        query += ' AND service_id = $1';
        params.push(serviceId);
      }
      query += ` ORDER BY last_message_at ASC LIMIT $${params.length + 1}`;
      params.push(limit);

      const res = await DbConnection.getPool().query(query, params);
      return res.rows.map(r => OutreachRepo.mapLeadRow(r));
    } else {
      const data = DbConnection.getFallbackData();
      const nowMs = Date.now();
      const minDelayMs = minHoursAgo * 60 * 60 * 1000;
      const maxDelayMs = maxHoursAgo * 60 * 60 * 1000;

      return (data.leads || [])
        .filter((l: Lead) => {
          if (serviceId && l.serviceId !== serviceId) return false;
          if (l.status !== 'REPLIED') return false;
          if (l.humanTakeoverAt) return false;
          const reCount = (l.customFields && l.customFields.conversational_followup_count) ? parseInt(l.customFields.conversational_followup_count, 10) : 0;
          if (reCount >= 1) return false;

          const lastTime = l.lastMessageAt ? new Date(l.lastMessageAt).getTime() : 0;
          if (!lastTime) return false;
          const diff = nowMs - lastTime;
          return diff >= minDelayMs && diff <= maxDelayMs;
        })
        .slice(0, limit);
    }
  }

  /**
   * Actualiza el lead tras despachar seguimiento conversacional anti-ghosting
   */
  public static async updateLeadConversationalFollowUp(phone: string): Promise<void> {
    const clean = phone.replace(/[^0-9]/g, '');
    if (DbConnection.isPg()) {
      const payload = JSON.stringify({
        conversational_followup_count: 1,
        conversational_followup_at: new Date().toISOString()
      });
      await DbConnection.getPool().query(
        `UPDATE leads SET 
           custom_fields = COALESCE(custom_fields, '{}'::jsonb) || $2::jsonb,
           last_message_at = NOW(),
           updated_at = NOW() 
         WHERE phone = $1`,
        [clean, payload]
      );
    } else {
      const data = DbConnection.getFallbackData();
      const lead = (data.leads || []).find((l: Lead) => l.phone === clean);
      if (lead) {
        lead.customFields = {
          ...(lead.customFields || {}),
          conversational_followup_count: 1,
          conversational_followup_at: new Date().toISOString()
        };
        lead.lastMessageAt = new Date().toISOString();
        lead.updatedAt = new Date().toISOString();
        DbConnection.saveFallbackData(data);
      }
    }
  }

  /**
   * Actualiza lead tras agendar cita en Cal.com
   */
  public static async updateLeadSchedule(phone: string, scheduledMeetingAt: string, customFields?: Record<string, any>): Promise<void> {
    const clean = phone.replace(/[^0-9]/g, '');
    if (DbConnection.isPg()) {
      await DbConnection.getPool().query(
        `UPDATE leads SET 
           status = 'MEETING_SCHEDULED', 
           scheduled_meeting_at = $1,
           custom_fields = custom_fields || $2::jsonb,
           updated_at = NOW() 
         WHERE phone = $3`,
        [scheduledMeetingAt, JSON.stringify(customFields || {}), clean]
      );
    } else {
      const data = DbConnection.getFallbackData();
      const lead = (data.leads || []).find((l: Lead) => l.phone === clean);
      if (lead) {
        lead.status = 'MEETING_SCHEDULED';
        lead.scheduledMeetingAt = scheduledMeetingAt;
        lead.customFields = { ...(lead.customFields || {}), ...(customFields || {}) };
        lead.updatedAt = new Date().toISOString();
        DbConnection.saveFallbackData(data);
      }
    }
  }

  /**
   * Actualiza campos personalizados (custom_fields) de un lead
   */
  public static async updateLeadCustomFields(phone: string, customFields: Record<string, any>): Promise<void> {
    const clean = phone.replace(/[^0-9]/g, '');
    if (DbConnection.isPg()) {
      await DbConnection.getPool().query(
        `UPDATE leads SET 
           custom_fields = custom_fields || $1::jsonb,
           updated_at = NOW() 
         WHERE phone = $2`,
        [JSON.stringify(customFields || {}), clean]
      );
    } else {
      const data = DbConnection.getFallbackData();
      const lead = (data.leads || []).find((l: Lead) => l.phone === clean);
      if (lead) {
        lead.customFields = { ...(lead.customFields || {}), ...(customFields || {}) };
        lead.updatedAt = new Date().toISOString();
        DbConnection.saveFallbackData(data);
      }
    }
  }

  /**
   * Busca reuniones próximas dentro de N horas para recordatorio anti no-show
   */
  public static async getUpcomingMeetingsForReminder(withinHours: number = 2): Promise<Lead[]> {
    if (DbConnection.isPg()) {
      const res = await DbConnection.getPool().query(
        `SELECT * FROM leads 
         WHERE status = 'MEETING_SCHEDULED'
           AND scheduled_meeting_at IS NOT NULL
           AND scheduled_meeting_at >= NOW()
           AND scheduled_meeting_at <= NOW() + ($1 || ' hours')::interval
           AND (custom_fields->>'reminderSent') IS NULL`,
        [withinHours]
      );
      return res.rows.map(r => OutreachRepo.mapLeadRow(r));
    } else {
      const data = DbConnection.getFallbackData();
      const nowMs = Date.now();
      const windowMs = withinHours * 60 * 60 * 1000;

      return (data.leads || []).filter((l: Lead) => {
        if (l.status !== 'MEETING_SCHEDULED' || !l.scheduledMeetingAt) return false;
        if (l.customFields?.reminderSent) return false;
        const meetingTime = new Date(l.scheduledMeetingAt).getTime();
        return meetingTime >= nowMs && (meetingTime - nowMs) <= windowMs;
      });
    }
  }

  /**
   * Importa prospectos masivamente desde JSON o CSV parseado
   * Sanitiza teléfonos peruanos (519XXXXXXXX) e internacionales
   * Deduplica contra la base de datos
   */
  public static async importLeads(
    serviceId: string,
    leads: Array<{
      name: string;
      phone: string;
      website?: string;
      address?: string;
      category?: string;
      customFields?: Record<string, any>;
    }>
  ): Promise<{ inserted: number; skipped: number; invalid: number }> {
    let inserted = 0;
    let skipped = 0;
    let invalid = 0;

    // Asegurar que el servicio exista en DB antes de insertar leads
    if (DbConnection.isPg()) {
      const sCheck = await DbConnection.getPool().query('SELECT id FROM services WHERE id = $1', [serviceId]);
      if (sCheck.rows.length === 0) {
        const def = OutreachRepo.defaultServices.find(s => s.id === serviceId);
        if (def) {
          await OutreachRepo.saveService(def);
        } else {
          await OutreachRepo.saveService({
            id: serviceId,
            name: `Campaña ${serviceId}`,
            description: `Servicio ${serviceId}`,
            targetPersona: 'Empresas B2B',
            apifyQueries: [],
            targetLocations: ['Lima, Peru'],
            outreachTemplate: 'Buenas tardes al equipo de {{name}}...',
            closingType: 'MEETING_LINK',
            closingPayload: {},
            aiSystemPrompt: 'Asesor comercial consultivo',
            isActive: true
          });
        }
      }
    }

    for (const lead of leads) {
      let cleanPhone = (lead.phone || '').replace(/[^0-9]/g, '');

      // Quitar 0 inicial si alguien pone 09...
      if (cleanPhone.startsWith('09') && cleanPhone.length === 10) {
        cleanPhone = cleanPhone.slice(1);
      }

      // Sanitizar y validar celulares Perú e internacionales
      if (cleanPhone.length === 9 && cleanPhone.startsWith('9')) {
        cleanPhone = `51${cleanPhone}`;
      } else if (cleanPhone.length === 11 && cleanPhone.startsWith('519')) {
        // Formato internacional peruano válido
      } else if (cleanPhone.startsWith('51') && (!cleanPhone.startsWith('519') || cleanPhone.length !== 11)) {
        invalid++;
        continue;
      } else if (!cleanPhone.startsWith('51') && (cleanPhone.startsWith('0') || cleanPhone.length < 9)) {
        // Fijo con código de ciudad (01...) o número local corto
        invalid++;
        continue;
      } else if (cleanPhone.length < 8 || cleanPhone.length > 15) {
        invalid++;
        continue;
      }

      let assignedRep: SalesRep | null = null;
      try {
        assignedRep = await OutreachRepo.getNextSalesRep();
      } catch {}

      const leadData: Lead = {
        serviceId,
        companyName: (lead.name || 'Empresa B2B').trim(),
        phone: cleanPhone,
        website: lead.website?.trim(),
        address: lead.address?.trim(),
        category: lead.category?.trim(),
        status: 'DISCOVERED',
        followUpCount: 0,
        assignedRepName: assignedRep?.name,
        assignedRepPhone: assignedRep?.phone,
        customFields: lead.customFields || {},
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      if (DbConnection.isPg()) {
        try {
          const res = await DbConnection.getPool().query(
            `INSERT INTO leads (service_id, company_name, phone, website, address, category, status, follow_up_count, assigned_rep_name, assigned_rep_phone, custom_fields, created_at, updated_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, 0, $8, $9, $10, NOW(), NOW())
             ON CONFLICT (phone) DO NOTHING RETURNING id`,
            [
              leadData.serviceId,
              leadData.companyName,
              leadData.phone,
              leadData.website,
              leadData.address,
              leadData.category,
              leadData.status,
              leadData.assignedRepName,
              leadData.assignedRepPhone,
              JSON.stringify(leadData.customFields)
            ]
          );
          if (res.rowCount && res.rowCount > 0) {
            inserted++;
          } else {
            skipped++;
          }
        } catch (dbErr: any) {
          console.error('[importLeads] Error insertando en PG:', dbErr.message);
          skipped++;
        }
      } else {
        const data = DbConnection.getFallbackData();
        data.leads = data.leads || [];
        const exists = data.leads.some((l: Lead) => l.phone === cleanPhone);
        if (!exists) {
          data.leads.push(leadData);
          DbConnection.saveFallbackData(data);
          inserted++;
        } else {
          skipped++;
        }
      }
    }

    return { inserted, skipped, invalid };
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
    const trimmedContent = (content || '').trim();
    if (!trimmedContent) return;

    if (DbConnection.isPg()) {
      // Prevención de duplicados: ignorar si el mensaje idéntico ya se guardó en los últimos 60 segundos
      const existing = await DbConnection.getPool().query(
        `SELECT id FROM chat_messages 
         WHERE lead_phone = $1 AND role = $2 AND content = $3 
           AND created_at > NOW() - INTERVAL '60 seconds'
         LIMIT 1`,
        [clean, role, trimmedContent]
      );
      if (existing.rows.length > 0) {
        console.log(`⚠️ [repo] Mensaje duplicado omitido para ${clean} (ya registrado recientemente).`);
        return;
      }

      await DbConnection.getPool().query(
        `INSERT INTO chat_messages (lead_phone, role, content, created_at)
         VALUES ($1, $2, $3, NOW())`,
        [clean, role, trimmedContent]
      );
    } else {
      const data = DbConnection.getFallbackData();
      data.messages = data.messages || [];
      const isDuplicate = data.messages.some((m: any) => 
        m.leadPhone === clean && m.role === role && m.content === trimmedContent &&
        (Date.now() - new Date(m.createdAt).getTime() < 60000)
      );
      if (isDuplicate) return;

      data.messages.push({
        leadPhone: clean,
        role,
        content: trimmedContent,
        createdAt: new Date().toISOString()
      });
      DbConnection.saveFallbackData(data);
    }
  }

  public static async getChatHistory(leadPhone: string, limit: number = 30): Promise<ChatMessage[]> {
    const clean = leadPhone.replace(/[^0-9]/g, '');
    if (DbConnection.isPg()) {
      const res = await DbConnection.getPool().query(
        `SELECT * FROM (
           SELECT * FROM chat_messages 
           WHERE lead_phone = $1 
           ORDER BY created_at DESC 
           LIMIT $2
         ) sub ORDER BY created_at ASC`,
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
          isAutonomousActive: false,
          salesReps: [],
          roundRobinIndex: 0,
          aiProvider: 'openrouter',
          aiApiKey: '',
          aiModel: 'google/gemini-2.5-flash',
          currency: 'S/.',
          monthlyRetainerFee: 2800,
          successFeePerMeeting: 200
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
        alertWebhookUrl: r.alert_webhook_url,
        isAutonomousActive: r.is_autonomous_active ?? false,
        salesReps: r.sales_reps || [],
        roundRobinIndex: r.round_robin_index ?? 0,
        aiProvider: r.ai_provider || 'openrouter',
        aiApiKey: r.ai_api_key || '',
        aiModel: r.ai_model || 'google/gemini-2.5-flash',
        currency: r.currency || 'S/.',
        monthlyRetainerFee: r.monthly_retainer_fee != null ? Number(r.monthly_retainer_fee) : 2800,
        successFeePerMeeting: r.success_fee_per_meeting != null ? Number(r.success_fee_per_meeting) : 200,
        whatsappProvider: r.whatsapp_provider || 'direct_qr',
        metaPhoneNumberId: r.meta_phone_number_id || '',
        metaWabaId: r.meta_waba_id || '',
        metaAccessToken: r.meta_access_token || '',
        metaWebhookVerifyToken: r.meta_webhook_verify_token || 'qp_verify_token_2026',
        metaDatasetId: r.meta_dataset_id || '',
        metaCapiToken: r.meta_capi_token || '',
        metaTestEventCode: r.meta_test_event_code || '',
        onboardingCompleted: r.onboarding_completed != null ? Boolean(r.onboarding_completed) : (process.env.MODE !== 'client'),
        managerLeadAlertsEnabled: r.manager_lead_alerts_enabled !== false,
        companyName: process.env.COMPANY_NAME || '',
        publicUrl: process.env.PUBLIC_URL || ''
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
        isAutonomousActive: false,
        salesReps: [],
        roundRobinIndex: 0,
        aiProvider: 'openrouter',
        aiApiKey: '',
        aiModel: 'google/gemini-2.5-flash',
        currency: 'S/.',
        monthlyRetainerFee: 2800,
        successFeePerMeeting: 200,
        whatsappProvider: 'direct_qr',
        metaPhoneNumberId: '',
        metaWabaId: '',
        metaAccessToken: '',
        metaWebhookVerifyToken: 'qp_verify_token_2026',
        metaDatasetId: '',
        metaCapiToken: '',
        metaTestEventCode: '',
        onboardingCompleted: process.env.MODE !== 'client',
        managerLeadAlertsEnabled: true,
        companyName: process.env.COMPANY_NAME || '',
        publicUrl: process.env.PUBLIC_URL || ''
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
           alert_webhook_url = $8,
           is_autonomous_active = $9,
           sales_reps = $10,
           round_robin_index = $11,
           ai_provider = $12,
           ai_api_key = $13,
           ai_model = $14,
           currency = $15,
           monthly_retainer_fee = $16,
           success_fee_per_meeting = $17,
           whatsapp_provider = $18,
           meta_phone_number_id = $19,
           meta_waba_id = $20,
           meta_access_token = $21,
           meta_webhook_verify_token = $22,
           meta_dataset_id = $23,
           meta_capi_token = $24,
           meta_test_event_code = $25,
           onboarding_completed = $26,
           manager_lead_alerts_enabled = $27,
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
          updated.alertWebhookUrl,
          updated.isAutonomousActive,
          JSON.stringify(updated.salesReps || []),
          updated.roundRobinIndex ?? 0,
          updated.aiProvider || 'openrouter',
          updated.aiApiKey || '',
          updated.aiModel || 'google/gemini-2.5-flash',
          updated.currency || 'S/.',
          updated.monthlyRetainerFee ?? 2800,
          updated.successFeePerMeeting ?? 200,
          updated.whatsappProvider || 'direct_qr',
          updated.metaPhoneNumberId || '',
          updated.metaWabaId || '',
          updated.metaAccessToken || '',
          updated.metaWebhookVerifyToken || 'qp_verify_token_2026',
          updated.metaDatasetId || '',
          updated.metaCapiToken || '',
          updated.metaTestEventCode || '',
          Boolean(updated.onboardingCompleted),
          updated.managerLeadAlertsEnabled !== false
        ]
      );
    } else {
      const data = DbConnection.getFallbackData();
      data.settings = { ...(data.settings || {}), ...settings };
      DbConnection.saveFallbackData(data);
    }
  }

  // --- SALES REPS & ROUND ROBIN ---
  public static async getSalesReps(): Promise<SalesRep[]> {
    const settings = await OutreachRepo.getSettings();
    return settings.salesReps || [];
  }

  public static async saveSalesReps(reps: SalesRep[]): Promise<SalesRep[]> {
    await OutreachRepo.updateSettings({ salesReps: reps });
    return reps;
  }

  public static async findSalesRepByPin(pin: string): Promise<SalesRep | null> {
    if (!pin) return null;
    const reps = await OutreachRepo.getSalesReps();
    const cleanPin = pin.trim();
    return reps.find(r => r.pin && r.pin.trim() === cleanPin && r.isActive) || null;
  }

  public static async getNextSalesRep(): Promise<SalesRep | null> {
    const settings = await OutreachRepo.getSettings();
    const reps = (settings.salesReps || []).filter(r => r.isActive);
    if (reps.length === 0) {
      // Fallback: Si no hay asesores activos, derivar al Dueño/Administrador principal
      const owner = (settings.salesReps || []).find(r => r.isOwner) || (settings.salesReps || [])[0];
      if (owner) return owner;
      return null;
    }
    if (reps.length === 1) {
      const single = reps[0];
      single.leadsAssignedCount = (single.leadsAssignedCount || 0) + 1;
      const allReps = (settings.salesReps || []).map(r => r.id === single.id ? single : r);
      await OutreachRepo.updateSettings({ salesReps: allReps });
      return single;
    }

    let currentIndex = settings.roundRobinIndex ?? 0;
    if (currentIndex >= reps.length) {
      currentIndex = 0;
    }
    const chosen = reps[currentIndex];
    chosen.leadsAssignedCount = (chosen.leadsAssignedCount || 0) + 1;

    const nextIndex = (currentIndex + 1) % reps.length;
    const allReps = (settings.salesReps || []).map(r => r.id === chosen.id ? chosen : r);

    await OutreachRepo.updateSettings({
      salesReps: allReps,
      roundRobinIndex: nextIndex
    });

    return chosen;
  }

  /**
   * Atribuye una venta cerrada al récord personal del vendedor
   */
  public static async recordRepSale(
    repPhone: string,
    amount: number,
    currency: 'USD' | 'PEN' = 'USD'
  ): Promise<void> {
    const cleanRep = repPhone.replace(/[^0-9]/g, '');
    const settings = await OutreachRepo.getSettings();
    const reps = settings.salesReps || [];

    const updatedReps = reps.map(r => {
      const currentClean = (r.phone || '').replace(/[^0-9]/g, '');
      if (currentClean && (cleanRep.endsWith(currentClean) || currentClean.endsWith(cleanRep))) {
        return {
          ...r,
          salesClosedCount: (r.salesClosedCount || 0) + 1,
          totalRevenueClosed: (r.totalRevenueClosed || 0) + amount
        };
      }
      return r;
    });

    await OutreachRepo.updateSettings({ salesReps: updatedReps });
  }

  /**
   * Reasigna atómicamente todos los prospectos activos de un vendedor dado de baja
   */
  public static async reassignLeads(
    fromRepPhone: string,
    toRepPhone: string,
    toRepName: string
  ): Promise<number> {
    const cleanFrom = fromRepPhone.replace(/[^0-9]/g, '');
    const cleanTo = toRepPhone.replace(/[^0-9]/g, '');

    if (DbConnection.isPg()) {
      const res = await DbConnection.getPool().query(
        `UPDATE leads 
         SET assigned_rep_name = $1, 
             assigned_rep_phone = $2, 
             updated_at = NOW() 
         WHERE (assigned_rep_phone = $3 OR assigned_rep_phone LIKE '%' || $3) 
           AND status IN ('DISCOVERED', 'OUTREACH_SENT', 'REPLIED', 'QUALIFIED', 'MEETING_SCHEDULED')`,
        [toRepName, cleanTo, cleanFrom]
      );
      return res.rowCount ?? 0;
    } else {
      const data = DbConnection.getFallbackData();
      let count = 0;
      for (const lead of data.leads || []) {
        const leadRep = (lead.assignedRepPhone || '').replace(/[^0-9]/g, '');
        if (
          (leadRep === cleanFrom || leadRep.endsWith(cleanFrom)) &&
          ['DISCOVERED', 'OUTREACH_SENT', 'REPLIED', 'QUALIFIED', 'MEETING_SCHEDULED'].includes(lead.status)
        ) {
          lead.assignedRepName = toRepName;
          lead.assignedRepPhone = cleanTo;
          count++;
        }
      }
      DbConnection.saveFallbackData(data);
      return count;
    }
  }

  /**
   * Audita el desempeño histórico completo de un vendedor para el reporte de liquidación
   */
  public static async getSalesRepAudit(repPhone: string): Promise<{
    totalAssigned: number;
    closedWon: number;
    revenueUSD: number;
    revenuePEN: number;
    activeNegotiations: number;
    conversionRate: number;
  }> {
    const clean = repPhone.replace(/[^0-9]/g, '');

    if (DbConnection.isPg()) {
      const res = await DbConnection.getPool().query(
        `SELECT 
           COUNT(*) as total_assigned,
           COUNT(*) FILTER (WHERE status = 'CLOSED_WON') as closed_won,
           COALESCE(SUM(sale_amount) FILTER (WHERE status = 'CLOSED_WON' AND (sale_currency = 'USD' OR sale_currency IS NULL)), 0) as revenue_usd,
           COALESCE(SUM(sale_amount) FILTER (WHERE status = 'CLOSED_WON' AND sale_currency = 'PEN'), 0) as revenue_pen,
           COUNT(*) FILTER (WHERE status IN ('REPLIED', 'QUALIFIED', 'MEETING_SCHEDULED')) as active_negotiations
         FROM leads
         WHERE assigned_rep_phone = $1 OR assigned_rep_phone LIKE '%' || $1`,
        [clean]
      );

      const r = res.rows[0] || {};
      const totalAssigned = parseInt(r.total_assigned, 10) || 0;
      const closedWon = parseInt(r.closed_won, 10) || 0;
      const revenueUSD = parseFloat(r.revenue_usd) || 0;
      const revenuePEN = parseFloat(r.revenue_pen) || 0;
      const activeNegotiations = parseInt(r.active_negotiations, 10) || 0;
      const conversionRate = totalAssigned > 0 ? parseFloat(((closedWon / totalAssigned) * 100).toFixed(1)) : 0;

      return {
        totalAssigned,
        closedWon,
        revenueUSD,
        revenuePEN,
        activeNegotiations,
        conversionRate
      };
    } else {
      const data = DbConnection.getFallbackData();
      let totalAssigned = 0;
      let closedWon = 0;
      let revenueUSD = 0;
      let revenuePEN = 0;
      let activeNegotiations = 0;

      for (const lead of data.leads || []) {
        const leadRep = (lead.assignedRepPhone || '').replace(/[^0-9]/g, '');
        if (leadRep === clean || leadRep.endsWith(clean)) {
          totalAssigned++;
          if (lead.status === 'CLOSED_WON') {
            closedWon++;
            if (lead.saleCurrency === 'PEN') {
              revenuePEN += lead.saleAmount || 0;
            } else {
              revenueUSD += lead.saleAmount || 0;
            }
          }
          if (['REPLIED', 'QUALIFIED', 'MEETING_SCHEDULED'].includes(lead.status)) {
            activeNegotiations++;
          }
        }
      }

      const conversionRate = totalAssigned > 0 ? parseFloat(((closedWon / totalAssigned) * 100).toFixed(1)) : 0;

      return {
        totalAssigned,
        closedWon,
        revenueUSD,
        revenuePEN,
        activeNegotiations,
        conversionRate
      };
    }
  }

  // --- STATS ---
  public static async getStats(serviceId?: string): Promise<{
    totalLeads: number;
    discovered: number;
    outreachSent: number;
    followUpSent: number;
    replied: number;
    qualified: number;
    meetingScheduled: number;
    humanTakeover: number;
    closedWon: number;
    closedLost: number;
    noResponse: number;
  }> {
    const leads = await OutreachRepo.getLeads({ serviceId, limit: 10000 });
    return {
      totalLeads: leads.length,
      discovered: leads.filter(l => l.status === 'DISCOVERED' || l.status === 'QUEUED').length,
      outreachSent: leads.filter(l => l.status === 'OUTREACH_SENT').length,
      followUpSent: leads.filter(l => l.status === 'FOLLOW_UP_SENT').length,
      replied: leads.filter(l => l.status === 'REPLIED').length,
      qualified: leads.filter(l => l.status === 'QUALIFIED').length,
      meetingScheduled: leads.filter(l => l.status === 'MEETING_SCHEDULED').length,
      humanTakeover: leads.filter(l => l.status === 'HUMAN_TAKEOVER').length,
      closedWon: leads.filter(l => l.status === 'CLOSED_WON').length,
      closedLost: leads.filter(l => l.status === 'CLOSED_LOST').length,
      noResponse: leads.filter(l => l.status === 'NO_RESPONSE').length
    };
  }

  public static async getDailyActivity(dayIso: string): Promise<{
    sentCount: number;
    repliedCount: number;
    meetingsCount: number;
  }> {
    if (DbConnection.isPg()) {
      const res = await DbConnection.getPool().query(
        `SELECT 
           COUNT(*) FILTER (WHERE role = 'assistant') as sent_count,
           COUNT(*) FILTER (WHERE role = 'user') as replied_count
         FROM chat_messages
         WHERE created_at::date = $1::date`,
        [dayIso]
      );
      const meetings = await DbConnection.getPool().query(
        `SELECT COUNT(*) as count FROM leads WHERE status = 'MEETING_SCHEDULED' AND updated_at::date = $1::date`,
        [dayIso]
      );
      return {
        sentCount: parseInt(res.rows[0]?.sent_count || '0', 10),
        repliedCount: parseInt(res.rows[0]?.replied_count || '0', 10),
        meetingsCount: parseInt(meetings.rows[0]?.count || '0', 10)
      };
    } else {
      const data = DbConnection.getFallbackData();
      const dayMessages = (data.messages || []).filter((m: ChatMessage) => (m.createdAt || '').slice(0, 10) === dayIso);
      const dayMeetings = (data.leads || []).filter((l: Lead) => l.status === 'MEETING_SCHEDULED' && (l.updatedAt || '').slice(0, 10) === dayIso);
      return {
        sentCount: dayMessages.filter((m: ChatMessage) => m.role === 'assistant').length,
        repliedCount: dayMessages.filter((m: ChatMessage) => m.role === 'user').length,
        meetingsCount: dayMeetings.length
      };
    }
  }

  // --- DELETE LEADS ---
  public static async deleteLeads(filters: { serviceId?: string; status?: LeadStatus; phone?: string; all?: boolean }): Promise<{ success: boolean; deletedCount: number; message: string }> {
    if (!filters.all && !filters.serviceId && !filters.status && !filters.phone) {
      throw new Error('Debe especificar al menos un filtro (serviceId, status, phone) o all: true');
    }

    if (DbConnection.isPg()) {
      const pool = DbConnection.getPool();
      let query = 'DELETE FROM leads WHERE 1=1';
      const params: any[] = [];
      let pIndex = 1;

      if (filters.phone) {
        const clean = filters.phone.replace(/[^0-9]/g, '');
        query += ` AND phone = $${pIndex++}`;
        params.push(clean);
      }
      if (filters.serviceId) {
        query += ` AND service_id = $${pIndex++}`;
        params.push(filters.serviceId);
      }
      if (filters.status) {
        query += ` AND status = $${pIndex++}`;
        params.push(filters.status);
      }

      const res = await pool.query(query, params);
      const count = res.rowCount ?? 0;
      return {
        success: true,
        deletedCount: count,
        message: `Se eliminaron ${count} prospectos exitosamente de la base de datos.`
      };
    } else {
      const data = DbConnection.getFallbackData();
      const initialCount = (data.leads || []).length;
      if (filters.all) {
        data.leads = [];
      } else {
        data.leads = (data.leads || []).filter((l: Lead) => {
          if (filters.phone && l.phone === filters.phone.replace(/[^0-9]/g, '')) return false;
          if (filters.serviceId && l.serviceId === filters.serviceId) return false;
          if (filters.status && l.status === filters.status) return false;
          return true;
        });
      }
      const count = initialCount - (data.leads || []).length;
      DbConnection.saveFallbackData(data);
      return {
        success: true,
        deletedCount: count,
        message: `Se eliminaron ${count} prospectos exitosamente.`
      };
    }
  }

  // --- MÉTODOS DE PRODUCCIÓN: DIRECT LEAD, DELETE, OPT-OUT, REASSIGN ---
  public static async createDirectLead(data: { phone: string; companyName?: string; serviceId?: string }): Promise<Lead> {
    const cleanPhone = data.phone.replace(/[^0-9]/g, '');
    const companyName = data.companyName?.trim() || `WhatsApp ${cleanPhone}`;
    const serviceId = data.serviceId || (await OutreachRepo.getActiveService())?.id || 'custom-service';

    if (DbConnection.isPg()) {
      const pool = DbConnection.getPool();
      const existing = await OutreachRepo.getLeadByPhone(cleanPhone);
      if (existing) {
        return existing;
      }
      const res = await pool.query(
        `INSERT INTO leads (service_id, company_name, phone, status, source, created_at, updated_at)
         VALUES ($1, $2, $3, 'REPLIED', 'direct', NOW(), NOW())
         RETURNING *`,
        [serviceId, companyName, cleanPhone]
      );
      return OutreachRepo.mapLeadRow(res.rows[0]);
    } else {
      const fbData = DbConnection.getFallbackData();
      if (!fbData.leads) fbData.leads = [];
      let lead = fbData.leads.find((l: Lead) => l.phone === cleanPhone);
      if (!lead) {
        lead = {
          serviceId,
          companyName,
          phone: cleanPhone,
          status: 'REPLIED',
          source: 'direct',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };
        fbData.leads.push(lead);
        DbConnection.saveFallbackData(fbData);
      }
      return lead;
    }
  }

  public static async deleteLeadAndChats(phone: string): Promise<boolean> {
    const cleanPhone = phone.replace(/[^0-9]/g, '');
    if (DbConnection.isPg()) {
      const pool = DbConnection.getPool();
      await pool.query('DELETE FROM chat_messages WHERE lead_phone = $1', [cleanPhone]);
      const res = await pool.query('DELETE FROM leads WHERE phone = $1', [cleanPhone]);
      return (res.rowCount ?? 0) > 0;
    } else {
      const data = DbConnection.getFallbackData();
      data.leads = (data.leads || []).filter((l: Lead) => l.phone !== cleanPhone);
      data.chatMessages = (data.chatMessages || []).filter((m: ChatMessage) => m.leadPhone !== cleanPhone);
      DbConnection.saveFallbackData(data);
      return true;
    }
  }

  public static async setLeadOptOut(phone: string): Promise<boolean> {
    const cleanPhone = phone.replace(/[^0-9]/g, '');
    if (DbConnection.isPg()) {
      const pool = DbConnection.getPool();
      const res = await pool.query(
        `UPDATE leads SET status = 'OPT_OUT', human_takeover_at = NOW(), updated_at = NOW() WHERE phone = $1`,
        [cleanPhone]
      );
      return (res.rowCount ?? 0) > 0;
    } else {
      const data = DbConnection.getFallbackData();
      const lead = (data.leads || []).find((l: Lead) => l.phone === cleanPhone);
      if (lead) {
        lead.status = 'OPT_OUT';
        lead.humanTakeoverAt = new Date().toISOString();
        lead.updatedAt = new Date().toISOString();
        DbConnection.saveFallbackData(data);
        return true;
      }
      return false;
    }
  }

  public static async updateLeadService(phone: string, serviceId: string): Promise<boolean> {
    const cleanPhone = phone.replace(/[^0-9]/g, '');
    if (DbConnection.isPg()) {
      const pool = DbConnection.getPool();
      const res = await pool.query(
        `UPDATE leads SET service_id = $1, updated_at = NOW() WHERE phone = $2`,
        [serviceId, cleanPhone]
      );
      return (res.rowCount ?? 0) > 0;
    } else {
      const data = DbConnection.getFallbackData();
      const lead = (data.leads || []).find((l: Lead) => l.phone === cleanPhone);
      if (lead) {
        lead.serviceId = serviceId;
        lead.updatedAt = new Date().toISOString();
        DbConnection.saveFallbackData(data);
        return true;
      }
      return false;
    }
  }

  public static async updateLeadCategory(phone: string, category: string): Promise<boolean> {
    const cleanPhone = phone.replace(/[^0-9]/g, '');
    const cleanCategory = String(category || '').trim();
    if (DbConnection.isPg()) {
      const pool = DbConnection.getPool();
      const res = await pool.query(
        `UPDATE leads SET category = $1, updated_at = NOW() WHERE phone = $2`,
        [cleanCategory, cleanPhone]
      );
      return (res.rowCount ?? 0) > 0;
    } else {
      const data = DbConnection.getFallbackData();
      const lead = (data.leads || []).find((l: Lead) => l.phone === cleanPhone);
      if (lead) {
        lead.category = cleanCategory;
        lead.updatedAt = new Date().toISOString();
        DbConnection.saveFallbackData(data);
        return true;
      }
      return false;
    }
  }

  /**
   * Ingesta inteligente de mensajes entrantes de WhatsApp (Click-to-WhatsApp / Meta Ads)
   * Detecta si coincide con palabras clave de algún anuncio, auto-etiqueta y asigna Round Robin.
   */
  /**
   * Busca un lead por su WhatsApp LID o por su número
   */
  public static async getLeadByLid(lid: string): Promise<Lead | null> {
    const cleanLid = lid.replace(/[^0-9]/g, '');
    if (!cleanLid) return null;

    if (DbConnection.isPg()) {
      const pool = DbConnection.getPool();
      const res = await pool.query(
        `SELECT * FROM leads WHERE custom_fields->>'lid' = $1 OR phone = $1 LIMIT 1`,
        [cleanLid]
      );
      if (res.rows.length > 0) return OutreachRepo.mapLeadRow(res.rows[0]);
      return null;
    } else {
      const fb = DbConnection.getFallbackData();
      const found = (fb.leads || []).find((l: any) => l.customFields?.lid === cleanLid || l.phone === cleanLid);
      return found || null;
    }
  }

  /**
   * Vincula un WhatsApp LID a un lead existente sin duplicar registros
   */
  public static async linkLeadLid(phone: string, lid: string): Promise<void> {
    const cleanPhone = phone.replace(/[^0-9]/g, '');
    const cleanLid = lid.replace(/[^0-9]/g, '');
    if (!cleanPhone || !cleanLid || cleanPhone === cleanLid) return;

    if (DbConnection.isPg()) {
      const pool = DbConnection.getPool();
      await pool.query(
        `UPDATE leads 
         SET custom_fields = jsonb_set(COALESCE(custom_fields, '{}'::jsonb), '{lid}', to_jsonb($2::text)),
             updated_at = NOW()
         WHERE phone = $1`,
        [cleanPhone, cleanLid]
      );
    } else {
      const fb = DbConnection.getFallbackData();
      const lead = (fb.leads || []).find((l: any) => l.phone === cleanPhone);
      if (lead) {
        lead.customFields = { ...(lead.customFields || {}), lid: cleanLid };
      }
    }
  }

  /**
   * Fusiona dos prospectos duplicados (ej. uno creado por LID temporal y el número real)
   */
  public static async mergeLeads(sourcePhone: string, targetPhone: string, lid?: string): Promise<Lead | null> {
    const cleanSource = sourcePhone.replace(/[^0-9]/g, '');
    const cleanTarget = targetPhone.replace(/[^0-9]/g, '');
    if (!cleanSource || !cleanTarget || cleanSource === cleanTarget) return null;

    console.log(`🔀 [OutreachRepo] Fusionando chat y datos de lead ${cleanSource} -> ${cleanTarget}`);

    if (DbConnection.isPg()) {
      const pool = DbConnection.getPool();

      // 1. Migrar mensajes del chat
      await pool.query(
        `UPDATE chat_messages SET lead_phone = $1 WHERE lead_phone = $2`,
        [cleanTarget, cleanSource]
      );

      // 2. Traer source y target
      const targetRes = await pool.query(`SELECT * FROM leads WHERE phone = $1`, [cleanTarget]);
      const sourceRes = await pool.query(`SELECT * FROM leads WHERE phone = $1`, [cleanSource]);

      if (targetRes.rows.length === 0 && sourceRes.rows.length > 0) {
        await OutreachRepo.updateLeadPhone(cleanSource, cleanTarget, lid);
        return await OutreachRepo.getLeadByPhone(cleanTarget);
      }

      if (sourceRes.rows.length > 0 && targetRes.rows.length > 0) {
        const sourceRow = sourceRes.rows[0];
        const targetRow = targetRes.rows[0];

        const combinedCustomFields = {
          ...(targetRow.custom_fields || {}),
          ...(sourceRow.custom_fields || {}),
          ...(lid ? { lid } : (cleanSource.length >= 14 ? { lid: cleanSource } : {}))
        };

        const latestTime = new Date(sourceRow.last_message_at || sourceRow.updated_at) > new Date(targetRow.last_message_at || targetRow.updated_at)
          ? sourceRow.last_message_at
          : targetRow.last_message_at;

        await pool.query(
          `UPDATE leads 
           SET status = CASE WHEN $2 = 'REPLIED' OR status = 'REPLIED' THEN 'REPLIED' ELSE status END,
               last_message_at = COALESCE($3, last_message_at),
               custom_fields = $4,
               updated_at = NOW()
           WHERE phone = $1`,
          [cleanTarget, sourceRow.status, latestTime, JSON.stringify(combinedCustomFields)]
        );

        // Eliminar el duplicado source
        await pool.query(`DELETE FROM leads WHERE phone = $1`, [cleanSource]);
      }

      return await OutreachRepo.getLeadByPhone(cleanTarget);
    } else {
      const fb = DbConnection.getFallbackData();
      if (fb.messages) {
        fb.messages.forEach((m: any) => {
          if (m.leadPhone === cleanSource) m.leadPhone = cleanTarget;
        });
      }
      if (fb.leads) {
        const targetLead = fb.leads.find((l: any) => l.phone === cleanTarget);
        const sourceIdx = fb.leads.findIndex((l: any) => l.phone === cleanSource);
        if (targetLead && sourceIdx !== -1) {
          const sourceLead = fb.leads[sourceIdx];
          targetLead.customFields = {
            ...(targetLead.customFields || {}),
            ...(sourceLead.customFields || {}),
            ...(lid ? { lid } : (cleanSource.length >= 14 ? { lid: cleanSource } : {}))
          };
          if (sourceLead.status === 'REPLIED') targetLead.status = 'REPLIED';
          fb.leads.splice(sourceIdx, 1);
        }
      }
      return await OutreachRepo.getLeadByPhone(cleanTarget);
    }
  }

  public static async updateLeadPhone(oldPhone: string, newPhone: string, lid?: string): Promise<void> {
    const cleanOld = oldPhone.replace(/[^0-9]/g, '');
    const cleanNew = newPhone.replace(/[^0-9]/g, '');
    if (!cleanOld || !cleanNew || cleanOld === cleanNew) return;

    if (DbConnection.isPg()) {
      const pool = DbConnection.getPool();
      await pool.query(
        `UPDATE chat_messages SET lead_phone = $1 WHERE lead_phone = $2`,
        [cleanNew, cleanOld]
      );
      await pool.query(
        `UPDATE leads 
         SET phone = $1, 
             service_id = CASE WHEN service_id = 'licitaciones-qp' THEN 'inbound-general' ELSE service_id END,
             category = CASE WHEN category = '#WhatsApp-Directo' THEN '#Inbound-Orgánico' ELSE category END,
             custom_fields = jsonb_set(COALESCE(custom_fields, '{}'::jsonb), '{lid}', to_jsonb($3::text)),
             updated_at = NOW() 
         WHERE phone = $2`,
        [cleanNew, cleanOld, lid || cleanOld]
      );
    } else {
      const data = DbConnection.getFallbackData();
      if (data.leads) {
        const lead = data.leads.find((l: any) => l.phone === cleanOld);
        if (lead) {
          lead.phone = cleanNew;
          lead.customFields = { ...(lead.customFields || {}), lid: lid || cleanOld };
          if (lead.serviceId === 'licitaciones-qp') lead.serviceId = 'inbound-general';
          if (lead.category === '#WhatsApp-Directo') lead.category = '#Inbound-Orgánico';
        }
      }
      if (data.messages) {
        data.messages.forEach((m: any) => {
          if (m.leadPhone === cleanOld) m.leadPhone = cleanNew;
        });
      }
      DbConnection.saveFallbackData(data);
    }
  }

  public static async ingestInboundLead(data: {
    phone: string;
    pushName?: string;
    incomingText: string;
    lid?: string;
  }): Promise<{ lead: Lead; isNew: boolean; matchedService?: ServiceDefinition }> {
    const cleanPhone = data.phone.replace(/[^0-9]/g, '');
    const cleanLid = data.lid ? data.lid.replace(/[^0-9]/g, '') : '';

    // 1. Buscar por teléfono directo
    let existing = await OutreachRepo.getLeadByPhone(cleanPhone);

    // 2. Si no se encontró y tenemos LID, o si cleanPhone parece un LID (>= 14 dígitos):
    if (!existing && (cleanLid || cleanPhone.length >= 14)) {
      const lookupLid = cleanLid || cleanPhone;
      existing = await OutreachRepo.getLeadByLid(lookupLid);
      if (existing) {
        console.log(`🔗 [OutreachRepo] Lead encontrado por LID ${lookupLid}: +${existing.phone}`);
        // Si el cleanPhone es un número real nuevo (<= 13 dígitos y no LID):
        if (cleanPhone.length <= 13 && !cleanPhone.startsWith('269') && cleanPhone !== existing.phone) {
          await OutreachRepo.updateLeadPhone(existing.phone, cleanPhone, lookupLid);
          existing.phone = cleanPhone;
        }
      }
    }

    // 3. Si encontramos el lead existente, asegurar que tenga el LID registrado
    if (existing) {
      if (cleanLid && (!existing.customFields?.lid || existing.customFields.lid !== cleanLid)) {
        await OutreachRepo.linkLeadLid(existing.phone, cleanLid);
        if (!existing.customFields) existing.customFields = {};
        existing.customFields.lid = cleanLid;
      }
      return { lead: existing, isNew: false };
    }

    const services = await OutreachRepo.getServices();
    const cleanText = (data.incomingText || '').toLowerCase().trim();

    // 1. Buscar si coincide con alguna campaña Inbound por sus triggerKeywords
    let matchedService: ServiceDefinition | undefined = undefined;
    for (const s of services) {
      if (!s.isActive) continue;
      if (s.type === 'INBOUND_ADS' && Array.isArray(s.triggerKeywords) && s.triggerKeywords.length > 0) {
        const matches = s.triggerKeywords.some(kw => kw && kw.trim().length > 1 && cleanText.includes(kw.toLowerCase().trim()));
        if (matches) {
          matchedService = s;
          break;
        }
      }
    }

    // 2. Si no coincide con palabras clave específicas, buscar servicio INBOUND_ADS general (sin forzar outbound)
    if (!matchedService) {
      matchedService = services.find(s => s.isActive && s.type === 'INBOUND_ADS');
    }

    const isMetaAd = !!(
      (matchedService && matchedService.type === 'INBOUND_ADS') || 
      cleanText.includes('anuncio') || 
      cleanText.includes('facebook') || 
      cleanText.includes('instagram') ||
      cleanText.includes('meta')
    );

    const source: LeadSource = isMetaAd ? 'meta_ads' : 'direct_whatsapp';
    const serviceId = matchedService?.id || 'inbound-general';
    const serviceName = matchedService?.name || (isMetaAd ? 'Meta Ads Inbound' : 'Atención Inbound & Consulta General');
    const category = isMetaAd
      ? (matchedService ? `#MetaAds-${matchedService.name.slice(0, 20)}` : '#MetaAds')
      : '#Inbound-Orgánico';
    const companyName = data.pushName?.trim() || `Contacto +${cleanPhone}`;
    const customFields = data.lid ? { lid: data.lid } : {};

    let nextRep = await OutreachRepo.getNextSalesRep().catch(() => null);

    if (DbConnection.isPg()) {
      const pool = DbConnection.getPool();
      const res = await pool.query(
        `INSERT INTO leads (
           service_id, company_name, phone, status, source, category,
           assigned_rep_name, assigned_rep_phone, custom_fields, created_at, updated_at
         )
         VALUES ($1, $2, $3, 'REPLIED', $4, $5, $6, $7, $8, NOW(), NOW())
         ON CONFLICT (phone) DO UPDATE SET updated_at = NOW()
         RETURNING *`,
        [
          serviceId,
          companyName,
          cleanPhone,
          source,
          category,
          nextRep?.name || null,
          nextRep?.phone || null,
          JSON.stringify(customFields)
        ]
      );
      const lead = OutreachRepo.mapLeadRow(res.rows[0]);
      lead.serviceName = serviceName;
      return { lead, isNew: true, matchedService };
    } else {
      const fbData = DbConnection.getFallbackData();
      if (!fbData.leads) fbData.leads = [];
      const newLead: Lead = {
        serviceId,
        serviceName,
        companyName,
        phone: cleanPhone,
        status: 'REPLIED',
        source,
        category,
        customFields,
        assignedRepName: nextRep?.name,
        assignedRepPhone: nextRep?.phone,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      fbData.leads.push(newLead);
      DbConnection.saveFallbackData(fbData);
      return { lead: newLead, isNew: true, matchedService };
    }
  }

  // --- DASHBOARD OVERVIEW ---
  public static async getDashboardOverview(): Promise<{
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
        sentToday: number;
        remainingToday: number;
        activePhase: number;
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
      serviceId?: string;
      serviceName?: string;
      assignedRepName?: string;
      isHumanTakeover: boolean;
      lastMessageSnippet: string;
      lastMessageAt: string;
    }>;
  }> {
    const activeService = await OutreachRepo.getActiveService();
    let activeDays = 5;
    if (activeService?.createdAt) {
      const diffMs = Date.now() - new Date(activeService.createdAt).getTime();
      activeDays = Math.max(1, Math.floor(diffMs / (1000 * 60 * 60 * 24)) + 1);
    }
    const isWarmupActive = activeDays <= 4;
    const warmupDailyLimit = activeDays <= 2 ? 10 : (activeDays <= 4 ? 20 : 35);
    const activePhase = activeDays <= 2 ? 1 : (activeDays <= 4 ? 2 : 3);

    const settings = await OutreachRepo.getSettings();
    const currency = settings.currency || 'S/.';
    const baseRetainer = settings.monthlyRetainerFee ?? Number(process.env.MONTHLY_RETAINER_FEE || 2800);
    const successFeePerMeeting = settings.successFeePerMeeting ?? Number(process.env.SUCCESS_FEE_PER_MEETING || 200);

    if (DbConnection.isPg()) {
      const pool = DbConnection.getPool();

      // Métricas consolidadas
      const metricsRes = await pool.query(`
        SELECT 
          COUNT(*) as total_leads,
          COUNT(*) FILTER (WHERE status IN ('OUTREACH_SENT', 'FOLLOW_UP_SENT')) as outreach_sent,
          COUNT(*) FILTER (WHERE status = 'REPLIED') as replied,
          COUNT(*) FILTER (WHERE status = 'QUALIFIED') as qualified,
          COUNT(*) FILTER (WHERE status = 'MEETING_SCHEDULED') as meetings_scheduled,
          COUNT(*) FILTER (WHERE meeting_attendance_status = 'ATTENDED') as attended_meetings,
          COUNT(*) FILTER (WHERE meeting_attendance_status = 'NO_SHOW') as no_show_meetings,
          COUNT(*) FILTER (WHERE status = 'HUMAN_TAKEOVER') as human_takeover,
          COUNT(*) FILTER (WHERE status = 'CLOSED_WON') as closed_won
        FROM leads
      `);
      const mRow = metricsRes.rows[0] || {};
      const totalLeads = parseInt(mRow.total_leads || '0', 10);
      const outreachSent = parseInt(mRow.outreach_sent || '0', 10);
      const replied = parseInt(mRow.replied || '0', 10);
      const qualified = parseInt(mRow.qualified || '0', 10);
      const meetingsScheduled = parseInt(mRow.meetings_scheduled || '0', 10);
      const attendedMeetings = parseInt(mRow.attended_meetings || '0', 10);
      const noShowMeetings = parseInt(mRow.no_show_meetings || '0', 10);
      const humanTakeover = parseInt(mRow.human_takeover || '0', 10);
      const closedWon = parseInt(mRow.closed_won || '0', 10);

      // Conteo de envíos salientes en el día de hoy
      const sentTodayRes = await pool.query(`
        SELECT COUNT(*) as sent_today FROM leads 
        WHERE last_outreach_at >= CURRENT_DATE
      `);
      const sentToday = parseInt(sentTodayRes.rows[0]?.sent_today || '0', 10);
      const remainingToday = Math.max(0, warmupDailyLimit - sentToday);

      // Tasa de respuesta justa: considera prospectos salientes y conversaciones totales
      const totalConversations = outreachSent + (replied > outreachSent ? (replied - outreachSent) : 0);
      const replyRatePercent = totalConversations > 0 
        ? Math.min(100, Math.round((replied / totalConversations) * 100)) 
        : (replied > 0 ? 100 : 0);

      const variableTotal = attendedMeetings * successFeePerMeeting;
      const grandTotal = baseRetainer + variableTotal;

      // Columnas Kanban con el nombre de campaña
      const fetchColumn = async (statuses: string[]) => {
        const res = await pool.query(
          `SELECT l.*, s.name as service_name 
           FROM leads l 
           LEFT JOIN services s ON l.service_id = s.id 
           WHERE l.status = ANY($1) 
           ORDER BY l.updated_at DESC LIMIT 50`,
          [statuses]
        );
        return res.rows.map(r => OutreachRepo.mapLeadRow(r));
      };

      const [discovered, outreachList, repliedList, qualifiedList, closedWonList, takeoverList] = await Promise.all([
        fetchColumn(['DISCOVERED', 'QUEUED']),
        fetchColumn(['OUTREACH_SENT', 'FOLLOW_UP_SENT']),
        fetchColumn(['REPLIED']),
        fetchColumn(['QUALIFIED', 'MEETING_SCHEDULED']),
        fetchColumn(['CLOSED_WON']),
        fetchColumn(['HUMAN_TAKEOVER'])
      ]);

      // Chats activos con último mensaje y nombre de campaña
      const chatsRes = await pool.query(`
        SELECT DISTINCT ON (m.lead_phone)
          m.lead_phone,
          m.content as last_content,
          m.created_at as last_created_at,
          l.company_name,
          l.status,
          l.service_id,
          l.source,
          l.category,
          s.name as service_name,
          l.assigned_rep_name,
          l.human_takeover_at
        FROM chat_messages m
        LEFT JOIN leads l ON l.phone = m.lead_phone
        LEFT JOIN services s ON l.service_id = s.id
        ORDER BY m.lead_phone, m.created_at DESC
        LIMIT 50
      `);

      const activeChats = chatsRes.rows
        .sort((a, b) => new Date(b.last_created_at).getTime() - new Date(a.last_created_at).getTime())
        .map(r => ({
          leadPhone: r.lead_phone,
          leadName: r.company_name || 'Prospecto',
          status: (r.status || 'REPLIED') as LeadStatus,
          serviceId: r.service_id || undefined,
          serviceName: r.service_name || 'Directo / Orgánico',
          source: (r.source || 'outbound') as LeadSource,
          category: r.category || '',
          assignedRepName: r.assigned_rep_name || undefined,
          isHumanTakeover: !!r.human_takeover_at || r.status === 'HUMAN_TAKEOVER',
          lastMessageSnippet: r.last_content ? r.last_content.slice(0, 75) : '',
          lastMessageAt: r.last_created_at ? new Date(r.last_created_at).toISOString() : new Date().toISOString()
        }));

      return {
        metrics: {
          totalLeads,
          outreachSent,
          replied,
          replyRatePercent,
          qualified,
          meetingsScheduled,
          attendedMeetings,
          noShowMeetings,
          humanTakeover,
          closedWon,
          settlement: {
            baseRetainer,
            successFeePerMeeting,
            variableTotal,
            grandTotal,
            currency
          },
          warmup: {
            isWarmupActive,
            currentDay: activeDays,
            dailyLimit: warmupDailyLimit,
            sentToday,
            remainingToday,
            activePhase
          }
        },
        kanban: {
          discovered,
          outreachSent: outreachList,
          replied: repliedList,
          qualified: qualifiedList,
          closedWon: closedWonList,
          humanTakeover: takeoverList
        },
        activeChats
      };
    } else {
      const data = DbConnection.getFallbackData();
      const allLeads: Lead[] = data.leads || [];

      const totalLeads = allLeads.length;
      const outreachSent = allLeads.filter(l => l.status === 'OUTREACH_SENT' || l.status === 'FOLLOW_UP_SENT').length;
      const replied = allLeads.filter(l => l.status === 'REPLIED').length;
      const qualified = allLeads.filter(l => l.status === 'QUALIFIED').length;
      const meetingsScheduled = allLeads.filter(l => l.status === 'MEETING_SCHEDULED').length;
      const attendedMeetings = allLeads.filter(l => l.meetingAttendanceStatus === 'ATTENDED').length;
      const noShowMeetings = allLeads.filter(l => l.meetingAttendanceStatus === 'NO_SHOW').length;
      const humanTakeover = allLeads.filter(l => l.status === 'HUMAN_TAKEOVER').length;
      const closedWon = allLeads.filter(l => l.status === 'CLOSED_WON').length;
      const totalConversations = outreachSent + (replied > outreachSent ? (replied - outreachSent) : 0);
      const replyRatePercent = totalConversations > 0 ? Math.min(100, Math.round((replied / totalConversations) * 100)) : (replied > 0 ? 100 : 0);

      const variableTotal = attendedMeetings * successFeePerMeeting;
      const grandTotal = baseRetainer + variableTotal;

      const kanban = {
        discovered: allLeads.filter(l => l.status === 'DISCOVERED' || l.status === 'QUEUED').slice(0, 25),
        outreachSent: allLeads.filter(l => l.status === 'OUTREACH_SENT' || l.status === 'FOLLOW_UP_SENT').slice(0, 25),
        replied: allLeads.filter(l => l.status === 'REPLIED').slice(0, 25),
        qualified: allLeads.filter(l => l.status === 'QUALIFIED' || l.status === 'MEETING_SCHEDULED').slice(0, 25),
        closedWon: allLeads.filter(l => l.status === 'CLOSED_WON').slice(0, 25),
        humanTakeover: allLeads.filter(l => l.status === 'HUMAN_TAKEOVER').slice(0, 25)
      };

      const messages: ChatMessage[] = data.messages || [];
      const chatMap = new Map<string, ChatMessage>();
      for (const m of messages) {
        chatMap.set(m.leadPhone, m);
      }

      const activeChats: Array<any> = [];
      chatMap.forEach((lastMsg, phone) => {
        const lead = allLeads.find(l => l.phone === phone);
        activeChats.push({
          leadPhone: phone,
          leadName: lead?.companyName || 'Prospecto',
          status: lead?.status || 'REPLIED',
          source: lead?.source || 'outbound',
          category: lead?.category || '',
          serviceId: lead?.serviceId,
          serviceName: lead?.serviceName,
          assignedRepName: lead?.assignedRepName,
          isHumanTakeover: lead?.status === 'HUMAN_TAKEOVER' || !!lead?.humanTakeoverAt,
          lastMessageSnippet: (lastMsg.content || '').slice(0, 75),
          lastMessageAt: lastMsg.createdAt || new Date().toISOString()
        });
      });

      return {
        metrics: {
          totalLeads,
          outreachSent,
          replied,
          replyRatePercent,
          qualified,
          meetingsScheduled,
          attendedMeetings,
          noShowMeetings,
          humanTakeover,
          closedWon,
          settlement: {
            baseRetainer,
            successFeePerMeeting,
            variableTotal,
            grandTotal,
            currency: 'S/.'
          },
          warmup: {
            isWarmupActive,
            currentDay: activeDays,
            dailyLimit: warmupDailyLimit,
            sentToday: 0,
            remainingToday: warmupDailyLimit,
            activePhase: activeDays <= 2 ? 1 : (activeDays <= 4 ? 2 : 3)
          }
        },
        kanban,
        activeChats: activeChats.slice(0, 35)
      };
    }
  }
}
