import { OutreachRepo } from '../db/repo.js';
import { BaileysEngine } from '../whatsapp/baileys_engine.js';
import { ApifyScraper } from '../scraper/apify_scraper.js';
import { AutonomousPipeline } from '../pipeline/autonomous_pipeline.js';
import { McpServerManager } from '../mcp/server.js';
import { ServiceDefinition } from '../types/index.js';

function parseArgs(args: string[]): { command: string; positional: string[]; flags: Record<string, string | boolean> } {
  const command = args[0] || 'help';
  const positional: string[] = [];
  const flags: Record<string, string | boolean> = {};

  for (let i = 1; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith('--')) {
      const [key, val] = arg.slice(2).split('=');
      flags[key] = val !== undefined ? val : true;
    } else {
      positional.push(arg);
    }
  }

  return { command, positional, flags };
}

export async function runCli(): Promise<void> {
  const rawArgs = process.argv.slice(2);
  const { command, positional, flags } = parseArgs(rawArgs);

  if (command === 'mcp') {
    await McpServerManager.startStdioServer();
    return;
  }

  // Inicializar repositorio local
  await OutreachRepo.init();

  switch (command) {
    case 'status': {
      const wa = BaileysEngine.getInstance();
      const waStatus = wa.getStatus();
      const stats = await OutreachRepo.getStats();
      const services = await OutreachRepo.getServices();

      console.log('\n======================================================');
      console.log('🤖 QP OUTREACH ENGINE | ESTADO DEL SISTEMA');
      console.log('======================================================');
      console.log(`WhatsApp:      ${waStatus.isReady ? '🟢 CONECTADO' : waStatus.hasQr ? '🟡 ESCANEAR QR' : '🔴 DESCONECTADO'}`);
      console.log(`Servicios:     ${services.length} registrados (${services.filter(s => s.isActive).length} activos)`);
      console.log('\n--- Embudo de Prospectos ---');
      console.log(`Total Leads:       ${stats.totalLeads}`);
      console.log(`En Cola:           ${stats.discovered}`);
      console.log(`Contactados:       ${stats.outreachSent}`);
      console.log(`Respondieron:      ${stats.replied}`);
      console.log(`Calificados:       ${stats.qualified}`);
      console.log(`Human Takeover:    ${stats.humanTakeover}`);
      console.log(`Cierres Ganados:   ${stats.closedWon}`);
      console.log(`Perdidos:          ${stats.closedLost}`);
      console.log('======================================================\n');
      process.exit(0);
      break;
    }

    case 'launch': {
      const name = (flags.name as string) || 'Servicios IA B2B';
      const query = (flags.query as string) || 'inmobiliarias lima';
      const location = (flags.location as string) || 'Lima, Peru';
      const maxLeads = flags.max ? parseInt(flags.max as string, 10) : 20;
      const delay = flags.delay ? parseInt(flags.delay as string, 10) : 210;

      const id = name.toLowerCase().replace(/[^a-z0-9]+/g, '-');

      const template =
        (flags.template as string) ||
        `Buenas tardes al equipo de {{name}}.\n\nLe escribe Kenneth de The Quant Partners.\n\nEstuvimos revisando sus canales y detectamos una oportunidad inmediata para implementar un agente de ventas con IA en WhatsApp que califique prospectos 24/7.\n\n¿Me permite compartirle un video de 3 minutos con la arquitectura?`;

      const prompt =
        (flags.prompt as string) ||
        `Eres Kenneth de The Quant Partners. Ofreces implementación de agentes de IA y automatización de WhatsApp para empresas. Respuestas cortas (máximo 2 a 3 oraciones). Tono consultivo y directo. Si muestran interés, ofrece agendar una llamada de 15 minutos en https://cal.com/kenneth-qp/agentes-ia.`;

      console.log(`\n🚀 [CLI] Lanzando campaña "${name}"...`);
      console.log(`Query: "${query}" | Ubicación: "${location}" | Max Leads: ${maxLeads}`);

      const service: ServiceDefinition = {
        id,
        name,
        description: `Oferta: ${name}`,
        targetPersona: 'Directores comerciales y gerentes',
        apifyQueries: [query],
        targetLocations: [location],
        outreachTemplate: template,
        closingType: 'MEETING_LINK',
        closingPayload: {
          meetingUrl: 'https://cal.com/kenneth-qp/agentes-ia',
          closingMessage: 'Excelente. Le comparto el enlace para agendar una sesión técnica de 15 minutos:\nhttps://cal.com/kenneth-qp/agentes-ia'
        },
        aiSystemPrompt: prompt,
        isActive: true
      };

      await OutreachRepo.saveService(service);

      console.log('⏳ Ejecutando scraping en Apify Google Places...');
      const scraped = await ApifyScraper.scrapeGoogleMaps({
        query,
        location,
        maxResults: maxLeads,
        scrapeContacts: true
      });

      const { inserted, skipped } = await OutreachRepo.saveLeadsFromScraper(id, scraped);
      console.log(`✅ ${inserted} prospectos nuevos insertados en base de datos (${skipped} duplicados omitidos).`);

      await OutreachRepo.updateSettings({
        minDelaySeconds: Math.max(delay - 30, 60),
        maxDelaySeconds: delay + 60,
        isAutonomousActive: true
      });

      console.log(`✅ Campaña ${id} activada con cadencia de ${delay}s entre envíos.`);
      process.exit(0);
      break;
    }

    case 'leads': {
      const status = flags.status as any;
      const search = flags.search as string;
      const limit = flags.limit ? parseInt(flags.limit as string, 10) : 30;

      const leads = await OutreachRepo.getLeads({ status, search, limit });

      console.log(`\n📋 Listando ${leads.length} prospectos:\n`);
      console.log('EMPRESA                       TELÉFONO        ESTADO            ÚLTIMO CONTACTO');
      console.log('--------------------------------------------------------------------------------');
      for (const l of leads) {
        const comp = l.companyName.padEnd(28).slice(0, 28);
        const phone = l.phone.padEnd(14).slice(0, 14);
        const st = l.status.padEnd(16).slice(0, 16);
        const time = l.lastMessageAt ? new Date(l.lastMessageAt).toLocaleString('es-PE') : '-';
        console.log(`${comp}  ${phone}  ${st}  ${time}`);
      }
      console.log('\n');
      process.exit(0);
      break;
    }

    case 'chat': {
      const phone = positional[0];
      if (!phone) {
        console.error('❌ Error: Debe especificar el número telefónico: qp-outreach chat <telefono>');
        process.exit(1);
      }

      const history = await OutreachRepo.getChatHistory(phone);
      const lead = await OutreachRepo.getLeadByPhone(phone);

      console.log(`\n💬 Conversación con ${lead?.companyName || phone} (${phone}):`);
      console.log(`Estado: ${lead?.status || 'N/A'}\n`);

      if (history.length === 0) {
        console.log('(No hay mensajes registrados aún)');
      } else {
        for (const m of history) {
          const role = m.role === 'assistant' ? '🤖 BOT IA' : m.role === 'human_agent' ? '👤 KENNETH' : '🏢 CLIENTE';
          const time = new Date(m.createdAt).toLocaleTimeString('es-PE');
          console.log(`[${time}] ${role}:`);
          console.log(`  ${m.content}\n`);
        }
      }
      process.exit(0);
      break;
    }

    case 'send': {
      const phone = positional[0];
      const message = positional.slice(1).join(' ') || (flags.message as string);

      if (!phone || !message) {
        console.error('❌ Error: Formato: qp-outreach send <telefono> "<mensaje>"');
        process.exit(1);
      }

      console.log(`📲 Enviando mensaje manual a ${phone}...`);
      const wa = BaileysEngine.getInstance();
      await wa.init();

      // Esperar brevemente a que el socket sincronice
      await new Promise(r => setTimeout(r, 2000));
      const res = await wa.sendManualReply(phone, message);

      if (res.success) {
        console.log('✅ Mensaje enviado y Human Takeover activado para este contacto.');
      } else {
        console.error(`❌ Fallo al enviar: ${res.error}`);
      }
      process.exit(0);
      break;
    }

    case 'takeover': {
      const phone = positional[0];
      const action = positional[1] || 'on';

      if (!phone) {
        console.error('❌ Error: Formato: qp-outreach takeover <telefono> [on|off]');
        process.exit(1);
      }

      const active = action.toLowerCase() !== 'off';
      if (active) {
        await OutreachRepo.updateLeadStatus(phone, 'HUMAN_TAKEOVER', {
          humanTakeoverAt: new Date().toISOString()
        });
        console.log(`👤 Human Takeover ACTIVADO para ${phone}. La IA no responderá.`);
      } else {
        await OutreachRepo.updateLeadStatus(phone, 'REPLIED', {
          humanTakeoverAt: null
        });
        console.log(`🤖 IA REACTIVADA para ${phone}.`);
      }
      process.exit(0);
      break;
    }

    case 'delete-campaign':
    case 'delete': {
      const serviceId = positional[0] || (flags.id as string);
      if (!serviceId) {
        console.error('❌ Error: Formato: qp-outreach delete-campaign <service_id>');
        process.exit(1);
      }
      const res = await OutreachRepo.deleteService(serviceId, true);
      if (res.success) {
        console.log(`✅ ${res.message}`);
      } else {
        console.error(`❌ ${res.message}`);
      }
      process.exit(0);
      break;
    }

    case 'pause-campaign':
    case 'pause': {
      const serviceId = positional[0] || (flags.id as string);
      if (!serviceId) {
        console.error('❌ Error: Formato: qp-outreach pause-campaign <service_id>');
        process.exit(1);
      }
      const res = await OutreachRepo.toggleService(serviceId, false);
      if (res.success) {
        console.log(`⏸️ ${res.message}`);
      } else {
        console.error(`❌ ${res.message}`);
      }
      process.exit(0);
      break;
    }

    case 'resume-campaign':
    case 'resume': {
      const serviceId = positional[0] || (flags.id as string);
      if (!serviceId) {
        console.error('❌ Error: Formato: qp-outreach resume-campaign <service_id>');
        process.exit(1);
      }
      const res = await OutreachRepo.toggleService(serviceId, true);
      if (res.success) {
        console.log(`▶️ ${res.message}`);
      } else {
        console.error(`❌ ${res.message}`);
      }
      process.exit(0);
      break;
    }

    case 'help':
    default: {
      console.log(`
QP Outreach Engine CLI - Control Headless para IAs y Humanos

USO:
  qp-outreach <comando> [argumentos] [opciones]

COMANDOS:
  status                     Muestra el estado de WhatsApp y métricas del embudo
  launch                     Inicia una campaña con scraping Apify y prospección
  leads                      Lista prospectos (--status=REPLIED, --search=...)
  chat <telefono>            Muestra la conversación completa con un prospecto
  send <tel> "<mensaje>"     Envía un mensaje manual por WhatsApp (activa Takeover)
  takeover <tel> [on|off]    Pausa o reanuda la IA para un contacto
  mcp                        Inicia el servidor Model Context Protocol en stdio
  help                       Muestra esta ayuda

EJEMPLOS:
  npx qp-outreach status
  npx qp-outreach launch --name="Agentes IA" --query="clinicas lima" --max=30
  npx qp-outreach leads --status=QUALIFIED
  npx qp-outreach chat 51987654321
  npx qp-outreach send 51987654321 "Buenas tardes, ¿coordinamos la reunión?"
  npx qp-outreach takeover 51987654321 on
      `);
      process.exit(0);
    }
  }
}
