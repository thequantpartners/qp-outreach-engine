import dotenv from 'dotenv';
import { ApifyScraper } from '../src/scraper/apify_scraper.js';

dotenv.config();

async function main() {
  console.log('--- Probando Apify Google Places con Contactos / Emails ---');
  const results = await ApifyScraper.scrapeGoogleMaps({
    query: 'clinica estetica lima',
    location: 'Lima, Peru',
    maxResults: 5,
    countryCode: 'pe',
    scrapeContacts: true
  });

  console.log('Resultados obtenidos:', results.length);
  for (const r of results) {
    console.log({
      title: r.title,
      email: r.email,
      phone: r.phone,
      website: r.website
    });
  }
}

main().catch(console.error);
