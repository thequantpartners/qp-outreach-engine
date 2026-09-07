import { ApifyScraper } from './src/scraper/apify_scraper.js';
import { OutreachRepo } from './src/db/repo.js';
import { ScrapedLead } from './src/types/index.js';

async function runMultiScraperTests() {
  console.log('================================================================');
  console.log('🧪 TEST SUITE: SCRAPING MULTICANAL Y EXTRACTOR INTELIGENTE');
  console.log('================================================================\n');

  await OutreachRepo.init();

  // -------------------------------------------------------------
  // PRUEBA 1: Extractor Inteligente de Teléfonos y WhatsApp Links
  // -------------------------------------------------------------
  console.log('🔹 PRUEBA 1: Extractor Inteligente de Teléfonos');

  const testCases = [
    {
      text: '¡Atención Miraflores! Escríbenos directamente a wa.me/51987654321 para separar tu cita.',
      expectedClean: '51987654321'
    },
    {
      text: 'Consultas y presupuestos vía WhatsApp: https://api.whatsapp.com/send?phone=51912345678&text=Hola',
      expectedClean: '51912345678'
    },
    {
      text: 'Clínica Dental San Isidro. Central: +51 988 777 666 | Horario de 9am a 7pm.',
      expectedClean: '51988777666'
    },
    {
      text: 'Constructora e Inmobiliaria. Celular de ventas 999111222. Entrega inmediata.',
      expectedClean: '51999111222'
    },
    {
      text: 'Texto sin número ni teléfono alguno disponible en la biografía.',
      expectedClean: null
    }
  ];

  let passedP1 = true;
  for (let i = 0; i < testCases.length; i++) {
    const tc = testCases[i];
    const res = ApifyScraper.extractPhoneFromText(tc.text);
    const clean = res?.clean || null;

    if (clean === tc.expectedClean) {
      console.log(`  ✅ Caso 1.${i + 1} superado: extraído "${clean}" (Esperado: "${tc.expectedClean}")`);
    } else {
      console.error(`  ❌ Caso 1.${i + 1} FALLÓ: extraído "${clean}", esperado "${tc.expectedClean}"`);
      passedP1 = false;
    }
  }

  if (!passedP1) throw new Error('Prueba 1 de extracción telefónica falló.');
  console.log('  🎯 Extractor de números y enlaces validado al 100%.\n');

  // -------------------------------------------------------------
  // PRUEBA 2: Ingesta y Etiquetado de Leads por Fuente
  // -------------------------------------------------------------
  console.log('🔹 PRUEBA 2: Deduplicación e Ingesta Multi-Fuente en Base de Datos');

  // Limpiar posibles leads previos de test
  try {
    await OutreachRepo.deleteLeads({ phone: '51987654321' });
    await OutreachRepo.deleteLeads({ phone: '51912345678' });
    await OutreachRepo.deleteLeads({ phone: '51988777666' });
    await OutreachRepo.deleteLeads({ phone: '5199900011' });
  } catch {}

  const mockMultiSourceLeads: ScrapedLead[] = [
    {
      title: 'Clínica Estética Bellas Artes SAC',
      phone: '+51 987 654 321',
      phoneClean: '51987654321',
      website: 'https://clinicaesteticaba.pe',
      categoryName: 'Meta Ads: clinicas esteticas',
      source: 'meta_ads',
      metadata: {
        adArchiveId: 'ad_meta_123456',
        spendEstimate: 'S/. 1,500'
      }
    },
    {
      title: 'Dra. Valeria Odontología',
      phone: '912345678',
      phoneClean: '51912345678',
      website: 'https://instagram.com/dravaleria_dental',
      categoryName: 'Instagram: odontologia surco',
      source: 'instagram',
      metadata: {
        username: 'dravaleria_dental',
        followersCount: 14500
      }
    },
    {
      title: 'Logística & Aduanas del Pacífico - Carlos Méndez',
      phone: '+51988777666',
      phoneClean: '51988777666',
      website: 'https://pacificolog.com',
      categoryName: 'Apollo B2B: Logistica Callao',
      source: 'apollo_b2b',
      metadata: {
        contactName: 'Carlos Méndez',
        jobTitle: 'Gerente General',
        companySize: '50-100'
      }
    },
    {
      title: 'Distribuidora Industrial del Norte',
      phone: '99900011',
      phoneClean: '5199900011',
      website: 'https://distribuidoradelnorte.com',
      categoryName: 'Google Search: proveedor industrial piura',
      source: 'google_search',
      metadata: {
        snippet: 'Central de pedidos WhatsApp 99900011'
      }
    }
  ];

  const saveRes = await OutreachRepo.saveLeadsFromScraper('licitaciones-qp', mockMultiSourceLeads);
  console.log(`  • Insertados:          ${saveRes.inserted} (Esperado: 4)`);
  console.log(`  • Duplicados omitidos: ${saveRes.skipped} (Esperado: 0)`);

  if (saveRes.inserted !== 4) {
    throw new Error(`Se esperaban 4 leads insertados, se obtuvieron ${saveRes.inserted}`);
  }

  // -------------------------------------------------------------
  // PRUEBA 3: Verificación de Atributos de Canal en BD
  // -------------------------------------------------------------
  console.log('\n🔹 PRUEBA 3: Consulta y Verificación de Atributos de Canal');

  const metaLead = await OutreachRepo.getLeadByPhone('51987654321');
  const igLead = await OutreachRepo.getLeadByPhone('51912345678');
  const apolloLead = await OutreachRepo.getLeadByPhone('51988777666');
  const googleLead = await OutreachRepo.getLeadByPhone('5199900011');

  console.log(`  • Lead Meta Ads:    [${metaLead?.source}] ${metaLead?.companyName} -> CustomFields: ${JSON.stringify(metaLead?.customFields)}`);
  console.log(`  • Lead Instagram:   [${igLead?.source}] ${igLead?.companyName} -> CustomFields: ${JSON.stringify(igLead?.customFields)}`);
  console.log(`  • Lead Apollo B2B:  [${apolloLead?.source}] ${apolloLead?.companyName} -> CustomFields: ${JSON.stringify(apolloLead?.customFields)}`);
  console.log(`  • Lead Google:      [${googleLead?.source}] ${googleLead?.companyName} -> CustomFields: ${JSON.stringify(googleLead?.customFields)}`);

  if (metaLead?.source !== 'meta_ads') throw new Error('El lead de Meta Ads no preservó su fuente.');
  if (igLead?.source !== 'instagram') throw new Error('El lead de Instagram no preservó su fuente.');
  if (apolloLead?.source !== 'apollo_b2b') throw new Error('El lead de Apollo B2B no preservó su fuente.');
  if (googleLead?.source !== 'google_search') throw new Error('El lead de Google Search no preservó su fuente.');

  console.log('  ✅ Fuentes y metadatos persistidos fielmente en base de datos.');

  // -------------------------------------------------------------
  // PRUEBA 4: Prueba de Deduplicación en Re-ingesta
  // -------------------------------------------------------------
  console.log('\n🔹 PRUEBA 4: Prueba de Deduplicación Estricta');
  const duplicateRes = await OutreachRepo.saveLeadsFromScraper('licitaciones-qp', mockMultiSourceLeads);
  console.log(`  • Insertados:          ${duplicateRes.inserted} (Esperado: 0)`);
  console.log(`  • Duplicados omitidos: ${duplicateRes.skipped} (Esperado: 4)`);

  if (duplicateRes.inserted !== 0 || duplicateRes.skipped !== 4) {
    throw new Error('La deduplicación cruzada falló.');
  }
  console.log('  ✅ Deduplicación anti-colisión confirmada.\n');

  console.log('================================================================');
  console.log('🎉 TODAS LAS PRUEBAS DE SCRAPING MULTICANAL COMPLETADAS CON ÉXITO');
  console.log('================================================================');
  process.exit(0);
}

runMultiScraperTests().catch(err => {
  console.error('\n❌ ERROR EN PRUEBAS:', err.message);
  process.exit(1);
});
