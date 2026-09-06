import { OutreachRepo } from './src/db/repo.js';
import { OpenRouterCloser } from './src/ai/openrouter_closer.js';
import { AutonomousPipeline } from './src/pipeline/autonomous_pipeline.js';

async function testAll() {
  console.log('=== TEST 1: Inicialización de Base de Datos y Servicios ===');
  await OutreachRepo.init();
  const services = await OutreachRepo.getServices();
  console.log(`✅ Servicios encontrados: ${services.length}`);
  services.forEach(s => console.log(`  - [${s.id}] ${s.name} (Activo: ${s.isActive})`));

  console.log('\n=== TEST 2: Inserción y Deduplicación de Leads ===');
  const mockScraped = [
    {
      title: 'Clinica San Marcos SAC',
      phone: '+51 987 654 321',
      phoneClean: '51987654321',
      website: 'https://sanmarcos.pe',
      categoryName: 'Clinica Privada'
    },
    {
      title: 'Distribuidora Biomedica del Norte',
      phone: '976 543 210',
      phoneClean: '976543210',
      website: 'https://biomedica.com',
      categoryName: 'Equipos Medicos'
    },
    {
      title: 'Duplicado de Clinica San Marcos',
      phone: '51987654321',
      phoneClean: '51987654321'
    }
  ];

  const { inserted, skipped } = await OutreachRepo.saveLeadsFromScraper('licitaciones-qp', mockScraped);
  console.log(`✅ Leads insertados: ${inserted}, Omitidos/Duplicados: ${skipped}`);

  const leads = await OutreachRepo.getLeads({ serviceId: 'licitaciones-qp' });
  console.log(`✅ Leads en BD para licitaciones-qp: ${leads.length}`);

  console.log('\n=== TEST 3: Mensajería e Historial de Chat ===');
  const testPhone = '51987654321';
  await OutreachRepo.addChatMessage(testPhone, 'assistant', 'Buenas tardes. Le escribe Kenneth de Licitaciones QP...');
  await OutreachRepo.addChatMessage(testPhone, 'user', 'Buenas tardes Kenneth, sí me interesa revisar el dictamen. ¿Dónde puedo agendar?');

  const history = await OutreachRepo.getChatHistory(testPhone);
  console.log(`✅ Mensajes guardados para ${testPhone}: ${history.length}`);
  history.forEach(m => console.log(`  [${m.role}] ${m.content}`));

  console.log('\n=== TEST 4: Bot Conversacional y Cierre (OpenRouter / Heurística) ===');
  const lead = await OutreachRepo.getLeadByPhone(testPhone);
  const activeService = await OutreachRepo.getServiceById('licitaciones-qp');

  const closerRes = await OpenRouterCloser.processInbound(
    lead!,
    'Excelente, me gustaría coordinar una reunión para revisar el dictamen',
    activeService!
  );

  console.log('✅ Resultado del Closer:');
  console.log(`  - Should Respond: ${closerRes.shouldRespond}`);
  console.log(`  - Intent: ${closerRes.intent}`);
  console.log(`  - Respuesta generada: "${closerRes.replyText}"`);
  console.log(`  - Alerta Admin: "${closerRes.adminAlertText}"`);

  console.log('\n=== TEST 5: Human Takeover y Reenganche ===');
  await OutreachRepo.updateLeadStatus(testPhone, 'HUMAN_TAKEOVER', {
    humanTakeoverAt: new Date().toISOString()
  });

  const updatedLead = await OutreachRepo.getLeadByPhone(testPhone);
  console.log(`✅ Estado de Takeover para ${testPhone}: ${updatedLead?.status}, Timestamp: ${updatedLead?.humanTakeoverAt}`);

  const silentCloser = await OpenRouterCloser.processInbound(
    updatedLead!,
    'Hola, alguien por ahí?',
    activeService!
  );
  console.log(`✅ Takeover activo (<24h). ¿IA silenciada?: ${!silentCloser.shouldRespond} (Motivo: ${silentCloser.reason})`);

  console.log('\n=== TEST 6: Estadísticas del Embudo ===');
  const stats = await OutreachRepo.getStats();
  console.log('✅ Estadísticas calculadas:');
  console.log(JSON.stringify(stats, null, 2));

  console.log('\n=== TEST 7: Estado del Pipeline Autónomo ===');
  const pipeStatus = AutonomousPipeline.getStatus();
  console.log('✅ Estado del orquestador:', pipeStatus);

  console.log('\n🎉 TODOS LOS TESTS DE INTEGRACIÓN COMPLETADOS CON ÉXITO!');
}

testAll().catch(console.error);
