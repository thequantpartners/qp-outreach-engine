import { HandoffManager } from '../src/failover/handoff_manager.js';

async function testResilience() {
  console.log('🧪 Iniciando prueba del HandoffManager (Circuit Breaker y Triggers Conversacionales)...\n');

  // Test 1: Solicitud de humano
  const test1 = HandoffManager.checkConversationalTriggers('Hola, necesito hablar con un asesor por favor', []);
  console.log('Test 1 (Solicitud de asesor):', test1.shouldHandoff, '| Motivo:', test1.reasonText);
  if (!test1.shouldHandoff || test1.reason !== 'USER_REQUESTED_HUMAN') {
    throw new Error('Falló Test 1');
  }

  // Test 2: Frustración / Queja
  const test2 = HandoffManager.checkConversationalTriggers('no me entiendes nada, pura maquina', []);
  console.log('Test 2 (Frustración detectada):', test2.shouldHandoff, '| Motivo:', test2.reasonText);
  if (!test2.shouldHandoff || test2.reason !== 'USER_FRUSTRATION') {
    throw new Error('Falló Test 2');
  }

  // Test 3: Pregunta normal de producto
  const test3 = HandoffManager.checkConversationalTriggers('Buenas tardes, tienen disponible en talla L color negro?', []);
  console.log('Test 3 (Consulta de producto normal):', test3.shouldHandoff);
  if (test3.shouldHandoff) {
    throw new Error('Falló Test 3: No debió activar handoff');
  }

  // Test 4: Bucle de repetición
  const test4 = HandoffManager.checkConversationalTriggers('cual es el precio del vestido rojo?', [
    { leadPhone: '51999999999', role: 'user', content: 'cual es el precio del vestido rojo?', createdAt: new Date().toISOString() },
    { leadPhone: '51999999999', role: 'assistant', content: '¡Hola! Tenemos varias opciones...', createdAt: new Date().toISOString() }
  ]);
  console.log('Test 4 (Bucle de repetición):', test4.shouldHandoff, '| Motivo:', test4.reasonText);
  if (!test4.shouldHandoff || test4.reason !== 'REPETITION_LOOP') {
    throw new Error('Falló Test 4');
  }

  console.log('\n✅ ¡Todos los tests de HandoffManager pasaron con éxito al 100%!');
}

testResilience().catch(err => {
  console.error('❌ Error en test de resiliencia:', err);
  process.exit(1);
});
