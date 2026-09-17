import dotenv from 'dotenv';
dotenv.config();
import { OutreachRepo } from '../src/db/repo.js';
import { DbConnection } from '../src/db/connection.js';
import { ApifyScraper } from '../src/scraper/apify_scraper.js';

async function focusB2BInfrastructure() {
  console.log('🚀 Iniciando alineación estratégica a Infraestructura Comercial B2B...');
  await OutreachRepo.init();
  const pool = DbConnection.getPool();

  // 1. Pausar live-commerce-peru
  console.log('⏸️ Pausando campaña de Live Shopping (live-commerce-peru)...');
  await pool.query("UPDATE services SET is_active = false WHERE id = 'live-commerce-peru'");

  // 2. Archivar leads descubiertos de live shopping para no mezclar la prospección
  const archiveRes = await pool.query(`
    UPDATE leads 
    SET status = 'ARCHIVED' 
    WHERE service_id = 'live-commerce-peru' AND status = 'DISCOVERED'
  `);
  console.log(`📦 Leads de Live Shopping archivados: ${archiveRes.rowCount} prospectos.`);

  // 3. Afinar queries B2B de alto valor para infraestructura-comercial-peru
  const b2bQueries = [
    'clinica estetica miraflores san isidro',
    'centro odontologico santiago de surco san isidro',
    'estudio de abogados corporativo san isidro miraflores',
    'inmobiliaria constructora santiago de surco miraflores',
    'consultoria contable tributaria empresarial san isidro',
    'agencia de marketing b2b miraflores san isidro',
    'clinica dental implantes san borja surco'
  ];

  const targetLocations = ['Lima, Peru', 'Arequipa, Peru', 'Trujillo, Peru'];

  console.log('💎 Actualizando campaña "infraestructura-comercial-peru" con nichos B2B de alto ticket...');
  await pool.query(`
    UPDATE services 
    SET is_active = true,
        apify_queries = $1,
        target_locations = $2
    WHERE id = 'infraestructura-comercial-peru'
  `, [JSON.stringify(b2bQueries), JSON.stringify(targetLocations)]);

  console.log('✅ Campaña B2B activada y afinada.');

  // 4. Ejecutar scraping ad-hoc con Apify para inyectar prospectos B2B frescos
  console.log('🌐 Ejecutando scraping en Apify (Clínicas Estéticas y Centros Odontológicos en San Isidro / Miraflores)...');
  try {
    const scraped = await ApifyScraper.scrapeGoogleMaps({
      query: 'clinica estetica miraflores san isidro',
      location: 'Lima, Peru',
      maxResults: 15,
      countryCode: 'pe',
      scrapeContacts: true
    });

    console.log(`📥 Apify extrajo ${scraped.length} prospectos B2B. Deduplicando y guardando en PostgreSQL...`);
    const savedCount = await OutreachRepo.saveLeadsFromScraper('infraestructura-comercial-peru', scraped);
    console.log(`🎉 ¡${savedCount} nuevos prospectos B2B calificados guardados con éxito en la base de datos!`);
  } catch (err: any) {
    console.error('⚠️ Error en scraping de Apify:', err.message);
  }

  // 5. Mostrar resumen del pipeline B2B actual
  const summaryRes = await pool.query(`
    SELECT status, count(*) as total 
    FROM leads 
    WHERE service_id = 'infraestructura-comercial-peru' 
    GROUP BY status 
    ORDER BY count(*) DESC
  `);
  console.log('\n📊 ESTADO ACTUAL DEL PIPELINE B2B (infraestructura-comercial-peru):');
  console.table(summaryRes.rows);

  process.exit(0);
}

focusB2BInfrastructure().catch(err => {
  console.error('❌ Error fatal:', err);
  process.exit(1);
});
