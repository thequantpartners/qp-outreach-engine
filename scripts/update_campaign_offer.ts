import dotenv from 'dotenv';
import { OutreachRepo } from '../src/db/repo.js';

dotenv.config();

async function updateCampaignOffer() {
  console.log('🔄 Inicializando conexión a base de datos...');
  await OutreachRepo.init();

  const serviceId = 'infraestructura-comercial-peru';
  const defaultService = (OutreachRepo as any).defaultServices?.find((s: any) => s.id === serviceId);

  if (!defaultService) {
    console.error(`❌ No se encontró la definición por defecto de "${serviceId}".`);
    process.exit(1);
  }

  console.log(`📌 Actualizando servicio "${serviceId}" en la base de datos con la nueva oferta integral...`);
  await OutreachRepo.saveService(defaultService);

  const updated = await OutreachRepo.getServiceById(serviceId);
  console.log('✅ Servicio actualizado con éxito en la base de datos:');
  console.log(`   - Nombre: ${updated?.name}`);
  console.log(`   - Plantilla A (longitud): ${updated?.outreachTemplate?.length} caracteres`);
  console.log(`   - Plantilla B (longitud): ${updated?.outreachTemplateB?.length} caracteres`);
  console.log(`   - Prompt IA (longitud): ${updated?.aiSystemPrompt?.length} caracteres`);

  process.exit(0);
}

updateCampaignOffer().catch((err) => {
  console.error('❌ Error al actualizar la campaña:', err);
  process.exit(1);
});
