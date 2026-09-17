import dotenv from 'dotenv';
import { ColdEmailIngestor } from '../src/email/cold_email_ingestor.js';
import { OutreachRepo } from '../src/db/repo.js';

dotenv.config();

async function main() {
  console.log('🚀 Iniciando ingesta diversificada y aleatoria de decisores (Perú + USA)...');
  await OutreachRepo.init();

  const nichesConfig: { niche: string; country: 'PE' | 'US'; city?: string; maxLeads: number }[] = [
    { niche: 'clinicas', country: 'PE', city: 'Lima', maxLeads: 8 },
    { niche: 'clinicas', country: 'US', city: 'Miami', maxLeads: 7 },
    { niche: 'educacion', country: 'PE', city: 'Lima', maxLeads: 8 },
    { niche: 'inmobiliarias', country: 'PE', city: 'Lima', maxLeads: 7 }
  ];

  // Mezclar el orden aleatoriamente
  const shuffledNiches = [...nichesConfig].sort(() => Math.random() - 0.5);

  let totalIngested = 0;

  for (const config of shuffledNiches) {
    console.log(`\n🔍 Extrayendo lote para nicho: "${config.niche}" en ${config.country} (${config.city || 'Principal'})...`);
    try {
      const res = await ColdEmailIngestor.ingestFromApollo({
        niche: config.niche,
        country: config.country,
        cityOrState: config.city,
        maxLeads: config.maxLeads
      });
      console.log(`✅ Resultado: ${res.totalScraped} escaneados, ${res.queuedCount} nuevos encolados.`);
      totalIngested += res.queuedCount;
    } catch (err: any) {
      console.error(`⚠️ Error extrayendo para ${config.niche} (${config.country}):`, err.message);
    }
  }

  console.log(`\n🎉 Ingesta combinada finalizada: ${totalIngested} nuevos decisores en cola en la base de datos.`);
  const queuedLeads = await OutreachRepo.listEmailCampaignLeads({ status: 'QUEUED', limit: 30 });
  console.log(`📋 Total decisores listos en cola: ${queuedLeads.length}`);
  for (const l of queuedLeads.slice(0, 10)) {
    console.log(`   • [${l.countryCode}] ${l.companyName} - ${l.contactName || l.title || 'Director'} (${l.email})`);
  }
}

main().catch(err => {
  console.error('Error fatal:', err);
  process.exit(1);
});
