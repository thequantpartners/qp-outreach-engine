import dotenv from 'dotenv';
import { ScrapedLead, ScrapeGoogleMapsRequest } from '../types/index.js';

dotenv.config();

export class ApifyScraper {
  private static get token(): string {
    const t = process.env.APIFY_TOKEN;
    if (!t) {
      throw new Error(
        'Falta configurar APIFY_TOKEN en las variables de entorno (.env). Obtenlo gratis en https://console.apify.com/account/integrations'
      );
    }
    return t;
  }

  public static async scrapeGoogleMaps(req: ScrapeGoogleMapsRequest): Promise<ScrapedLead[]> {
    const location = req.location || 'Lima, Peru';
    const maxResults = req.maxResults || 15;
    console.log(`[ApifyScraper] Scrapeando: "${req.query}" en "${location}" (Max: ${maxResults})...`);

    const actorId = 'compass~crawler-google-places';
    const input = {
      searchStringsArray: [req.query],
      locationQuery: location,
      maxCrawledPlacesPerSearch: maxResults,
      language: 'es',
      countryCode: req.countryCode || 'pe',
      scrapeContacts: req.scrapeContacts !== false
    };

    const runRes = await fetch(`https://api.apify.com/v2/acts/${actorId}/runs?token=${this.token}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input)
    });

    const runJson: any = await runRes.json();
    if (!runJson.data || !runJson.data.id) {
      throw new Error(`Fallo al iniciar actor de Apify: ${JSON.stringify(runJson)}`);
    }

    const runId = runJson.data.id;
    const defaultDatasetId = runJson.data.defaultDatasetId;
    console.log(`[ApifyScraper] Run iniciado ID: ${runId}, esperando resultados...`);

    // Polling hasta término
    while (true) {
      await new Promise((r) => setTimeout(r, 4000));
      const statusRes = await fetch(`https://api.apify.com/v2/actor-runs/${runId}?token=${this.token}`);
      const statusJson: any = await statusRes.json();
      const status = statusJson.data?.status;

      if (status === 'SUCCEEDED') {
        break;
      } else if (status === 'FAILED' || status === 'ABORTED' || status === 'TIMED-OUT') {
        throw new Error(`El run de Apify terminó en estado: ${status}`);
      }
    }

    const datasetRes = await fetch(`https://api.apify.com/v2/datasets/${defaultDatasetId}/items?token=${this.token}`);
    const items = (await datasetRes.json()) as any[];

    const results: ScrapedLead[] = [];

    for (const item of items) {
      const rawTel = item.phone || item.phoneUnformatted;
      const phoneClean = rawTel ? rawTel.replace(/[^0-9]/g, '') : undefined;

      results.push({
        title: item.title,
        phone: item.phone,
        phoneClean,
        website: item.website,
        email: item.contactDetails?.emails?.[0] || item.email,
        address: item.address,
        city: item.city,
        categoryName: item.categoryName,
        googleMapsUrl: item.url
      });
    }

    console.log(`✅ [ApifyScraper] Extracción exitosa: ${results.length} prospectos obtenidos.`);
    return results;
  }
}
