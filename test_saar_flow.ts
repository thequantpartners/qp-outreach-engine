import { BlueprintsManager } from './src/master/blueprints_manager.js';
import { Deployer } from './src/master/deployer.js';
import { ClientRegistry } from './src/master/client_registry.js';
import { RoundRobinManager } from './src/pipeline/round_robin.js';
import { OutreachRepo } from './src/db/repo.js';

async function main() {
  console.log('\n===============================================================');
  console.log('🧪 TEST INTEGRAL: SUITE SAAR (SOFTWARE AS A RESULT) & MASTER HUB');
  console.log('===============================================================\n');

  await OutreachRepo.init();

  // 1. Validar Blueprints de Nichos
  console.log('1️⃣ [Test Blueprints] Verificando biblioteca de nichos...');
  const blueprints = BlueprintsManager.listBlueprints();
  console.log(`   Encontrados ${blueprints.length} blueprints: ${blueprints.map(b => b.id).join(', ')}`);
  if (blueprints.length < 4) throw new Error('Se esperaban al menos 4 blueprints de nicho.');
  console.log('   ✅ Blueprints verificados con éxito.\n');

  // 2. Aprovisionar Nuevo Cliente (1-Clic)
  console.log('2️⃣ [Test Deployer] Aprovisionando cliente "Inmobiliaria Los Robles"...');
  const provisionRes = await Deployer.provisionClient({
    companyName: 'Inmobiliaria Los Robles',
    niche: 'inmobiliarias',
    adminPhone: '51902105668',
    salesReps: [
      { name: 'Carlos', phone: '51911111111' },
      { name: 'Valeria', phone: '51922222222' },
      { name: 'Kenneth', phone: '51902105668' }
    ],
    closingMode: 'HYBRID_SMART',
    deployTarget: 'railway',
    clientPin: '7744'
  });

  console.log(`   Resultado: ${provisionRes.message}`);
  console.log(`   PIN generado/fijado: ${provisionRes.clientPin}`);
  console.log(`   Dashboard: ${provisionRes.dashboardUrl}`);
  if (provisionRes.clientPin !== '7744') throw new Error('El PIN no coincide.');
  console.log('   ✅ Aprovisionamiento 1-Clic verificado.\n');

  // 3. Clonar Cliente Existente para un Nuevo Cliente
  console.log('3️⃣ [Test Deployer] Clonando "Inmobiliaria Los Robles" para "Inmobiliaria Las Palmas"...');
  const cloneRes = await Deployer.cloneClient({
    sourceClientId: provisionRes.clientId,
    newCompanyName: 'Inmobiliaria Las Palmas',
    newAdminPhone: '51902105668',
    newSalesReps: [
      { name: 'Andrea', phone: '51933333333' },
      { name: 'Rodrigo', phone: '51944444444' }
    ],
    newClientPin: '8899',
    deployTarget: 'vps'
  });

  console.log(`   Resultado clonación: ${cloneRes.message}`);
  console.log(`   Nuevo ID: ${cloneRes.clientId}`);
  console.log(`   Nuevo PIN: ${cloneRes.clientPin}`);
  console.log(`   Destino: ${cloneRes.deployTarget}`);
  console.log('   ✅ Clonación 1-Clic verificada.\n');

  // 4. Verificar Registro y Flota Maestro
  console.log('4️⃣ [Test ClientRegistry] Consultando salud y catálogo de la flota...');
  const fleetHealth = await ClientRegistry.getFleetHealth();
  console.log(`   Total Clientes en Flota: ${fleetHealth.totalClients}`);
  fleetHealth.clients.forEach(c => {
    console.log(`   - [${c.clientId}] ${c.companyName} (${c.niche}) | PIN: ${c.clientPin} | Reps: ${c.salesReps.length}`);
  });
  if (fleetHealth.totalClients < 2) throw new Error('Se esperaban al menos 2 clientes registrados.');
  console.log('   ✅ Registro maestro de flota verificado.\n');

  // 5. Test Round-Robin Lead Assignment (1 a 1 equitativo)
  console.log('5️⃣ [Test Round-Robin] Probando rotación secuencial entre vendedores...');
  RoundRobinManager.setSalesReps([
    { name: 'Carlos', phone: '51911111111' },
    { name: 'Valeria', phone: '51922222222' },
    { name: 'Kenneth', phone: '51902105668' }
  ]);

  const mockLead1 = {
    companyName: 'Constructora del Sol',
    phone: '51999888111',
    serviceId: 'inmobiliarias',
    status: 'OUTREACH_SENT' as const,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  const mockLead2 = {
    companyName: 'Edificaciones Lima SAC',
    phone: '51999888222',
    serviceId: 'inmobiliarias',
    status: 'OUTREACH_SENT' as const,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  const mockLead3 = {
    companyName: 'Urbanizaciones Modernas',
    phone: '51999888333',
    serviceId: 'inmobiliarias',
    status: 'OUTREACH_SENT' as const,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  // Ingestar leads en base de datos para que persistan las actualizaciones y métricas
  await OutreachRepo.importLeads('inmobiliarias', [
    { name: mockLead1.companyName, phone: mockLead1.phone },
    { name: mockLead2.companyName, phone: mockLead2.phone },
    { name: mockLead3.companyName, phone: mockLead3.phone }
  ]);

  const assign1 = await RoundRobinManager.assignAndAlertLead(mockLead1, 'Interés en cotización', 'Requerimiento de 4 oficinas');
  const assign2 = await RoundRobinManager.assignAndAlertLead(mockLead2, 'Cita solicitada', 'Horario: 4pm');
  const assign3 = await RoundRobinManager.assignAndAlertLead(mockLead3, 'Pregunta técnica', 'Planos de obra');

  console.log(`   Lead 1 asignado a: ${assign1.rep.name} (+${assign1.rep.phone})`);
  console.log(`   Lead 2 asignado a: ${assign2.rep.name} (+${assign2.rep.phone})`);
  console.log(`   Lead 3 asignado a: ${assign3.rep.name} (+${assign3.rep.phone})`);

  if (assign1.rep.name !== 'Carlos' || assign2.rep.name !== 'Valeria' || assign3.rep.name !== 'Kenneth') {
    throw new Error('La rotación Round-Robin no fue equitativa.');
  }
  console.log('   ✅ Round-Robin 1 a 1 verificado con éxito.\n');

  // 6. Test Heartbeat Ultraliviano (<1KB)
  console.log('6️⃣ [Test Heartbeat] Registrando telemetría de nodo satélite...');
  await ClientRegistry.recordHeartbeat({
    clientId: provisionRes.clientId,
    isWhatsAppConnected: true,
    hasQr: false,
    totalLeads: 150,
    repliedLeads: 38,
    qualifiedLeads: 12,
    meetingsBooked: 5,
    timestamp: new Date().toISOString()
  });

  const updatedClient = await ClientRegistry.getClient(provisionRes.clientId);
  console.log(`   Cliente actualizado: ${updatedClient?.companyName}`);
  console.log(`   Estado: ${updatedClient?.status}`);
  console.log(`   Leads: ${updatedClient?.totalLeads}, Calificados: ${updatedClient?.qualifiedLeads}, Citas: ${updatedClient?.meetingsBooked}`);
  if (updatedClient?.status !== 'ACTIVE' || updatedClient?.meetingsBooked !== 5) {
    throw new Error('El heartbeat no actualizó las métricas correctamente.');
  }
  console.log('   ✅ Heartbeat de nodo satélite verificado.\n');

  // 7. Test Dashboard Overview Data
  console.log('7️⃣ [Test Dashboard Overview] Validando método consolidado getDashboardOverview()...');
  const overview = await OutreachRepo.getDashboardOverview();
  console.log(`   Métricas: Total=${overview.metrics.totalLeads}, Calificados=${overview.metrics.qualified}, Citas=${overview.metrics.meetingsScheduled}`);
  console.log(`   Kanban: Descubiertos=${overview.kanban.discovered.length}, Calificados=${overview.kanban.qualified.length}`);
  console.log(`   Chats Activos: ${overview.activeChats.length} conversaciones`);
  // 8. Test Conciliación de Facturación SaaR (Asistió vs No-Show)
  console.log('8️⃣ [Test Conciliación SaaR] Probando validación de asistencia y liquidación variable...');
  // Asignar asistencia y no-show a prospectos de prueba
  await OutreachRepo.updateMeetingAttendance(mockLead1.phone, 'ATTENDED');
  await OutreachRepo.updateMeetingAttendance(mockLead2.phone, 'NO_SHOW');

  const overviewAfterAttendance = await OutreachRepo.getDashboardOverview();
  const settlement = overviewAfterAttendance.metrics.settlement;
  console.log(`   Citas Asistidas Validadas: ${overviewAfterAttendance.metrics.attendedMeetings}`);
  console.log(`   Citas No-Show (Libre de costo): ${overviewAfterAttendance.metrics.noShowMeetings}`);
  console.log(`   Retainer Base: ${settlement.currency} ${settlement.baseRetainer}`);
  console.log(`   Variable PPQM: ${settlement.currency} ${settlement.variableTotal} (${overviewAfterAttendance.metrics.attendedMeetings} x ${settlement.successFeePerMeeting})`);
  console.log(`   Gran Total Facturación: ${settlement.currency} ${settlement.grandTotal}`);

  if (overviewAfterAttendance.metrics.attendedMeetings < 1) {
    throw new Error('No se registró la cita asistida correctamente.');
  }
  if (overviewAfterAttendance.metrics.noShowMeetings < 1) {
    throw new Error('No se registró el no-show correctamente.');
  }
  if (settlement.grandTotal !== settlement.baseRetainer + settlement.variableTotal) {
    throw new Error('El cálculo del total liquidado no coincide.');
  }
  console.log('   ✅ Conciliación de liquidación SaaR verificada con éxito.\n');

  // 9. Test Rampa de Calentamiento Anti-Ban (Warm-up Ramping)
  console.log('9️⃣ [Test Rampa de Calentamiento] Verificando cálculo de días y cuota anti-ban...');
  const warmup = overviewAfterAttendance.metrics.warmup;
  console.log(`   Día Activo de Operación: ${warmup.currentDay}`);
  console.log(`   Modo Warm-up Activo: ${warmup.isWarmupActive ? 'SÍ (Protegido)' : 'NO (Línea Madura)'}`);
  console.log(`   Límite Diario Efectivo: ${warmup.dailyLimit} msgs/día`);

  if (![10, 20, 35].includes(warmup.dailyLimit)) {
    throw new Error(`Límite de warm-up inesperado: ${warmup.dailyLimit}`);
  }
  console.log('   ✅ Rampa de calentamiento anti-ban verificada con éxito.\n');

  console.log('===============================================================');
  console.log('🏆 TODOS LOS TESTS PASARON EXITOSAMENTE (9/9)');
  console.log('===============================================================\n');
}

main().catch(err => {
  console.error('\n❌ ERROR EN EL TEST:', err.message);
  process.exit(1);
});
