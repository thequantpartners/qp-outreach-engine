import dotenv from 'dotenv';
import { ColdEmailGenerator } from '../src/email/cold_email_generator.js';
import { ColdEmailScheduler } from '../src/email/cold_email_scheduler.js';
import { OutreachRepo } from '../src/db/repo.js';
import { EmailCampaignLead } from '../src/types/index.js';

dotenv.config();

async function main() {
  console.log('🧪 Iniciando verificación del Cold Email Engine (Perú + USA)...');

  // 1. Probar generación de las 3 variantes para una clínica en Perú
  const leadPeru: EmailCampaignLead = {
    email: 'contacto@odontosalud.pe',
    companyName: 'OdontoSalud San Isidro',
    contactName: 'Carlos Mendoza',
    firstName: 'Carlos',
    title: 'Director Médico',
    industry: 'Clínica Odontológica',
    countryCode: 'PE',
    status: 'QUEUED'
  };

  const emailA = ColdEmailGenerator.generate(leadPeru, 'A');
  const emailB = ColdEmailGenerator.generate(leadPeru, 'B');
  const emailC = ColdEmailGenerator.generate(leadPeru, 'C');

  console.log('✅ Variante A Asunto:', emailA.subject);
  console.log('✅ Variante B Asunto:', emailB.subject);
  console.log('✅ Variante C Asunto:', emailC.subject);

  if (!emailB.subject.includes('Carlos')) {
    throw new Error('Fallo: Variante B debe contener el nombre de pila del lead.');
  }

  // 2. Probar generación para un MedSpa en USA
  const leadUSA: EmailCampaignLead = {
    email: 'director@miamimedspa.com',
    companyName: 'Glow MedSpa Miami',
    contactName: 'Patricia Valenzuela',
    firstName: 'Patricia',
    title: 'Medical Director',
    industry: 'Aesthetic Clinic & MedSpa',
    countryCode: 'US',
    status: 'QUEUED'
  };

  const emailUSA = ColdEmailGenerator.generate(leadUSA, 'B');
  console.log('✅ Asunto USA:', emailUSA.subject);
  if (!emailUSA.text.includes('hispano en EE.UU.')) {
    throw new Error('Fallo: Contexto de USA no detectado.');
  }

  // 3. Probar lógica de horario y slots de ColdEmailScheduler
  const timeInfo = ColdEmailScheduler.getLimaTime();
  const slot = ColdEmailScheduler.getCurrentSlot();
  const status = ColdEmailScheduler.getStatus();

  console.log(`🕒 Hora en Lima: ${timeInfo.timeStr} (Día: ${timeInfo.dayOfWeek})`);
  console.log(`🎯 Slot actual: ${slot}`);
  console.log(`📊 Scheduler Status:`, JSON.stringify(status, null, 2));

  // 4. Probar inicialización de la tabla en PostgreSQL
  await OutreachRepo.init();
  console.log('✅ OutreachRepo inicializado correctamente con tabla email_campaign_leads.');

  console.log('🎉 Todas las verificaciones del Cold Email Engine pasaron exitosamente!');
}

main().catch(err => {
  console.error('❌ Error en test:', err);
  process.exit(1);
});
