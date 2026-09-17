async function extractEmailFromWebsite(url: string): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });
    clearTimeout(timeout);
    if (!res.ok) return null;

    const html = await res.text();
    // Regex para correos corporativos (descartando png, jpg, wix, etc.)
    const emailMatches = html.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/gi) || [];
    const cleanEmails = emailMatches
      .map(e => e.toLowerCase().trim())
      .filter(e => 
        !e.endsWith('.png') && 
        !e.endsWith('.jpg') && 
        !e.endsWith('.webp') &&
        !e.includes('sentry') &&
        !e.includes('wixpress') &&
        !e.includes('example.com') &&
        !e.includes('bootstrap')
      );

    return cleanEmails[0] || null;
  } catch (err: any) {
    return null;
  }
}

async function main() {
  const testSites = [
    'https://drasegovia.com/',
    'https://www.imebelle.com/',
    'https://centroesteticobellezaperuana.com/',
    'http://www.lumeniz.com/',
    'https://agarthacmperu.com/'
  ];

  console.log('--- Extrayendo correos directamente de webs corporativas ---');
  for (const site of testSites) {
    const email = await extractEmailFromWebsite(site);
    console.log(`🌐 ${site} -> 📧 ${email || 'No encontrado'}`);
  }
}

main().catch(console.error);
