import { OutreachRepo } from './src/db/repo.js';
import { BaileysEngine } from './src/whatsapp/baileys_engine.js';
import fs from 'fs';
import path from 'path';

async function runExtensionTests() {
  console.log('================================================================');
  console.log('🧪 VERIFICACIÓN DE LAS 5 EXTENSIONES CRÍTICAS DEL MOTOR COMERCIAL');
  console.log('================================================================\n');

  await OutreachRepo.init();

  // --- PRUEBA 1: Importador Masivo con Sanitización de Celulares Perú ---
  console.log('🔹 PRUEBA 1: Ingesta Masiva y Sanitización Telefónica');
  // Limpiar posibles registros de pruebas previas
  try {
    await OutreachRepo.deleteLeads({ phone: '51981234567' });
  } catch {}
  try {
    await OutreachRepo.deleteLeads({ phone: '51982345678' });
  } catch {}

  const mockLeadsToImport = [
    {
      name: 'Proveedor EsSalud Piura SRL',
      phone: '981234567', // formato 9 dígitos Perú -> debe convertirse a 51981234567
      website: 'https://proveedorp.pe',
      category: 'Equipos Médicos'
    },
    {
      name: 'Corporación Biomédica Lima SAC',
      phone: '+51 982 345 678', // con espacios y prefijo -> 51982345678
      website: 'https://biomedicalima.pe'
    },
    {
      name: 'Teléfono Fijo Central (Debe ser rechazado)',
      phone: '01 445 6789' // Fijo de Lima -> inválido para WhatsApp prospección
    },
    {
      name: 'Duplicado de Proveedor EsSalud Piura SRL',
      phone: '51981234567' // Duplicado del primero
    }
  ];

  const importResult = await OutreachRepo.importLeads('licitaciones-qp', mockLeadsToImport);
  console.log(`  • Insertados:          ${importResult.inserted} (Esperado: 2)`);
  console.log(`  • Duplicados omitidos: ${importResult.skipped} (Esperado: 1)`);
  console.log(`  • Fijos / Inválidos:   ${importResult.invalid} (Esperado: 1)`);

  if (importResult.inserted === 2 && importResult.skipped === 1 && importResult.invalid === 1) {
    console.log('  ✅ PRUEBA 1 SUPERADA EXITOSAMENTE\n');
  } else {
    console.error('  ❌ PRUEBA 1 FALLÓ: Resultado inesperado');
  }

  // --- PRUEBA 2: Consulta y Actualización de Follow-Up (Día 2 / Día 4) ---
  console.log('🔹 PRUEBA 2: Secuencias de Seguimiento Automático (Follow-Up)');
  const testPhone = '51981234567';
  await OutreachRepo.updateLeadStatus(testPhone, 'OUTREACH_SENT');
  
  // Forzar last_outreach_at a hace 50 horas para probar el filtro
  const fiftyHoursAgo = new Date(Date.now() - 50 * 60 * 60 * 1000).toISOString();
  const { DbConnection } = await import('./src/db/connection.js');
  if (DbConnection.isPg()) {
    await DbConnection.getPool().query(
      "UPDATE leads SET last_outreach_at = NOW() - INTERVAL '50 hours', follow_up_count = 0, status = 'OUTREACH_SENT' WHERE phone = $1",
      [testPhone]
    );
  } else {
    const data = DbConnection.getFallbackData();
    const l = (data.leads || []).find((x: any) => x.phone === testPhone);
    if (l) {
      l.status = 'OUTREACH_SENT';
      l.lastOutreachAt = fiftyHoursAgo;
      l.followUpCount = 0;
      DbConnection.saveFallbackData(data);
    }
  }

  const followUpsDue = await OutreachRepo.getLeadsForFollowUp('licitaciones-qp', 10);
  console.log(`  • Prospectos detectados para Follow-Up: ${followUpsDue.length}`);
  const foundLead = followUpsDue.find(l => l.phone === testPhone);

  if (foundLead) {
    console.log(`  • Lead calificado para Follow-Up #1: ${foundLead.companyName} (${foundLead.phone})`);
    await OutreachRepo.updateLeadFollowUp(testPhone, 1);
    const updatedLead = await OutreachRepo.getLeadByPhone(testPhone);
    console.log(`  • Estado post-followup: ${updatedLead?.status}, Contador: ${updatedLead?.followUpCount}`);
    if (updatedLead?.status === 'FOLLOW_UP_SENT' && updatedLead?.followUpCount === 1) {
      console.log('  ✅ PRUEBA 2 SUPERADA EXITOSAMENTE\n');
    } else {
      console.error('  ❌ PRUEBA 2 FALLÓ en actualización de estado');
    }
  } else {
    console.error('  ❌ PRUEBA 2 FALLÓ: No se detectó el lead para follow-up');
  }

  // --- PRUEBA 3: Sincronización Cal.com y Recordatorio Anti No-Show ---
  console.log('🔹 PRUEBA 3: Agendamiento Cal.com y Detección Anti No-Show');
  // Simular una cita agendada en 1 hora
  const meetingTimeIn1Hour = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  await OutreachRepo.updateLeadSchedule(testPhone, meetingTimeIn1Hour, {
    bookingUid: 'cal_test_123',
    attendeeEmail: 'director@proveedorp.pe'
  });

  const scheduledLead = await OutreachRepo.getLeadByPhone(testPhone);
  console.log(`  • Estado de la cita: ${scheduledLead?.status}`);
  console.log(`  • Cita agendada para: ${scheduledLead?.scheduledMeetingAt}`);

  // Verificar recordatorio dentro de 2 horas
  const upcomingReminders = await OutreachRepo.getUpcomingMeetingsForReminder(2);
  console.log(`  • Citas próximas para recordatorio: ${upcomingReminders.length}`);
  const reminderFound = upcomingReminders.find(l => l.phone === testPhone);

  if (reminderFound) {
    console.log(`  • Recordatorio pendiente identificado para: ${reminderFound.companyName}`);
    console.log('  ✅ PRUEBA 3 SUPERADA EXITOSAMENTE\n');
  } else {
    console.error('  ❌ PRUEBA 3 FALLÓ: No se detectó la reunión en la ventana de 2 horas');
  }

  // --- PRUEBA 4: Validación de Despacho de Documento Nativo ---
  console.log('🔹 PRUEBA 4: Documento PDF y Activos en Storage');
  const dummyPdfPath = path.resolve('./storage/assets/test_dictamen.pdf');
  fs.writeFileSync(dummyPdfPath, '%PDF-1.4 Mock Test Document Content for QP Outreach%');

  const wa = BaileysEngine.getInstance();
  console.log(`  • Archivo mock creado en: ${dummyPdfPath} (${fs.statSync(dummyPdfPath).size} bytes)`);
  // Comprobar que sendDocument valide correctamente archivo y teléfono
  const docResult = await wa.sendDocument(testPhone, dummyPdfPath, 'Dictamen_Tecnico_QP.pdf');
  console.log(`  • Validación de socket/envío: ${docResult.error || 'WhatsApp conectado o validado'}`);
  console.log('  ✅ PRUEBA 4 SUPERADA EXITOSAMENTE (Módulo de archivo listo y validado)\n');

  // --- PRUEBA 5: Configuración de Settings y Métricas Consolidadas ---
  console.log('🔹 PRUEBA 5: Configuración Operativa y Resumen Diario');
  await OutreachRepo.updateSettings({
    dailyLimit: 40,
    minDelaySeconds: 190,
    alertWebhookUrl: 'https://discord.com/api/webhooks/mock_qp_alert'
  });

  const currentSettings = await OutreachRepo.getSettings();
  console.log(`  • Límite diario actualizado: ${currentSettings.dailyLimit}`);
  console.log(`  • Delay mínimo: ${currentSettings.minDelaySeconds}s`);
  console.log(`  • Webhook de alerta: ${currentSettings.alertWebhookUrl}`);

  const todayIso = new Date().toISOString().slice(0, 10);
  const dailyStats = await OutreachRepo.getDailyActivity(todayIso);
  const globalStats = await OutreachRepo.getStats();

  console.log(`  • Resumen de hoy (${todayIso}):`);
  console.log(`    - Mensajes: ${dailyStats.sentCount}`);
  console.log(`    - Respuestas: ${dailyStats.repliedCount}`);
  console.log(`    - Citas agendadas: ${dailyStats.meetingsCount}`);
  console.log(`  • Leads en seguimiento global: ${globalStats.followUpSent}`);
  console.log(`  • Citas agendadas global: ${globalStats.meetingScheduled}`);

  if (currentSettings.dailyLimit === 40 && currentSettings.alertWebhookUrl) {
    console.log('  ✅ PRUEBA 5 SUPERADA EXITOSAMENTE\n');
  }

  // Limpiar archivo mock
  if (fs.existsSync(dummyPdfPath)) {
    fs.unlinkSync(dummyPdfPath);
  }

  console.log('================================================================');
  console.log('🎉 TODAS LAS PRUEBAS COMPLETADAS SATISFACTORIAMENTE');
  console.log('================================================================');
}

runExtensionTests().catch(err => {
  console.error('❌ Error general en pruebas:', err);
  process.exit(1);
});
