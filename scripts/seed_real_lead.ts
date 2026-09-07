import dotenv from 'dotenv';
import { OutreachRepo } from '../src/db/repo.js';

dotenv.config();

async function seedRealLead() {
  await OutreachRepo.init();

  const phone = '51993346759';
  const serviceId = 'licitaciones-qp';

  // 1. Guardar el lead real
  await OutreachRepo.saveLeadsFromScraper(serviceId, [{
    title: 'ROMAN MEDICAL SAC (@HUNAM75)',
    phone: '+51 993 346 759',
    phoneClean: phone,
    address: 'Piura / Lima, Perú',
    category: 'Mantenimiento Equipos Biomédicos'
  }]);

  // 2. Actualizar estado a REPLIED y Human Takeover
  await OutreachRepo.updateLeadStatus(phone, 'REPLIED', {
    humanTakeoverAt: new Date().toISOString()
  });

  // 3. Registrar el historial de mensajes reales
  await OutreachRepo.addChatMessage(
    phone, 
    'assistant', 
    'Buenas noches. Le saluda Kenneth de Licitaciones QP.\n\nRevisamos las bases del concurso de EsSalud Piura (CP-03) de S/. 2.85M en mantenimiento biomédico y detectamos 2 observaciones críticas: la penalidad operativa del 5% de la UIT por cada 24h de atraso y la acreditación de calibración técnica según ISO 13485.\n\nPreparamos un dictamen técnico de 3 páginas con el sustento legal y de ingeniería para salvar la propuesta técnica. Con todo gusto se lo puedo compartir mañana a las 8:30 AM por este medio para que su equipo de licitaciones lo evalúe. ¿A qué nombre y cargo tengo el gusto de dirigir el documento?'
  );

  await OutreachRepo.addChatMessage(
    phone,
    'user',
    'Ok gracias'
  );

  console.log('✅ Lead real de EsSalud (+51 993 346 759) insertado exitosamente en PostgreSQL con su historial.');
  process.exit(0);
}

seedRealLead().catch(err => {
  console.error('Error insertando lead real:', err);
  process.exit(1);
});
