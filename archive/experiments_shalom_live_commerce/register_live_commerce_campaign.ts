import dotenv from 'dotenv';
import { OutreachRepo } from '../src/db/repo.js';

dotenv.config();

async function registerLiveCommerceCampaign() {
  console.log('🔄 Conectando a PostgreSQL...');
  await OutreachRepo.init();

  const serviceId = 'live-commerce-peru';
  const defaultService = (OutreachRepo as any).defaultServices?.find((s: any) => s.id === serviceId);

  if (!defaultService) {
    console.error(`❌ No se encontró la definición de "${serviceId}".`);
    process.exit(1);
  }

  console.log(`📌 Sembrando / Actualizando campaña "${serviceId}" en la base de datos...`);
  await OutreachRepo.saveService(defaultService);

  const updated = await OutreachRepo.getServiceById(serviceId);
  console.log('🎉 Campaña registrada con éxito:');
  console.log(`   - ID: ${updated?.id}`);
  console.log(`   - Nombre: ${updated?.name}`);
  console.log(`   - Activo: ${updated?.isActive}`);
  console.log(`   - Queries Apify: ${JSON.stringify(updated?.apifyQueries)}`);
  console.log(`   - Modo de cierre: ${updated?.closingType}`);

  process.exit(0);
}

registerLiveCommerceCampaign().catch(err => {
  console.error('❌ Error registrando campaña:', err);
  process.exit(1);
});
