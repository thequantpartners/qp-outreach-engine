import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool
} from '@modelcontextprotocol/sdk/types.js';
import { OutreachRepo } from '../db/repo.js';
import { BaileysEngine } from '../whatsapp/baileys_engine.js';
import { ApifyScraper } from '../scraper/apify_scraper.js';
import { AutonomousPipeline } from '../pipeline/autonomous_pipeline.js';
import { ServiceDefinition, ClosingType } from '../types/index.js';
import { ClientRegistry } from '../master/client_registry.js';
import { Deployer } from '../master/deployer.js';
import { BlueprintsManager } from '../master/blueprints_manager.js';
import type { Request, Response } from 'express';

const TOOLS: Tool[] = [
  {
    name: 'outreach_status',
    description: 'Consulta el estado de conexión de WhatsApp (conectado o QR pendiente), métricas del embudo de prospectos y salud del gateway.',
    inputSchema: {
      type: 'object',
      properties: {}
    }
  },
  {
    name: 'list_campaigns',
    description: 'Lista todas las campañas y servicios registrados en el motor (con su id, nombre, estado activo/inactivo, queries de scraping, mecanismo de cierre y plantilla de prospección).',
    inputSchema: {
      type: 'object',
      properties: {}
    }
  },
  {
    name: 'delete_campaign',
    description: 'Elimina una campaña específica por su ID o todas las campañas existentes si se pasa service_id: "all".',
    inputSchema: {
      type: 'object',
      properties: {
        service_id: {
          type: 'string',
          description: 'ID de la campaña a eliminar (ej. "licitaciones-qp", "lar-engine", "custom-service") o "all" para eliminar todas las existentes'
        },
        delete_leads: {
          type: 'boolean',
          description: 'Si es true, elimina también los leads asociados a la campaña (default: true)'
        }
      },
      required: ['service_id']
    }
  },
  {
    name: 'launch_campaign',
    description: 'Inicia una campaña de prospección continua para cualquier oferta de servicio (ej. Servicios de IA, Chatbots, Automatizaciones). Scrapea prospectos en Apify, los deduplica en BD y arranca la prospección escalonada con pausas anti-ban.',
    inputSchema: {
      type: 'object',
      properties: {
        service_id: {
          type: 'string',
          description: 'Identificador único del servicio (ej. "agentes-ia-clinicas", "automatizacion-inmobiliarias")'
        },
        service_name: {
          type: 'string',
          description: 'Nombre descriptivo de la oferta o servicio'
        },
        search_queries: {
          type: 'array',
          items: { type: 'string' },
          description: 'Términos de búsqueda para Apify Google Places (ej. ["clinicas esteticas lima", "centros medicos surco"])'
        },
        target_locations: {
          type: 'array',
          items: { type: 'string' },
          description: 'Ciudades o regiones objetivo (ej. ["Lima, Peru"])'
        },
        max_leads: {
          type: 'number',
          description: 'Cantidad máxima de prospectos a raspar inicialmente (default: 20)'
        },
        outreach_template: {
          type: 'string',
          description: 'Plantilla de prospección en frío con tag {{name}} (estrictamente técnica de 2 pasos sin enlaces web)'
        },
        ai_sales_instructions: {
          type: 'string',
          description: 'Directivas comerciales y manejo de objeciones para que el bot de WhatsApp califique y cierre a los leads que respondan'
        },
        closing_type: {
          type: 'string',
          enum: ['MEETING_LINK', 'PAYMENT_INFO', 'VALUE_ASSET', 'HUMAN_TAKEOVER'],
          description: 'Tipo de cierre a aplicar'
        },
        closing_payload: {
          type: 'object',
          properties: {
            meetingUrl: { type: 'string' },
            paymentDetails: { type: 'string' },
            closingMessage: { type: 'string' }
          },
          description: 'Datos del cierre (enlace Cal.com, datos bancarios o mensaje final)'
        },
        delay_seconds: {
          type: 'number',
          description: 'Pausa de seguridad anti-ban entre mensajes en segundos (default: 210)'
        },
        trigger_immediate: {
          type: 'boolean',
          description: 'Si es true, ejecuta el scraping en Apify inmediatamente (default: true)'
        }
      },
      required: ['service_id', 'service_name', 'search_queries', 'outreach_template', 'ai_sales_instructions']
    }
  },
  {
    name: 'list_leads',
    description: 'Lista los prospectos del embudo con filtros de estado (DISCOVERED, OUTREACH_SENT, REPLIED, QUALIFIED, CLOSED_WON, HUMAN_TAKEOVER).',
    inputSchema: {
      type: 'object',
      properties: {
        status: {
          type: 'string',
          description: 'Estado a filtrar: DISCOVERED, OUTREACH_SENT, REPLIED, QUALIFIED, CLOSED_WON, HUMAN_TAKEOVER'
        },
        service_id: {
          type: 'string',
          description: 'Filtrar por servicio'
        },
        search: {
          type: 'string',
          description: 'Buscar por nombre de empresa o teléfono'
        },
        limit: {
          type: 'number',
          description: 'Límite de resultados (default: 50)'
        }
      }
    }
  },
  {
    name: 'get_chat_history',
    description: 'Obtiene la transcripción completa de la conversación de WhatsApp con un prospecto específico.',
    inputSchema: {
      type: 'object',
      properties: {
        phone: {
          type: 'string',
          description: 'Número telefónico del prospecto (con o sin código de país)'
        }
      },
      required: ['phone']
    }
  },
  {
    name: 'send_whatsapp_message',
    description: 'Envía un mensaje manual inmediato a cualquier número de WhatsApp (si es un lead, silencia automáticamente a la IA en modo Human Takeover).',
    inputSchema: {
      type: 'object',
      properties: {
        to: {
          type: 'string',
          description: 'Número de destino'
        },
        message: {
          type: 'string',
          description: 'Texto del mensaje a enviar'
        }
      },
      required: ['to', 'message']
    }
  },
  {
    name: 'toggle_human_takeover',
    description: 'Pausa la IA para un lead específico (modo humano) o reactiva el bot de cierre automático.',
    inputSchema: {
      type: 'object',
      properties: {
        phone: {
          type: 'string',
          description: 'Número del prospecto'
        },
        active: {
          type: 'boolean',
          description: 'true para silenciar IA (modo humano), false para reactivar IA'
        }
      },
      required: ['phone', 'active']
    }
  },
  {
    name: 'trigger_scraping',
    description: 'Ejecuta scraping multicanal (Google Maps, Meta Ads Library, Instagram, Apollo B2B o Google Search) vía Apify, guardando y deduplicando automáticamente los prospectos en la base de datos.',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Término de búsqueda o nicho (ej. "agencias de marketing lima", "inmobiliarias miraflores", "clinicas esteticas")'
        },
        source: {
          type: 'string',
          enum: ['google_maps', 'meta_ads', 'instagram', 'apollo_b2b', 'google_search'],
          description: 'Canal o fuente de prospección (default: "google_maps")'
        },
        location: {
          type: 'string',
          description: 'Ubicación para Google Maps/Apollo (default: "Lima, Peru")'
        },
        country_code: {
          type: 'string',
          description: 'Código de país ISO de 2 letras (ej. "pe", "co", "mx", "cl")'
        },
        max_results: {
          type: 'number',
          description: 'Cantidad máxima de prospectos a raspar (default: 15)'
        },
        service_id: {
          type: 'string',
          description: 'ID del servicio al que se asignarán los prospectos'
        }
      },
      required: ['query', 'service_id']
    }
  },
  {
    name: 'scrape_meta_ads',
    description: 'Extrae empresas que pagan publicidad activa en Meta Ads Library (Facebook/Instagram), capturando su presupuesto activo y número de WhatsApp en anuncios.',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Nicho o palabra clave del anuncio (ej. "clinica dental", "abogados corporativos", "departamentos surco")'
        },
        country_code: {
          type: 'string',
          description: 'Código de país ISO de 2 letras (default: "PE")'
        },
        max_results: {
          type: 'number',
          description: 'Cantidad máxima de anuncios a analizar (default: 15)'
        },
        service_id: {
          type: 'string',
          description: 'ID de la campaña o servicio para guardar los prospectos'
        }
      },
      required: ['query', 'service_id']
    }
  },
  {
    name: 'scrape_instagram',
    description: 'Extrae perfiles comerciales de Instagram Business con número de WhatsApp/teléfono de contacto público en biografía o botón de contacto.',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Término de búsqueda o nicho (ej. "estetica lima", "odontologia surco", "joyeria peru")'
        },
        max_results: {
          type: 'number',
          description: 'Cantidad máxima de perfiles a raspar (default: 15)'
        },
        service_id: {
          type: 'string',
          description: 'ID de la campaña para guardar los prospectos'
        }
      },
      required: ['query', 'service_id']
    }
  },
  {
    name: 'scrape_apollo_b2b',
    description: 'Extrae decisores C-Level, directores comerciales y empresas B2B mediante la base de datos empresarial de Apollo.',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Industria o cargo B2B (ej. "Software Lima", "Logistica Callao", "Gerentes de Operaciones")'
        },
        country_code: {
          type: 'string',
          description: 'País objetivo (default: "pe")'
        },
        max_results: {
          type: 'number',
          description: 'Cantidad máxima de decisores a raspar (default: 15)'
        },
        service_id: {
          type: 'string',
          description: 'ID de la campaña para guardar los prospectos'
        }
      },
      required: ['query', 'service_id']
    }
  },
  {
    name: 'scrape_google_search',
    description: 'Extrae sitios corporativos y números telefónicos/WhatsApp públicos indexados en los resultados de Google Search.',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Búsqueda en Google (ej. "distribuidora medica lima whatsapp", "proveedor construccion piura")'
        },
        country_code: {
          type: 'string',
          description: 'Código de país (default: "pe")'
        },
        max_results: {
          type: 'number',
          description: 'Cantidad máxima de resultados (default: 15)'
        },
        service_id: {
          type: 'string',
          description: 'ID de la campaña para guardar los prospectos'
        }
      },
      required: ['query', 'service_id']
    }
  },
  {
    name: 'update_campaign',
    description: 'Actualiza campos específicos de una campaña existente (nombre, queries, plantilla, prompt del bot, cierre, estado) sin borrar prospectos ni re-raspar.',
    inputSchema: {
      type: 'object',
      properties: {
        service_id: {
          type: 'string',
          description: 'ID único de la campaña a actualizar'
        },
        service_name: {
          type: 'string',
          description: 'Nuevo nombre descriptivo'
        },
        search_queries: {
          type: 'array',
          items: { type: 'string' },
          description: 'Nuevos términos de búsqueda para Apify'
        },
        target_locations: {
          type: 'array',
          items: { type: 'string' },
          description: 'Ciudades o regiones objetivo'
        },
        outreach_template: {
          type: 'string',
          description: 'Nueva plantilla en 2 pasos con tag {{name}}'
        },
        ai_sales_instructions: {
          type: 'string',
          description: 'Nuevas directivas comerciales para el bot de WhatsApp'
        },
        closing_type: {
          type: 'string',
          enum: ['MEETING_LINK', 'PAYMENT_INFO', 'VALUE_ASSET', 'HUMAN_TAKEOVER'],
          description: 'Tipo de cierre'
        },
        closing_payload: {
          type: 'object',
          properties: {
            meetingUrl: { type: 'string' },
            paymentDetails: { type: 'string' },
            closingMessage: { type: 'string' }
          },
          description: 'Datos del cierre'
        },
        is_active: {
          type: 'boolean',
          description: 'Estado activo o pausado'
        }
      },
      required: ['service_id']
    }
  },
  {
    name: 'toggle_campaign',
    description: 'Pausa (active: false) o reanuda (active: true) una campaña de prospección por su ID.',
    inputSchema: {
      type: 'object',
      properties: {
        service_id: {
          type: 'string',
          description: 'ID de la campaña'
        },
        active: {
          type: 'boolean',
          description: 'true para activar, false para pausar'
        }
      },
      required: ['service_id', 'active']
    }
  },
  {
    name: 'get_campaign',
    description: 'Obtiene la ficha técnica completa y métricas de rendimiento (leads, contactados, respondidos, calificados) de una campaña específica.',
    inputSchema: {
      type: 'object',
      properties: {
        service_id: {
          type: 'string',
          description: 'ID de la campaña a consultar'
        }
      },
      required: ['service_id']
    }
  },
  {
    name: 'update_lead_status',
    description: 'Actualiza manualmente el estado comercial de un prospecto (DISCOVERED, OUTREACH_SENT, REPLIED, QUALIFIED, CLOSED_WON, CLOSED_LOST, HUMAN_TAKEOVER).',
    inputSchema: {
      type: 'object',
      properties: {
        phone: {
          type: 'string',
          description: 'Número de WhatsApp del prospecto'
        },
        status: {
          type: 'string',
          enum: ['DISCOVERED', 'QUEUED', 'OUTREACH_SENT', 'REPLIED', 'QUALIFIED', 'CLOSED_WON', 'CLOSED_LOST', 'HUMAN_TAKEOVER'],
          description: 'Nuevo estado comercial'
        },
        note: {
          type: 'string',
          description: 'Nota o motivo del cambio de estado'
        }
      },
      required: ['phone', 'status']
    }
  },
  {
    name: 'delete_leads',
    description: 'Elimina prospectos de la base de datos según filtros (campaña, estado, teléfono o all: true).',
    inputSchema: {
      type: 'object',
      properties: {
        service_id: {
          type: 'string',
          description: 'Filtrar por ID de campaña'
        },
        status: {
          type: 'string',
          enum: ['DISCOVERED', 'QUEUED', 'OUTREACH_SENT', 'REPLIED', 'QUALIFIED', 'CLOSED_WON', 'CLOSED_LOST', 'HUMAN_TAKEOVER'],
          description: 'Filtrar por estado'
        },
        phone: {
          type: 'string',
          description: 'Teléfono específico a eliminar'
        },
        all: {
          type: 'boolean',
          description: 'Si es true, elimina todos los prospectos de la base de datos'
        }
      }
    }
  },
  {
    name: 'get_whatsapp_qr',
    description: 'Consulta el estado de autenticación de WhatsApp y obtiene el código QR actual para escanear si está pendiente.',
    inputSchema: {
      type: 'object',
      properties: {}
    }
  },
  {
    name: 'import_leads',
    description: 'Importa una lista de prospectos (ej. extraídos de bases de OSCE, SEACE, Sunat o directorios en Excel/CSV) a una campaña específica con sanitización de celulares peruanos (519XXXXXXXX) y deduplicación automática.',
    inputSchema: {
      type: 'object',
      properties: {
        service_id: {
          type: 'string',
          description: 'ID de la campaña o servicio al que se asignarán los prospectos'
        },
        leads: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string', description: 'Nombre de la empresa o contacto' },
              phone: { type: 'string', description: 'Teléfono (con o sin prefijo 51)' },
              website: { type: 'string', description: 'Sitio web opcional' },
              address: { type: 'string', description: 'Dirección física opcional' },
              category: { type: 'string', description: 'Rubro o categoría de la empresa' }
            },
            required: ['name', 'phone']
          },
          description: 'Lista de prospectos a importar'
        }
      },
      required: ['service_id', 'leads']
    }
  },
  {
    name: 'send_document',
    description: 'Envía un documento PDF o archivo nativo por WhatsApp a cualquier prospecto o cliente.',
    inputSchema: {
      type: 'object',
      properties: {
        to: {
          type: 'string',
          description: 'Número de WhatsApp de destino (ej. 51999999999)'
        },
        file_path_or_url: {
          type: 'string',
          description: 'Ruta local (ej. storage/assets/dictamen.pdf) o URL pública descargable del documento'
        },
        file_name: {
          type: 'string',
          description: 'Nombre visible del archivo (ej. Dictamen_Licitaciones_QP.pdf)'
        },
        caption: {
          type: 'string',
          description: 'Mensaje de texto opcional que acompaña al documento'
        }
      },
      required: ['to', 'file_path_or_url', 'file_name']
    }
  },
  {
    name: 'configure_settings',
    description: 'Modifica la configuración operativa global del motor: límites diarios, pausas anti-ban, horario operativo y teléfono del admin.',
    inputSchema: {
      type: 'object',
      properties: {
        daily_limit: {
          type: 'number',
          description: 'Cantidad máxima de mensajes salientes por día (default: 35)'
        },
        min_delay_seconds: {
          type: 'number',
          description: 'Pausa mínima entre mensajes en frío (segundos, min: 60)'
        },
        max_delay_seconds: {
          type: 'number',
          description: 'Pausa máxima entre mensajes en frío (segundos)'
        },
        start_hour: {
          type: 'number',
          description: 'Hora de inicio de actividad (ej. 9 para las 09:00)'
        },
        end_hour: {
          type: 'number',
          description: 'Hora de fin de actividad (ej. 19 para las 19:00)'
        },
        admin_whatsapp_phone: {
          type: 'string',
          description: 'Número de WhatsApp de Kenneth para recibir alertas comerciales de cierre'
        },
        alert_webhook_url: {
          type: 'string',
          description: 'Webhook externo (Discord / Telegram / Slack) para alertas si WhatsApp se desconecta'
        },
        is_autonomous_active: {
          type: 'boolean',
          description: 'Activar o pausar el despacho de mensajes en segundo plano'
        }
      }
    }
  }
];

const MASTER_TOOLS: Tool[] = [
  {
    name: 'list_fleet_clients',
    description: '[Master Núcleo] Lista todos los clientes y nodos satélite aprovisionados en la flota, su estado de WhatsApp, métricas agregadas y URL del dashboard.',
    inputSchema: {
      type: 'object',
      properties: {}
    }
  },
  {
    name: 'provision_client',
    description: '[Master Núcleo] Aprovisiona una nueva infraestructura satélite para un cliente B2B (crea .env.production, docker-compose, PIN de acceso y registra en la flota).',
    inputSchema: {
      type: 'object',
      properties: {
        company_name: { type: 'string', description: 'Nombre de la empresa cliente' },
        niche: { type: 'string', description: 'Nicho de mercado (inmobiliarias, clinicas_salud, estudios_abogados, construccion_b2b o custom)' },
        admin_phone: { type: 'string', description: 'Celular del Gerente/Responsable (ej. 51902105668)' },
        sales_reps: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              phone: { type: 'string' }
            },
            required: ['name', 'phone']
          },
          description: 'Lista de vendedores para distribución Round-Robin'
        },
        closing_mode: {
          type: 'string',
          enum: ['MEETING_LINK', 'PHONE_HANDOFF', 'HYBRID_SMART'],
          description: 'Modo de cierre (default: HYBRID_SMART)'
        },
        meeting_url: { type: 'string', description: 'URL de Cal.com si aplica' },
        service_name: { type: 'string', description: 'Nombre de la solución u oferta' },
        deploy_target: { type: 'string', enum: ['railway', 'vps'], description: 'Destino de despliegue (railway o vps)' },
        client_pin: { type: 'string', description: 'PIN de 4 dígitos para que el cliente ingrese a su dashboard' }
      },
      required: ['company_name', 'niche', 'admin_phone', 'sales_reps']
    }
  },
  {
    name: 'clone_client',
    description: '[Master Núcleo] Clona la configuración, prompts y nicho de un cliente existente para un nuevo cliente en 1 clic.',
    inputSchema: {
      type: 'object',
      properties: {
        source_client_id: { type: 'string', description: 'ID o slug del cliente a duplicar' },
        new_company_name: { type: 'string', description: 'Nombre de la nueva empresa cliente' },
        new_admin_phone: { type: 'string', description: 'Celular del nuevo Gerente' },
        new_sales_reps: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              phone: { type: 'string' }
            },
            required: ['name', 'phone']
          },
          description: 'Lista de nuevos vendedores para Round-Robin'
        },
        new_client_pin: { type: 'string', description: 'Nuevo PIN de acceso opcional' },
        deploy_target: { type: 'string', enum: ['railway', 'vps'] }
      },
      required: ['source_client_id', 'new_company_name', 'new_admin_phone', 'new_sales_reps']
    }
  },
  {
    name: 'list_niche_blueprints',
    description: '[Master Núcleo] Lista las plantillas predefinidas por nicho (Inmobiliarias, Clínicas, Abogados, Construcción) con sus queries y copys en 2 pasos.',
    inputSchema: {
      type: 'object',
      properties: {}
    }
  },
  {
    name: 'get_fleet_health',
    description: '[Master Núcleo] Reporte consolidado de salud de toda la flota: clientes activos, desconectados, leads contactados y citas generadas.',
    inputSchema: {
      type: 'object',
      properties: {}
    }
  }
];

export class McpServerManager {
  private static server: Server | null = null;
  private static sseTransports: Map<string, SSEServerTransport> = new Map();

  /**
   * Crea y configura la instancia común de MCP Server
   */
  public static createServer(): Server {
    if (McpServerManager.server) {
      return McpServerManager.server;
    }

    const server = new Server(
      {
        name: 'qp-outreach-engine',
        version: '2.0.0'
      },
      {
        capabilities: {
          tools: {}
        }
      }
    );

    // 1. Listar herramientas (Aislar herramientas maestras si corre en MODE=client)
    server.setRequestHandler(ListToolsRequestSchema, async () => {
      const isClientNode = process.env.MODE === 'client';
      const activeTools = isClientNode ? TOOLS : [...TOOLS, ...MASTER_TOOLS];
      return { tools: activeTools };
    });

    // 2. Ejecución de herramientas
    server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        switch (name) {
          case 'outreach_status': {
            const wa = BaileysEngine.getInstance();
            const waStatus = wa.getStatus();
            const stats = await OutreachRepo.getStats();
            const pipeStatus = AutonomousPipeline.getStatus();

            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(
                    {
                      whatsapp: {
                        isReady: waStatus.isReady,
                        hasQrPending: waStatus.hasQr
                      },
                      funnelStats: stats,
                      autonomousPipeline: pipeStatus
                    },
                    null,
                    2
                  )
                }
              ]
            };
          }

          case 'list_campaigns': {
            const services = await OutreachRepo.getServices();
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(services, null, 2)
                }
              ]
            };
          }

          case 'delete_campaign': {
            const { service_id, delete_leads = true } = args as any;
            if (!service_id) {
              throw new Error('Debe especificar service_id (ID de campaña o "all")');
            }

            if (service_id === 'all') {
              const result = await OutreachRepo.deleteAllServices(delete_leads);
              return {
                content: [
                  {
                    type: 'text',
                    text: JSON.stringify(result, null, 2)
                  }
                ]
              };
            } else {
              const result = await OutreachRepo.deleteService(service_id, delete_leads);
              return {
                content: [
                  {
                    type: 'text',
                    text: JSON.stringify(result, null, 2)
                  }
                ]
              };
            }
          }

          case 'launch_campaign': {
            const {
              service_id,
              service_name,
              search_queries,
              target_locations = ['Lima, Peru'],
              max_leads = 20,
              outreach_template,
              ai_sales_instructions,
              closing_type = 'MEETING_LINK',
              closing_payload = {},
              delay_seconds = 210,
              trigger_immediate = true
            } = args as any;

            // 1. Registrar o actualizar la definición del servicio
            const service: ServiceDefinition = {
              id: service_id,
              name: service_name,
              description: `Campaña: ${service_name}`,
              targetPersona: 'Empresas B2B calificadas',
              apifyQueries: search_queries,
              targetLocations: target_locations,
              outreachTemplate: outreach_template,
              closingType: closing_type as ClosingType,
              closingPayload: closing_payload,
              aiSystemPrompt: ai_sales_instructions,
              isActive: true
            };

            await OutreachRepo.saveService(service);

            // 2. Actualizar configuración de delay si se solicitó
            await OutreachRepo.updateSettings({
              minDelaySeconds: Math.max(delay_seconds - 30, 60),
              maxDelaySeconds: delay_seconds + 60,
              isAutonomousActive: true
            });

            let scrapeResult = { inserted: 0, skipped: 0 };

            // 3. Scraping inmediato si se pidió
            if (trigger_immediate && search_queries.length > 0) {
              const query = search_queries[0];
              const location = target_locations[0] || 'Lima, Peru';
              const scraped = await ApifyScraper.scrapeGoogleMaps({
                query,
                location,
                maxResults: max_leads,
                scrapeContacts: true
              });
              scrapeResult = await OutreachRepo.saveLeadsFromScraper(service_id, scraped);
            }

            // 4. Asegurar que el pipeline autónomo esté corriendo
            AutonomousPipeline.start();

            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(
                    {
                      success: true,
                      message: `Campaña "${service_name}" configurada y activa con éxito.`,
                      serviceId: service_id,
                      leadsInserted: scrapeResult.inserted,
                      leadsSkipped: scrapeResult.skipped,
                      antiBanDelaySeconds: delay_seconds,
                      pipelineRunning: true
                    },
                    null,
                    2
                  )
                }
              ]
            };
          }

          case 'list_leads': {
            const { status, service_id, search, limit = 50 } = (args || {}) as any;
            const leads = await OutreachRepo.getLeads({
              status,
              serviceId: service_id,
              search,
              limit
            });

            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(leads, null, 2)
                }
              ]
            };
          }

          case 'get_chat_history': {
            const { phone } = args as any;
            const history = await OutreachRepo.getChatHistory(phone);
            const lead = await OutreachRepo.getLeadByPhone(phone);

            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(
                    {
                      lead: lead || { phone },
                      messagesCount: history.length,
                      messages: history
                    },
                    null,
                    2
                  )
                }
              ]
            };
          }

          case 'send_whatsapp_message': {
            const { to, message } = args as any;
            const wa = BaileysEngine.getInstance();
            const result = await wa.sendManualReply(to, message);

            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(result, null, 2)
                }
              ]
            };
          }

          case 'toggle_human_takeover': {
            const { phone, active } = args as any;
            if (active) {
              await OutreachRepo.updateLeadStatus(phone, 'HUMAN_TAKEOVER', {
                humanTakeoverAt: new Date().toISOString()
              });
            } else {
              await OutreachRepo.updateLeadStatus(phone, 'REPLIED', {
                humanTakeoverAt: null
              });
            }

            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(
                    {
                      success: true,
                      phone,
                      humanTakeoverActive: active,
                      message: active ? 'IA silenciada para este contacto.' : 'IA reactivada.'
                    },
                    null,
                    2
                  )
                }
              ]
            };
          }

          case 'trigger_scraping': {
            const {
              query,
              source = 'google_maps',
              location = 'Lima, Peru',
              country_code = 'pe',
              max_results = 15,
              service_id
            } = args as any;

            const scraped = await ApifyScraper.scrapeMultiSource({
              source,
              query,
              location,
              countryCode: country_code,
              maxResults: max_results,
              serviceId: service_id
            });

            const { inserted, skipped } = await OutreachRepo.saveLeadsFromScraper(service_id, scraped);

            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(
                    {
                      success: true,
                      source,
                      query,
                      location,
                      totalFound: scraped.length,
                      insertedNewLeads: inserted,
                      skippedDuplicates: skipped,
                      leads: scraped.slice(0, 10).map(l => ({
                        title: l.title,
                        phone: l.phoneClean || l.phone,
                        source: l.source,
                        website: l.website
                      }))
                    },
                    null,
                    2
                  )
                }
              ]
            };
          }

          case 'scrape_meta_ads': {
            const { query, country_code = 'PE', max_results = 15, service_id } = args as any;
            const scraped = await ApifyScraper.scrapeMetaAds({
              query,
              countryCode: country_code,
              maxResults: max_results,
              serviceId: service_id
            });
            const { inserted, skipped } = await OutreachRepo.saveLeadsFromScraper(service_id, scraped);

            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify({
                    success: true,
                    source: 'meta_ads',
                    query,
                    countryCode: country_code,
                    totalAdsFound: scraped.length,
                    insertedNewLeads: inserted,
                    skippedDuplicates: skipped,
                    sampleLeads: scraped.slice(0, 5)
                  }, null, 2)
                }
              ]
            };
          }

          case 'scrape_instagram': {
            const { query, max_results = 15, service_id } = args as any;
            const scraped = await ApifyScraper.scrapeInstagram({
              query,
              maxResults: max_results,
              serviceId: service_id
            });
            const { inserted, skipped } = await OutreachRepo.saveLeadsFromScraper(service_id, scraped);

            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify({
                    success: true,
                    source: 'instagram',
                    query,
                    totalFound: scraped.length,
                    insertedNewLeads: inserted,
                    skippedDuplicates: skipped,
                    sampleLeads: scraped.slice(0, 5)
                  }, null, 2)
                }
              ]
            };
          }

          case 'scrape_apollo_b2b': {
            const { query, country_code = 'pe', max_results = 15, service_id } = args as any;
            const scraped = await ApifyScraper.scrapeApollo({
              query,
              countryCode: country_code,
              maxResults: max_results,
              serviceId: service_id
            });
            const { inserted, skipped } = await OutreachRepo.saveLeadsFromScraper(service_id, scraped);

            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify({
                    success: true,
                    source: 'apollo_b2b',
                    query,
                    totalFound: scraped.length,
                    insertedNewLeads: inserted,
                    skippedDuplicates: skipped,
                    sampleLeads: scraped.slice(0, 5)
                  }, null, 2)
                }
              ]
            };
          }

          case 'scrape_google_search': {
            const { query, country_code = 'pe', max_results = 15, service_id } = args as any;
            const scraped = await ApifyScraper.scrapeGoogleSearch({
              query,
              countryCode: country_code,
              maxResults: max_results,
              serviceId: service_id
            });
            const { inserted, skipped } = await OutreachRepo.saveLeadsFromScraper(service_id, scraped);

            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify({
                    success: true,
                    source: 'google_search',
                    query,
                    totalFound: scraped.length,
                    insertedNewLeads: inserted,
                    skippedDuplicates: skipped,
                    sampleLeads: scraped.slice(0, 5)
                  }, null, 2)
                }
              ]
            };
          }

          case 'update_campaign': {
            const {
              service_id,
              service_name,
              search_queries,
              target_locations,
              outreach_template,
              ai_sales_instructions,
              closing_type,
              closing_payload,
              is_active
            } = args as any;

            const existing = await OutreachRepo.getServiceById(service_id);
            if (!existing) {
              throw new Error(`No se encontró la campaña con ID "${service_id}".`);
            }

            const updated: ServiceDefinition = {
              ...existing,
              name: service_name !== undefined ? service_name : existing.name,
              description: service_name !== undefined ? `Campaña: ${service_name}` : existing.description,
              apifyQueries: search_queries !== undefined ? search_queries : existing.apifyQueries,
              targetLocations: target_locations !== undefined ? target_locations : existing.targetLocations,
              outreachTemplate: outreach_template !== undefined ? outreach_template : existing.outreachTemplate,
              closingType: closing_type !== undefined ? (closing_type as ClosingType) : existing.closingType,
              closingPayload: closing_payload !== undefined ? { ...existing.closingPayload, ...closing_payload } : existing.closingPayload,
              aiSystemPrompt: ai_sales_instructions !== undefined ? ai_sales_instructions : existing.aiSystemPrompt,
              isActive: is_active !== undefined ? is_active : existing.isActive
            };

            await OutreachRepo.saveService(updated);
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify({
                    success: true,
                    message: `Campaña "${service_id}" actualizada exitosamente.`,
                    campaign: updated
                  }, null, 2)
                }
              ]
            };
          }

          case 'toggle_campaign': {
            const { service_id, active } = args as any;
            const result = await OutreachRepo.toggleService(service_id, active);
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(result, null, 2)
                }
              ]
            };
          }

          case 'get_campaign': {
            const { service_id } = args as any;
            const service = await OutreachRepo.getServiceById(service_id);
            if (!service) {
              throw new Error(`No se encontró la campaña con ID "${service_id}".`);
            }
            const stats = await OutreachRepo.getStats(service_id);
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify({
                    campaign: service,
                    stats
                  }, null, 2)
                }
              ]
            };
          }

          case 'update_lead_status': {
            const { phone, status, note } = args as any;
            await OutreachRepo.updateLeadStatus(phone, status);
            if (note) {
              await OutreachRepo.addChatMessage(phone, 'human_agent', `[Nota de Sistema / Estado: ${status}] ${note}`);
            }
            const updated = await OutreachRepo.getLeadByPhone(phone);
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify({
                    success: true,
                    message: `Estado de lead ${phone} actualizado a ${status}.`,
                    lead: updated
                  }, null, 2)
                }
              ]
            };
          }

          case 'delete_leads': {
            const { service_id, status, phone, all = false } = args as any;
            const result = await OutreachRepo.deleteLeads({
              serviceId: service_id,
              status,
              phone,
              all
            });
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(result, null, 2)
                }
              ]
            };
          }

          case 'get_whatsapp_qr': {
            const wa = BaileysEngine.getInstance();
            const status = wa.getStatus();
            const qr = wa.getLatestQr();
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify({
                    isReady: status.isReady,
                    hasQr: status.hasQr,
                    qr: qr,
                    message: status.isReady
                      ? 'WhatsApp está actualmente CONECTADO y listo para despachar.'
                      : status.hasQr
                      ? 'Código QR pendiente de escaneo. Escanea el código en WhatsApp > Dispositivos Vinculados.'
                      : 'WhatsApp desconectado, esperando regeneración de socket.'
                  }, null, 2)
                }
              ]
            };
          }

          case 'import_leads': {
            const { service_id, leads } = args as any;
            if (!service_id || !leads || !Array.isArray(leads)) {
              throw new Error('Debe proporcionar service_id y un array de leads.');
            }

            const result = await OutreachRepo.importLeads(service_id, leads);
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify({
                    success: true,
                    service_id,
                    imported: result.inserted,
                    skipped_duplicates: result.skipped,
                    invalid_numbers: result.invalid,
                    total_processed: leads.length,
                    message: `Importación completada: ${result.inserted} prospectos agregados, ${result.skipped} duplicados omitidos, ${result.invalid} números inválidos.`
                  }, null, 2)
                }
              ]
            };
          }

          case 'send_document': {
            const { to, file_path_or_url, file_name, caption } = args as any;
            if (!to || !file_path_or_url || !file_name) {
              throw new Error('Debe proporcionar to, file_path_or_url y file_name.');
            }

            const whatsapp = BaileysEngine.getInstance();
            const result = await whatsapp.sendDocument(to, file_path_or_url, file_name, caption);

            if (result.success) {
              await OutreachRepo.addChatMessage(to, 'human_agent', `[DOCUMENTO ENVIADO: ${file_name}] ${caption || ''}`);
              return {
                content: [
                  {
                    type: 'text',
                    text: JSON.stringify({
                      success: true,
                      to,
                      fileName: file_name,
                      jid: result.jid,
                      message: `Documento ${file_name} despachado exitosamente a ${to}.`
                    }, null, 2)
                  }
                ]
              };
            } else {
              return {
                isError: true,
                content: [{ type: 'text', text: `Error enviando documento: ${result.error}` }]
              };
            }
          }

          case 'configure_settings': {
            const {
              daily_limit,
              min_delay_seconds,
              max_delay_seconds,
              start_hour,
              end_hour,
              admin_whatsapp_phone,
              alert_webhook_url,
              is_autonomous_active
            } = args as any;

            const updatePayload: any = {};
            if (daily_limit !== undefined) updatePayload.dailyLimit = daily_limit;
            if (min_delay_seconds !== undefined) updatePayload.minDelaySeconds = min_delay_seconds;
            if (max_delay_seconds !== undefined) updatePayload.maxDelaySeconds = max_delay_seconds;
            if (start_hour !== undefined) updatePayload.startHour = start_hour;
            if (end_hour !== undefined) updatePayload.endHour = end_hour;
            if (admin_whatsapp_phone !== undefined) updatePayload.adminWhatsAppPhone = admin_whatsapp_phone;
            if (alert_webhook_url !== undefined) updatePayload.alertWebhookUrl = alert_webhook_url;
            if (is_autonomous_active !== undefined) updatePayload.isAutonomousActive = is_autonomous_active;

            await OutreachRepo.updateSettings(updatePayload);
            const current = await OutreachRepo.getSettings();

            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify({
                    success: true,
                    message: 'Configuración del motor actualizada exitosamente.',
                    settings: current
                  }, null, 2)
                }
              ]
            };
          }

          // ==========================================
          // MASTER HUB ORCHESTRATION TOOLS
          // ==========================================
          case 'list_fleet_clients': {
            if (process.env.MODE === 'client') {
              throw new Error('Herramienta exclusiva del plano Master Nucleus.');
            }
            const clients = await ClientRegistry.listClients();
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(clients, null, 2)
                }
              ]
            };
          }

          case 'provision_client': {
            if (process.env.MODE === 'client') {
              throw new Error('Herramienta exclusiva del plano Master Nucleus.');
            }
            const {
              company_name,
              niche,
              admin_phone,
              sales_reps,
              closing_mode = 'HYBRID_SMART',
              meeting_url,
              service_name,
              deploy_target = 'railway',
              client_pin
            } = args as any;

            const res = await Deployer.provisionClient({
              companyName: company_name,
              niche,
              adminPhone: admin_phone,
              salesReps: sales_reps,
              closingMode: closing_mode,
              meetingUrl: meeting_url,
              serviceName: service_name,
              deployTarget: deploy_target,
              clientPin: client_pin
            });

            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(res, null, 2)
                }
              ]
            };
          }

          case 'clone_client': {
            if (process.env.MODE === 'client') {
              throw new Error('Herramienta exclusiva del plano Master Nucleus.');
            }
            const {
              source_client_id,
              new_company_name,
              new_admin_phone,
              new_sales_reps,
              new_client_pin,
              deploy_target
            } = args as any;

            const res = await Deployer.cloneClient({
              sourceClientId: source_client_id,
              newCompanyName: new_company_name,
              newAdminPhone: new_admin_phone,
              newSalesReps: new_sales_reps,
              newClientPin: new_client_pin,
              deployTarget: deploy_target
            });

            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(res, null, 2)
                }
              ]
            };
          }

          case 'list_niche_blueprints': {
            const blueprints = BlueprintsManager.listBlueprints();
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(blueprints, null, 2)
                }
              ]
            };
          }

          case 'get_fleet_health': {
            if (process.env.MODE === 'client') {
              throw new Error('Herramienta exclusiva del plano Master Nucleus.');
            }
            const health = await ClientRegistry.getFleetHealth();
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(health, null, 2)
                }
              ]
            };
          }

          default:
            throw new Error(`Herramienta no reconocida: ${name}`);
        }
      } catch (err: any) {
        return {
          isError: true,
          content: [{ type: 'text', text: `Error ejecutando herramienta ${name}: ${err.message}` }]
        };
      }
    });

    McpServerManager.server = server;
    return server;
  }

  /**
   * Inicia el servidor MCP en modo Stdio (para CLI o clientes locales)
   */
  public static async startStdioServer(): Promise<void> {
    // En modo stdio, stdout está reservado exclusivamente para mensajes JSON-RPC de MCP.
    // Redirigimos console.log a console.error para evitar corrupción de protocolo.
    console.log = (...args: any[]) => console.error(...args);

    await OutreachRepo.init();
    const server = McpServerManager.createServer();
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error('🚀 [McpServerManager] Servidor MCP iniciado en transporte STDIO.');
  }

  /**
   * Monta los endpoints SSE en Express (/sse y /messages) para acceso remoto de IAs en Railway
   */
  public static mountSseEndpoints(app: any): void {
    const server = McpServerManager.createServer();

    app.get('/sse', async (req: Request, res: Response) => {
      console.log('📡 [McpServerManager] Nueva conexión SSE entrante para cliente MCP...');
      const transport = new SSEServerTransport('/messages', res);
      const sessionId = transport.sessionId;
      McpServerManager.sseTransports.set(sessionId, transport);

      req.on('close', () => {
        console.log(`📡 [McpServerManager] Conexión SSE cerrada para sesión ${sessionId}`);
        McpServerManager.sseTransports.delete(sessionId);
      });

      await server.connect(transport);
    });

    app.post('/messages', async (req: Request, res: Response) => {
      const sessionId = req.query.sessionId as string;
      const transport = McpServerManager.sseTransports.get(sessionId);

      if (!transport) {
        res.status(404).json({ error: `Sesión SSE no encontrada: ${sessionId}` });
        return;
      }

      await transport.handlePostMessage(req, res);
    });

    console.log('✅ [McpServerManager] Endpoints MCP montados en /sse y /messages');
  }
}
