import dotenv from 'dotenv';

dotenv.config();

async function main() {
  const key = process.env.OUTSCRAPER_API_KEY!;
  const url = `https://api.app.outscraper.com/maps/search-v2?query=clinica+estetica+lima&limit=5&language=es&region=PE&async=false`;

  const res = await fetch(url, {
    headers: { 'X-API-KEY': key }
  });
  const data: any = await res.json();
  const items = data.data?.[0] || [];
  console.log('Resultados de Outscraper:', items.length);
  for (const item of items) {
    console.log({
      name: item.name,
      email: item.email || item.emails,
      website: item.website,
      phone: item.phone
    });
  }
}

main().catch(console.error);
