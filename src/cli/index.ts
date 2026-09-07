import { OutreachRepo } from '../db/repo.js';
import { BaileysEngine } from '../whatsapp/baileys_engine.js';
import { ApifyScraper } from '../scraper/apify_scraper.js';
import { AutonomousPipeline } from '../pipeline/autonomous_pipeline.js';
import { McpServerManager } from '../mcp/server.js';
import { ServiceDefinition } from '../types/index.js';
import { Deployer } from '../master/deployer.js';
import { ClientRegistry } from '../master/client_registry.js';
import { BlueprintsManager } from '../master/blueprints_manager.js';

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
      console.log(`En Follow-Up:      ${stats.followUpSent}`);
      console.log(`Respondieron:      ${stats.replied}`);
      console.log(`Calificados:       ${stats.qualified}`);
      console.log(`Citas Agendadas:   ${stats.meetingScheduled}`);
      console.log(`Human Takeover:    ${stats.humanTakeover}`);
      console.log(`Cierres Ganados:   ${stats.closedWon}`);
      console.log(`Perdidos:          ${stats.closedLost}`);
      console.log(`Sin Respuesta:     ${stats.noResponse}`);
      console.log('======================================================\n');
      process.exit(0);
      break;
    }

    case 'campaigns':
    case 'services': {
      const services = await OutreachRepo.getServices();
      console.log(`\n📋 Campañas y Servicios Registrados (${services.length}):\n`);
      for (const s of services) {
        const icon = s.isActive ? '🟢' : '⚪';
        console.log(`${icon} [${s.id}] ${s.name}`);
        console.log(`   Estado: ${s.isActive ? 'ACTIVO' : 'INACTIVO'} | Cierre: ${s.closingType}`);
        console.log(`   Queries: ${(s.apifyQueries || []).join(', ')}`);
        console.log(`   Plantilla: ${(s.outreachTemplate || '').slice(0, 90).replace(/\n/g, ' ')}...`);
        console.log('');
      }
      process.exit(0);
      break;
    }

    case 'delete-campaign':
    case 'delete-service': {
      const id = positional[0] || (flags.id as string);
      if (!id) {
        console.error('❌ Error: Debe especificar el ID de la campaña o "all": qp-outreach delete-campaign <id|all>');
        process.exit(1);
      }

      if (id === 'all') {
        const res = await OutreachRepo.deleteAllServices(true);
        console.log(`✅ ${res.message}`);
      } else {
        const res = await OutreachRepo.deleteService(id, true);
        console.log(res.success ? `✅ ${res.message}` : `❌ ${res.message}`);
      }
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

    case 'import': {
      const filePath = positional[0] || (flags.file as string);
      const serviceId = (flags.service as string) || (flags.serviceId as string);

      if (!filePath || !serviceId) {
        console.error('❌ Error: Formato: qp-outreach import <archivo.csv> --service=<service_id>');
        process.exit(1);
      }

      const fs = await import('fs');
      const path = await import('path');
      const resolved = path.resolve(filePath);

      if (!fs.existsSync(resolved)) {
        console.error(`❌ Error: Archivo no encontrado en: ${resolved}`);
        process.exit(1);
      }

      const content = fs.readFileSync(resolved, 'utf-8');
      const lines = content.split(/\r?\n/).filter(l => l.trim().length > 0);
      if (lines.length < 2) {
        console.error('❌ Error: El archivo CSV debe contener encabezados y al menos una fila de datos.');
        process.exit(1);
      }

      const headers = lines[0].toLowerCase().split(/[,;\t]/).map(h => h.trim().replace(/^["']|["']$/g, ''));
      const nameIdx = headers.findIndex(h => h.includes('name') || h.includes('empresa') || h.includes('razon') || h.includes('cliente'));
      const phoneIdx = headers.findIndex(h => h.includes('phone') || h.includes('tel') || h.includes('cel') || h.includes('movil'));
      const websiteIdx = headers.findIndex(h => h.includes('web') || h.includes('site') || h.includes('url'));
      const categoryIdx = headers.findIndex(h => h.includes('cat') || h.includes('rubro') || h.includes('giro'));

      if (phoneIdx === -1) {
        console.error('❌ Error: No se encontró una columna de teléfono ("phone", "telefono", "celular") en el encabezado del CSV.');
        process.exit(1);
      }

      const leadsToImport: any[] = [];
      for (let i = 1; i < lines.length; i++) {
        const parts = lines[i].split(/[,;\t]/).map(p => p.trim().replace(/^["']|["']$/g, ''));
        const phone = parts[phoneIdx] || '';
        const name = nameIdx !== -1 && parts[nameIdx] ? parts[nameIdx] : 'Empresa B2B';
        const website = websiteIdx !== -1 ? parts[websiteIdx] : undefined;
        const category = categoryIdx !== -1 ? parts[categoryIdx] : undefined;

        if (phone) {
          leadsToImport.push({ name, phone, website, category });
        }
      }

      console.log(`\n📥 Procesando ${leadsToImport.length} registros del CSV para la campaña "${serviceId}"...`);
      const result = await OutreachRepo.importLeads(serviceId, leadsToImport);

      console.log('\n======================================================');
      console.log('✅ IMPORTACIÓN FINALIZADA');
      console.log('======================================================');
      console.log(`• Nuevos insertados:        ${result.inserted}`);
      console.log(`• Duplicados omitidos:      ${result.skipped}`);
      console.log(`• Teléfonos inválidos:      ${result.invalid}`);
      console.log('======================================================\n');
      process.exit(0);
      break;
    }

    case 'document':
    case 'send-doc': {
      const phone = positional[0];
      const filePath = positional[1];
      const fileName = (flags.name as string) || 'Documento.pdf';
      const caption = flags.caption as string;

      if (!phone || !filePath) {
        console.error('❌ Error: Formato: qp-outreach document <telefono> <ruta_archivo> [--name="Dictamen.pdf"] [--caption="..."]');
        process.exit(1);
      }

      const wa = BaileysEngine.getInstance();
      await wa.init();
      await new Promise(r => setTimeout(r, 2000));

      const res = await wa.sendDocument(phone, filePath, fileName, caption);
      if (res.success) {
        console.log(`✅ Documento "${fileName}" entregado exitosamente a ${phone}!`);
      } else {
        console.error(`❌ Error entregando documento: ${res.error}`);
      }
      process.exit(0);
      break;
    }

    case 'blueprints': {
      const blueprints = BlueprintsManager.listBlueprints();
      console.log('\n======================================================');
      console.log('📚 QP OUTREACH | BLUEPRINTS DE NICHO DISPONIBLES');
      console.log('======================================================');
      blueprints.forEach(b => {
        console.log(`\n• ID:             ${b.id}`);
        console.log(`  Nombre:         ${b.nicheName}`);
        console.log(`  Cierre:         ${b.recommendedClosingMode}`);
        console.log(`  Descripción:    ${b.description}`);
        console.log(`  Queries (Apify): ${b.defaultApifyQueries.slice(0, 2).join(', ')}...`);
      });
      console.log('\n======================================================\n');
      process.exit(0);
      break;
    }

    case 'fleet': {
      const health = await ClientRegistry.getFleetHealth();
      console.log('\n======================================================');
      console.log('🌐 QP OUTREACH MASTER | ESTADO DE LA FLOTA DE CLIENTES');
      console.log('======================================================');
      console.log(`Total Clientes:      ${health.totalClients}`);
      console.log(`WhatsApp Conectados: ${health.activeClients} activos, ${health.disconnectedClients} desconectados`);
      console.log(`Leads Contactados:   ${health.totalLeadsContacted}`);
      console.log(`Oportunidades Handoff: ${health.totalQualifiedOpportunities}`);
      console.log(`Citas Agendadas:     ${health.totalMeetingsBooked}`);
      console.log('\n--- Clientes Registrados ---');
      health.clients.forEach(c => {
        const waStatus = c.isWhatsAppConnected ? '🟢 ONLINE' : '🔴 OFFLINE';
        console.log(`• [${c.clientId}] ${c.companyName} | Rubro: ${c.niche} | WA: ${waStatus} | PIN: ${c.clientPin}`);
        console.log(`  Dashboard: ${c.dashboardUrl}`);
        console.log(`  Vendedores: ${c.salesReps.map(r => r.name).join(', ')}`);
      });
      console.log('\n======================================================\n');
      process.exit(0);
      break;
    }

    case 'provision': {
      const name = flags['name'] as string;
      const niche = (flags['niche'] as string) || 'inmobiliarias';
      const admin = (flags['admin'] as string) || '51902105668';
      const repsRaw = (flags['reps'] as string) || 'Kenneth:51902105668';
      const target = ((flags['target'] as string) || 'railway') as 'railway' | 'vps';
      const pin = flags['pin'] as string | undefined;

      if (!name) {
        console.error('❌ Error: Debe especificar el nombre de la empresa con --name="Nombre"');
        process.exit(1);
      }

      const salesReps = repsRaw.split(',').map(part => {
        const [rName, rPhone] = part.split(':');
        return { name: rName?.trim() || 'Vendedor', phone: (rPhone || admin).replace(/[^0-9]/g, '') };
      });

      console.log(`🚀 Aprovisionando cliente "${name}"...`);
      const result = await Deployer.provisionClient({
        companyName: name,
        niche,
        adminPhone: admin,
        salesReps,
        deployTarget: target,
        clientPin: pin
      });

      console.log('\n======================================================');
      console.log('✅ CLIENTE APROVISIONADO EXITOSAMENTE');
      console.log('======================================================');
      console.log(`Empresa:     ${result.companyName} (${result.clientId})`);
      console.log(`PIN Acceso:  ${result.clientPin}`);
      console.log(`Dashboard:   ${result.dashboardUrl}`);
      console.log(`Destino:     ${result.deployTarget}`);
      console.log(`Archivos:    ${result.configDir}`);
      console.log('======================================================\n');
      process.exit(0);
      break;
    }

    case 'clone': {
      const source = flags['source'] as string;
      const name = flags['name'] as string;
      const admin = (flags['admin'] as string) || '51902105668';
      const repsRaw = (flags['reps'] as string) || 'Kenneth:51902105668';
      const target = ((flags['target'] as string) || 'railway') as 'railway' | 'vps';

      if (!source || !name) {
        console.error('❌ Error: Debe especificar --source="id-cliente-fuente" y --name="Nuevo Cliente"');
        process.exit(1);
      }

      const salesReps = repsRaw.split(',').map(part => {
        const [rName, rPhone] = part.split(':');
        return { name: rName?.trim() || 'Vendedor', phone: (rPhone || admin).replace(/[^0-9]/g, '') };
      });

      console.log(`🐑 Clonando cliente "${source}" para "${name}"...`);
      const result = await Deployer.cloneClient({
        sourceClientId: source,
        newCompanyName: name,
        newAdminPhone: admin,
        newSalesReps: salesReps,
        deployTarget: target
      });

      console.log('\n======================================================');
      console.log('✅ CLIENTE CLONADO EXITOSAMENTE');
      console.log('======================================================');
      console.log(`Nueva Empresa: ${result.companyName} (${result.clientId})`);
      console.log(`PIN Acceso:    ${result.clientPin}`);
      console.log(`Dashboard:     ${result.dashboardUrl}`);
      console.log('======================================================\n');
      process.exit(0);
      break;
    }

    case 'scrape': {
      const source = ((flags['source'] as string) || 'google_maps') as any;
      const query = (flags['query'] as string) || positional[0];
      const location = (flags['location'] as string) || 'Lima, Peru';
      const countryCode = (flags['country'] as string) || (flags['countryCode'] as string) || 'pe';
      const maxResults = flags['max'] ? parseInt(flags['max'] as string, 10) : 15;
      const serviceId = (flags['service'] as string) || (flags['serviceId'] as string) || 'custom-service';

      if (!query) {
        console.error('❌ Error: Debe especificar la búsqueda: qp-outreach scrape --query="nicho" [--source=meta_ads|instagram|apollo_b2b|google_search|google_maps]');
        process.exit(1);
      }

      console.log(`\n🔍 [CLI Scraper] Iniciando extracción multicanal [${source}]...`);
      console.log(`Query: "${query}" | País: "${countryCode}" | Max: ${maxResults} | Campaña: ${serviceId}`);

      try {
        const leads = await ApifyScraper.scrapeMultiSource({
          source,
          query,
          location,
          countryCode,
          maxResults,
          serviceId
        });

        const { inserted, skipped } = await OutreachRepo.saveLeadsFromScraper(serviceId, leads);
        console.log('\n======================================================');
        console.log('✅ EXTRACCIÓN MULTICANAL COMPLETADA');
        console.log('======================================================');
        console.log(`Canal:       ${source}`);
        console.log(`Total Leads: ${leads.length}`);
        console.log(`Nuevos en BD: ${inserted}`);
        console.log(`Duplicados:  ${skipped}`);
        console.log('======================================================\n');
      } catch (err: any) {
        console.error(`❌ Error en extracción: ${err.message}`);
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
  scrape                     Scraping multicanal (--source=meta_ads|instagram|apollo_b2b|google_search|google_maps)
  import <archivo.csv>       Importa prospectos masivamente a una campaña (--service=...)
  document <tel> <archivo>   Envía un documento PDF o archivo nativo por WhatsApp
  leads                      Lista prospectos (--status=REPLIED, --search=...)
  chat <telefono>            Muestra la conversación completa con un prospecto
  send <tel> "<mensaje>"     Envía un mensaje manual por WhatsApp (activa Takeover)
  takeover <tel> [on|off]    Pausa o reanuda la IA para un contacto
  mcp                        Inicia el servidor Model Context Protocol en stdio
  help                       Muestra esta ayuda

EJEMPLOS:
  npx qp-outreach status
  npx qp-outreach launch --name="Agentes IA" --query="clinicas lima" --max=30
  npx qp-outreach import prospectos.csv --service=licitaciones-qp
  npx qp-outreach document 51987654321 storage/assets/dictamen.pdf --name="Dictamen_QP.pdf"
  npx qp-outreach leads --status=QUALIFIED
  npx qp-outreach chat 51987654321
  npx qp-outreach send 51987654321 "Buenas tardes, ¿coordinamos la reunión?"
  npx qp-outreach takeover 51987654321 on
      `);
      process.exit(0);
    }
  }
}
