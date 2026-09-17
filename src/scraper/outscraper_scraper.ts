import dotenv from 'dotenv';
import { ScrapedLead } from '../types/index.js';

dotenv.config();

export interface OutscraperScrapeRequest {
  query: string;
  location?: string;
  limit?: number; // default: 25
  region?: 'PE' | 'US' | string;
  language?: string; // default: 'es'
}

export interface OutscraperCredits {
  balance: number;
  status: string;
  currency: string;
}

export class OutscraperScraper {
  private static get apiKey(): string {
    const key = process.env.OUTSCRAPER_API_KEY;
    if (!key || key.trim().length === 0) {
      throw new Error(
        'Falta configurar OUTSCRAPER_API_KEY en las variables de entorno (.env). Obtenla en https://outscraper.com/'
      );
    }
    return key.trim();
  }

  /**
   * Sanitiza y normaliza un número de teléfono telefónico internacional
   */
  public static sanitizePhone(rawPhone?: string | null, region: string = 'PE'): { raw: string; clean: string } | null {
    if (!rawPhone || typeof rawPhone !== 'string') return null;

    const digits = rawPhone.replace(/[^0-9]/g, '');
    if (!digits || digits.length < 8) return null;

    let clean = digits;

    // Región Perú (PE)
    if (region.toUpperCase() === 'PE') {
      if (clean.length === 9 && clean.startsWith('9')) {
        clean = `51${clean}`;
      } else if (clean.startsWith('519') && clean.length === 11) {
        // Correcto: móvil peruano 519XXXXXXXX
      } else {
        // Es teléfono fijo (01...), incompleto o sin WhatsApp
        return null;
      }
    }

    // Región USA (US)
    if (region.toUpperCase() === 'US') {
      if (clean.length === 10) {
        clean = `1${clean}`;
      } else if (clean.startsWith('1') && clean.length === 11) {
        // Correcto: 1XXXXXXXXXX
      }
    }

    return { raw: rawPhone, clean };
  }

  /**
   * Ejecuta scraping de empresas en Google Maps usando Outscraper API v2 (Modo Síncrono)
   */
  public static async scrapeGoogleMaps(
    req: OutscraperScrapeRequest,
    customApiKey?: string
  ): Promise<ScrapedLead[]> {
    const key = customApiKey || this.apiKey;
    const limit = req.limit || 25;
    const query = req.query.trim();
    const location = req.location ? req.location.trim() : '';
    const fullQuery = location ? `${query} ${location}` : query;

    // Determinar país / región
    let region = req.region || 'PE';
    if (!req.region) {
      const isUSA = !!(fullQuery).toLowerCase().match(/\b(usa|united states|eeuu|fl|florida|miami|doral|orlando|tampa|kissimmee|tx|texas|houston|dallas|austin|ny|new york|ca|california)\b/);
      region = isUSA ? 'US' : 'PE';
    }

    const lang = req.language || (region === 'US' ? 'en' : 'es');

    const url = `https://api.app.outscraper.com/maps/search-v2?query=${encodeURIComponent(fullQuery)}&limit=${limit}&language=${lang}&region=${region}&async=false`;

    console.log(`📡 [Outscraper] Consultando Google Maps para "${fullQuery}" (Límite: ${limit}, Región: ${region})...`);

    try {
      const res = await fetch(url, {
        method: 'GET',
        headers: {
          'X-API-KEY': key,
          'Accept': 'application/json'
        }
      });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Error Outscraper API HTTP ${res.status}: ${errText}`);
      }

      const body: any = await res.json();
      const rawDataSets = body.data || [];
      const flatItems: any[] = [];

      // La API devuelve un array de arrays (un array por cada query enviada)
      if (Array.isArray(rawDataSets)) {
        for (const set of rawDataSets) {
          if (Array.isArray(set)) {
            flatItems.push(...set);
          } else if (set && typeof set === 'object') {
            flatItems.push(set);
          }
        }
      }

      const validLeads: ScrapedLead[] = [];

      for (const item of flatItems) {
        if (!item || !item.name) continue;

        const phoneResult = this.sanitizePhone(item.phone, region);
        // Filtrado estricto en puerta: solo leads con teléfono sanitizable
        if (!phoneResult) continue;

        // Filtro de nicho B2B: descartar salones de uñas, peluquerías y barberías
        const itemCategory = (item.type || item.category || (item.subtypes ? item.subtypes.split(',')[0]?.trim() : '') || '').toLowerCase();
        const itemName = (item.name || '').toLowerCase();
        const excludedCategories = [
          'uñas', 'nail', 'manicura', 'pedicura', 'peluquería', 'peluqueria', 
          'barber', 'barbería', 'barberia', 'pestañas'
        ];
        if (excludedCategories.some(ex => itemCategory.includes(ex) || itemName.includes(ex))) {
          continue; // Descartar salones de belleza y uñas no médicos
        }

        validLeads.push({
          title: item.name,
          phone: phoneResult.raw,
          phoneClean: phoneResult.clean,
          website: item.website || undefined,
          address: item.address || item.full_address || undefined,
          city: item.city || undefined,
          categoryName: item.type || item.category || (item.subtypes ? item.subtypes.split(',')[0]?.trim() : undefined),
          googleMapsUrl: item.location_link || item.reviews_link || undefined,
          source: 'google_maps',
          metadata: {
            rating: item.rating || null,
            reviews: item.reviews || null,
            photosCount: item.photos_count || null,
            placeId: item.place_id || null,
            googleId: item.google_id || null,
            verified: !!item.verified,
            timeZone: item.time_zone || null,
            outscraperQuery: fullQuery
          }
        });
      }

      console.log(`✅ [Outscraper] ${validLeads.length} comercios válidos con teléfono extraídos (de ${flatItems.length} resultados devueltos).`);
      return validLeads;
    } catch (err: any) {
      console.error(`❌ [Outscraper] Error extrayendo Google Maps para "${fullQuery}":`, err.message);
      throw err;
    }
  }

  /**
   * Consulta el saldo y créditos restantes de la cuenta en Outscraper
   */
  public static async getCredits(customApiKey?: string): Promise<OutscraperCredits> {
    const key = customApiKey || this.apiKey;
    try {
      const res = await fetch('https://api.app.outscraper.com/profile', {
        headers: {
          'X-API-KEY': key,
          'Accept': 'application/json'
        }
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      const data: any = await res.json();
      return {
        balance: typeof data.balance === 'number' ? data.balance : (typeof data.account_balance === 'number' ? data.account_balance : 0),
        status: data.account_status || 'valid',
        currency: 'USD'
      };
    } catch (err: any) {
      console.warn('[Outscraper] No se pudo obtener el saldo de perfil:', err.message);
      return {
        balance: 0,
        status: 'unknown',
        currency: 'USD'
      };
    }
  }
}
