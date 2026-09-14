import { RejectionDetector } from '../src/utils/rejection_detector.js';
import { WhatsAppLabelManager, GHOST_CRM_LABELS } from '../src/whatsapp/label_manager.js';
import { LeadStatus } from '../src/types/index.js';

console.log('🧪 =========================================================');
console.log('🧪 TEST SUITE: REJECTION DETECTOR & WHATSAPP BUSINESS LABELS');
console.log('🧪 =========================================================\n');

let passed = 0;
let total = 0;

function assert(condition: boolean, description: string) {
  total++;
  if (condition) {
    console.log(`  ✅ [PASS] ${description}`);
    passed++;
  } else {
    console.error(`  ❌ [FAIL] ${description}`);
    process.exitCode = 1;
  }
}

// -------------------------------------------------------------
// 1. TEST REJECTION DETECTOR (Caso Real Elyzea y Nicho Salud)
// -------------------------------------------------------------
console.log('📋 1. Probando Detección Semántica de Rechazos y Canales Exclusivos:');

const elyzeaMsg = 'Hola Kenneth, gracias por escribir. Este canal de WhatsApp es exclusivamente para pacientes de Elyzea, así que no es el espacio para propuestas comerciales o de proveedores 💛 Te deseo mucho éxito con tu proyecto.';
const elyzeaRes = RejectionDetector.analyze(elyzeaMsg);
assert(elyzeaRes.isRejection === true, 'Mensaje real de Elyzea detectado como rechazo');
assert(elyzeaRes.category === 'WRONG_CHANNEL_PATIENTS', 'Categoría de Elyzea identificada como WRONG_CHANNEL_PATIENTS');
assert(typeof elyzeaRes.suggestedSignoff === 'string' && elyzeaRes.suggestedSignoff.includes('disculpas'), 'Genera despedida respetuosa con disculpas');

const disinterestMsg = 'Por el momento no estamos interesados, muchas gracias por la información.';
const disinterestRes = RejectionDetector.analyze(disinterestMsg);
assert(disinterestRes.isRejection === true, 'Desinterés cortés detectado');
assert(disinterestRes.category === 'DISINTEREST', 'Categoría identificada como DISINTEREST');

const alreadyHaveMsg = 'Gracias Kenneth pero ya tenemos una agencia que se encarga de todo nuestro marketing digital.';
const alreadyHaveRes = RejectionDetector.analyze(alreadyHaveMsg);
assert(alreadyHaveRes.isRejection === true, 'Objeción "ya tenemos agencia" detectada');
assert(alreadyHaveRes.category === 'DISINTEREST', 'Categoría identificada como DISINTEREST');

const stopMsg = 'STOP';
const stopRes = RejectionDetector.analyze(stopMsg);
assert(stopRes.isRejection === true, 'Opt-out legal "STOP" detectado');
assert(stopRes.category === 'EXPLICIT_OPTOUT', 'Categoría identificada como EXPLICIT_OPTOUT');

const dndMsg = 'Por favor borren mi número de su base y no vuelvan a escribir.';
const dndRes = RejectionDetector.analyze(dndMsg);
assert(dndRes.isRejection === true, 'Solicitud "no vuelvan a escribir" detectada');
assert(dndRes.category === 'DO_NOT_DISTURB', 'Categoría identificada como DO_NOT_DISTURB');

const privateMsg = 'Este es mi WhatsApp personal, no atiendo propuestas de trabajo por aquí.';
const privateRes = RejectionDetector.analyze(privateMsg);
assert(privateRes.isRejection === true, 'Número personal / privado detectado');
assert(privateRes.category === 'WRONG_CHANNEL_PRIVATE', 'Categoría identificada como WRONG_CHANNEL_PRIVATE');

// -------------------------------------------------------------
// 2. TEST FALSOS POSITIVOS (Interés positivo con la palabra "no")
// -------------------------------------------------------------
console.log('\n📋 2. Probando Protección contra Falsos Positivos:');

const falsePos1 = 'No es molestia Kenneth, cuéntame de qué se trata la propuesta.';
const fpRes1 = RejectionDetector.analyze(falsePos1);
assert(fpRes1.isRejection === false, '"No es molestia" NO debe ser tomado como rechazo');

const falsePos2 = 'No entendí bien cómo funciona el bot, me explicas?';
const fpRes2 = RejectionDetector.analyze(falsePos2);
assert(fpRes2.isRejection === false, '"No entendí bien" NO debe ser tomado como rechazo');

const falsePos3 = 'No te preocupes por la hora, mañana reviso la propuesta.';
const fpRes3 = RejectionDetector.analyze(falsePos3);
assert(fpRes3.isRejection === false, '"No te preocupes" NO debe ser tomado como rechazo');

const falsePos4 = 'No hay problema, envíame la ficha por aquí.';
const fpRes4 = RejectionDetector.analyze(falsePos4);
assert(fpRes4.isRejection === false, '"No hay problema" NO debe ser tomado como rechazo');

// -------------------------------------------------------------
// 3. TEST WHATSAPP BUSINESS LABELS (Mapeo 1:1 con Ghost CRM)
// -------------------------------------------------------------
console.log('\n📋 3. Probando Mapeo de Etiquetas con Ghost CRM:');

const testStatuses: LeadStatus[] = [
  'DISCOVERED',
  'OUTREACH_SENT',
  'FOLLOW_UP_SENT',
  'REPLIED',
  'QUALIFIED',
  'MEETING_SCHEDULED',
  'CLOSED_WON',
  'CLOSED_LOST',
  'OPT_OUT',
  'HUMAN_TAKEOVER'
];

for (const status of testStatuses) {
  const lbl = WhatsAppLabelManager.getLabelForStatus(status);
  assert(lbl !== undefined, `Existe etiqueta para estado Ghost CRM: ${status}`);
  if (lbl) {
    assert(typeof lbl.id === 'string' && lbl.id.startsWith('qp_lbl_'), `ID válido para ${status}: ${lbl.id}`);
    assert(typeof lbl.name === 'string' && lbl.name.length > 3, `Nombre descriptivo para ${status}: "${lbl.name}"`);
    assert(typeof lbl.color === 'number' && lbl.color >= 0 && lbl.color <= 19, `Color válido (0-19) para ${status}: ${lbl.color}`);
  }
}

// -------------------------------------------------------------
// 4. TEST DE SINCRONIZACIÓN DE SOCKET DE WHATSAPP (Mock)
// -------------------------------------------------------------
console.log('\n📋 4. Probando Despacho de Sincronización a Socket Baileys:');

const addedLabels: Array<{ jid: string; labelId: string }> = [];
const removedLabels: Array<{ jid: string; labelId: string }> = [];

const mockSock = {
  addChatLabel: async (jid: string, labelId: string) => {
    addedLabels.push({ jid, labelId });
  },
  removeChatLabel: async (jid: string, labelId: string) => {
    removedLabels.push({ jid, labelId });
  }
};

await WhatsAppLabelManager.syncLeadLabel(mockSock, '51987654321', 'QUALIFIED', 'REPLIED');

assert(removedLabels.length === 1 && removedLabels[0].labelId === 'qp_lbl_replied', 'Remueve etiqueta anterior (En Conversación)');
assert(addedLabels.length === 1 && addedLabels[0].labelId === 'qp_lbl_qualified', 'Añade nueva etiqueta (Interesado / Calificado)');
assert(addedLabels[0].jid === '51987654321@s.whatsapp.net', 'JID de WhatsApp formateado correctamente');

// Transición a CLOSED_LOST (Rechazo)
await WhatsAppLabelManager.syncLeadLabel(mockSock, '51987654321', 'CLOSED_LOST', 'QUALIFIED');
assert(addedLabels.length === 2 && addedLabels[1].labelId === 'qp_lbl_lost', 'Asigna etiqueta 🔴 No Interesado al declinar');

console.log(`\n🎉 RESULTADO FINAL: ${passed}/${total} pruebas pasaron exitosamente.`);
if (passed === total) {
  console.log('✅ TODAS LAS PRUEBAS COMPLETADAS CON ÉXITO.\n');
} else {
  process.exit(1);
}
