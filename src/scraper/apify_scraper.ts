import { OutreachRepo } from '../db/repo.js';
import dotenv from 'dotenv';
import {
  ScrapedLead,
  ScrapeGoogleMapsRequest,
  ScrapeMetaAdsRequest,
  ScrapeInstagramRequest,
  ScrapeApolloRequest,
  ScrapeGoogleSearchRequest,
  UnifiedScrapeRequest
} from '../types/index.js';

dotenv.config();

export class ApifyScraper {
  public static async getEffectiveToken(providedToken?: string): Promise<string> {
    if (providedToken && providedToken.trim().length > 0) {
      return providedToken.trim();
    }
    try {
      const settings = await OutreachRepo.getSettings();
      if (settings.apifyToken && settings.apifyToken.trim().length > 0) {
        return settings.apifyToken.trim();
      }
    } catch {
      // Fallback
    }
    const envToken = process.env.APIFY_TOKEN;
    if (envToken && envToken.trim().length > 0) {
      return envToken.trim();
    }
    throw new Error(
      'Falta configurar APIFY_TOKEN (en Configuración de la plataforma o en variable de entorno). Obtenlo en https://console.apify.com/account/integrations'
    );
  }

  private static get token(): string {
    const t = process.env.APIFY_TOKEN;
    if (!t) {
      throw new Error(
        'Falta configurar APIFY_TOKEN en las variables de entorno (.env). Obtenlo gratis en https://console.apify.com/account/integrations'
      );
    }
    return t;
  }

  /**
   * Extractor inteligente de números de teléfono y enlaces de WhatsApp desde texto libre
   */
  public static extractPhoneFromText(text: string): { raw: string; clean: string } | null {
    if (!text) return null;

    // 1. Detectar enlaces de WhatsApp directos: wa.me/519... o api.whatsapp.com/send?phone=...
    const waLinkMatch = text.match(/(?:wa\.me\/|whatsapp\.com\/send\?phone=)(\+?[0-9]{8,15})/i);
    if (waLinkMatch && waLinkMatch[1]) {
      const raw = waLinkMatch[1];
      const digits = raw.replace(/[^0-9]/g, '');
      let clean = digits;
      if (clean.length === 9 && clean.startsWith('9')) {
        clean = `51${clean}`;
      }
      if (clean.length >= 9) {
        return { raw, clean };
      }
    }

    // 2. Detectar celulares de Perú (+51 9XX XXX XXX o 9XXXXXXXX)
    const peruvianMobileMatch = text.match(/(?:\+?51[\s.-]?)?(9\d{2}[\s.-]?\d{3}[\s.-]?\d{3})\b/);
    if (peruvianMobileMatch && peruvianMobileMatch[1]) {
      const raw = peruvianMobileMatch[0].trim();
      const digits = raw.replace(/[^0-9]/g, '');
      const clean = digits.length === 9 ? `51${digits}` : digits;
      return { raw, clean };
    }

    // 3. Detectar formato internacional genérico (+XX XXXXXXXXX)
    const intlMatch = text.match(/\+([1-9][0-9\s.-]{7,15}[0-9])\b/);
    if (intlMatch && intlMatch[1]) {
      const raw = `+${intlMatch[1].trim()}`;
      const clean = raw.replace(/[^0-9]/g, '');
      if (clean.length >= 9) {
        return { raw, clean };
      }
    }

    return null;
  }

  /**
   * Ejecutor común para actores de Apify con polling y manejo de timeouts
   */
  private static async runActorAndGetItems(actorId: string, input: any, label: string): Promise<any[]> {
    const token = await this.getEffectiveToken();
    console.log(`[ApifyScraper] Iniciando actor "${actorId}" para [${label}]...`);

    const runRes = await fetch(`https://api.apify.com/v2/acts/${actorId}/runs?token=${token}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input)
    });

    const runJson: any = await runRes.json();
    if (!runJson.data || !runJson.data.id) {
      throw new Error(`Fallo al iniciar actor "${actorId}": ${JSON.stringify(runJson)}`);
    }

    const runId = runJson.data.id;
    const defaultDatasetId = runJson.data.defaultDatasetId;
    console.log(`[ApifyScraper] [${label}] Run activo (ID: ${runId}). Esperando finalización...`);

    const maxWaitMs = 180000; // 3 minutos max
    const startTime = Date.now();

    while (true) {
      if (Date.now() - startTime > maxWaitMs) {
        throw new Error(`[ApifyScraper] [${label}] Timeout esperando resultados del actor después de 3 minutos.`);
      }

      await new Promise((r) => setTimeout(r, 4000));
      const statusRes = await fetch(`https://api.apify.com/v2/actor-runs/${runId}?token=${token}`);
      const statusJson: any = await statusRes.json();
      const status = statusJson.data?.status;

      if (status === 'SUCCEEDED') {
        break;
      } else if (status === 'FAILED' || status === 'ABORTED' || status === 'TIMED-OUT') {
        throw new Error(`[ApifyScraper] [${label}] El run terminó en estado no exitoso: ${status}`);
      }
    }

    const datasetRes = await fetch(`https://api.apify.com/v2/datasets/${defaultDatasetId}/items?token=${token}`);
    const items = (await datasetRes.json()) as any[];
    console.log(`[ApifyScraper] [${label}] ${items.length} registros extraídos de Apify.`);
    return items;
  }

  // =========================================================================
  // 1. FUENTE GOOGLE MAPS (Negocios locales a pie de calle)
  // =========================================================================
  public static async scrapeGoogleMaps(req: ScrapeGoogleMapsRequest): Promise<ScrapedLead[]> {
    const location = req.location || 'Lima, Peru';
    const maxResults = req.maxResults || 15;

    const actorId = 'compass~crawler-google-places';
    const input = {
      searchStringsArray: [req.query],
      locationQuery: location,
      maxCrawledPlacesPerSearch: maxResults,
      language: 'es',
      countryCode: req.countryCode || 'pe',
      scrapeContacts: req.scrapeContacts !== false
    };

    const items = await this.runActorAndGetItems(actorId, input, `Google Maps: ${req.query}`);
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
        city: item.city || location,
        categoryName: item.categoryName,
        googleMapsUrl: item.url,
        source: 'google_maps',
        metadata: {
          reviewsCount: item.reviewsCount,
          rating: item.totalScore
        }
      });
    }

    console.log(`✅ [ApifyScraper] Google Maps completado: ${results.length} prospectos.`);
    return results;
  }

  // =========================================================================
  // 2. FUENTE META ADS LIBRARY (Empresas con Pauta Publicitaria Activa)
  // =========================================================================
  public static async scrapeMetaAds(req: ScrapeMetaAdsRequest): Promise<ScrapedLead[]> {
    const country = (req.countryCode || 'PE').toUpperCase();
    const maxResults = req.maxResults || 15;
    const encodedQuery = encodeURIComponent(req.query);

    const searchUrl = `https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=${country}&q=${encodedQuery}&search_type=keyword_unordered&media_type=all`;

    const actorId = 'curious_coder~facebook-ads-library-scraper';
    const input = {
      urls: [{ url: searchUrl }],
      count: maxResults,
      "scrapePageAds.activeStatus": "active",
      "scrapePageAds.countryCode": country,
      "scrapePageAds.sortBy": "impressions_desc"
    };

    const items = await this.runActorAndGetItems(actorId, input, `Meta Ads Library: ${req.query}`);
    const results: ScrapedLead[] = [];

    for (const item of items) {
      const adBody = item.bodyText || item.body || '';
      const adCaption = item.caption || '';
      const adTitle = item.title || '';
      const fullAdText = `${adTitle}\n${adBody}\n${adCaption}`;

      // Extraer teléfono directo del copy del anuncio o enlaces
      const extractedPhone = this.extractPhoneFromText(fullAdText);
      const pageName = item.pageName || item.advertiserName || item.title || 'Anunciante Meta';

      // Filtrar link de destino o web del anunciante
      const destinationLink = item.linkUrl || item.targetUrl || item.ctaLink || `https://www.facebook.com/${item.pageId || ''}`;

      results.push({
        title: pageName,
        phone: extractedPhone?.raw,
        phoneClean: extractedPhone?.clean,
        website: destinationLink,
        categoryName: `Meta Ads: ${req.query}`,
        source: 'meta_ads',
        adText: adBody.slice(0, 300),
        metadata: {
          adArchiveId: item.adArchiveId,
          pageId: item.pageId,
          publisherPlatforms: item.publisherPlatform,
          adStartDate: item.startDate
        }
      });
    }

    console.log(`✅ [ApifyScraper] Meta Ads Library completado: ${results.length} anuncios analizados.`);
    return results;
  }

  // =========================================================================
  // 3. FUENTE INSTAGRAM BUSINESS (Marcas, Clínicas, Estética y Creadores)
  // =========================================================================
  public static async scrapeInstagram(req: ScrapeInstagramRequest): Promise<ScrapedLead[]> {
    const maxResults = req.maxResults || 15;
    const actorId = 'apify~instagram-scraper';

    const input = {
      search: req.query,
      searchType: 'user',
      searchLimit: maxResults,
      resultsType: 'details',
      resultsLimit: maxResults
    };

    const items = await this.runActorAndGetItems(actorId, input, `Instagram: ${req.query}`);
    const results: ScrapedLead[] = [];

    for (const item of items) {
      const bio = item.biography || '';
      const businessPhone = item.businessPhoneNumber || item.contactPhoneNumber;

      // Buscar teléfono en campo de negocio o en biografía
      let phoneData = businessPhone ? { raw: businessPhone, clean: businessPhone.replace(/[^0-9]/g, '') } : null;
      if (!phoneData && bio) {
        phoneData = this.extractPhoneFromText(bio);
      }

      if (phoneData && phoneData.clean.length === 9 && phoneData.clean.startsWith('9')) {
        phoneData.clean = `51${phoneData.clean}`;
      }

      const title = item.fullName || item.username || 'Perfil Instagram';
      const web = item.externalUrl || `https://instagram.com/${item.username}`;

      results.push({
        title,
        phone: phoneData?.raw,
        phoneClean: phoneData?.clean,
        website: web,
        email: item.businessEmail || item.contactEmail,
        categoryName: `Instagram: ${req.query}`,
        source: 'instagram',
        metadata: {
          username: item.username,
          followersCount: item.followersCount,
          isBusinessAccount: item.isBusinessAccount,
          biography: bio.slice(0, 200)
        }
      });
    }

    console.log(`✅ [ApifyScraper] Instagram completado: ${results.length} perfiles comerciales extraídos.`);
    return results;
  }

  // =========================================================================
  // 4. FUENTE APOLLO / B2B LEADS (Decisores C-Level y Empresas B2B)
  // =========================================================================
  public static async scrapeApollo(req: ScrapeApolloRequest): Promise<ScrapedLead[]> {
    const maxResults = req.maxResults || 15;
    const country = req.countryCode || 'pe';

    const actorId = 'code_crafter~leads-finder';
    const input = {
      queries: [req.query],
      country: country,
      maxResults: maxResults
    };

    let items: any[] = [];
    try {
      items = await this.runActorAndGetItems(actorId, input, `Apollo / B2B Leads: ${req.query}`);
    } catch (err: any) {
      console.warn(`[ApifyScraper] Actor principal B2B no disponible (${err.message}), intentando fallback...`);
      items = await this.runActorAndGetItems('curious_coder~apollo-scraper', {
        queries: [req.query],
        maxResults
      }, `Apollo Fallback: ${req.query}`);
    }

    const results: ScrapedLead[] = [];

    for (const item of items) {
      const rawPhone = item.phone || item.directPhone || item.corporatePhone;
      let cleanPhone = rawPhone ? rawPhone.replace(/[^0-9]/g, '') : undefined;
      if (cleanPhone && cleanPhone.length === 9 && cleanPhone.startsWith('9')) {
        cleanPhone = `51${cleanPhone}`;
      }

      const company = item.companyName || item.organization || 'Empresa B2B';
      const contact = item.contactName || item.fullName || '';
      const title = contact ? `${company} - ${contact}` : company;

      results.push({
        title,
        phone: rawPhone,
        phoneClean: cleanPhone,
        website: item.website || item.companyWebsite,
        email: item.email || item.workEmail,
        categoryName: item.industry || `B2B: ${req.query}`,
        city: item.city || item.location,
        source: 'apollo_b2b',
        metadata: {
          contactName: item.contactName,
          jobTitle: item.jobTitle || item.title,
          companySize: item.companySize || item.employeesCount,
          linkedinUrl: item.linkedinUrl
        }
      });
    }

    console.log(`✅ [ApifyScraper] Apollo / B2B completado: ${results.length} decisores B2B obtenidos.`);
    return results;
  }

  // =========================================================================
  // 5. FUENTE GOOGLE SEARCH (Webs Corporativas y Teléfonos Públicos)
  // =========================================================================
  public static async scrapeGoogleSearch(req: ScrapeGoogleSearchRequest): Promise<ScrapedLead[]> {
    const maxResults = req.maxResults || 15;
    const country = req.countryCode || 'pe';
    const actorId = 'apify~google-search-scraper';

    const searchQuery = `${req.query} "whatsapp" OR "telefono" OR "+51 9"`;

    const input = {
      queries: searchQuery,
      maxPagesPerQuery: Math.max(1, Math.ceil(maxResults / 10)),
      countryCode: country,
      languageCode: 'es',
      resultsPerPage: 10
    };

    const items = await this.runActorAndGetItems(actorId, input, `Google Search: ${req.query}`);
    const results: ScrapedLead[] = [];

    for (const page of items) {
      const organic = page.organicResults || [];
      for (const item of organic) {
        const fullSnippet = `${item.title || ''}\n${item.description || ''}`;
        const phoneData = this.extractPhoneFromText(fullSnippet);

        results.push({
          title: item.title || 'Resultado Web',
          phone: phoneData?.raw,
          phoneClean: phoneData?.clean,
          website: item.url,
          categoryName: `Google Search: ${req.query}`,
          source: 'google_search',
          metadata: {
            description: item.description?.slice(0, 300),
            displayedUrl: item.displayedUrl
          }
        });
      }
    }

    console.log(`✅ [ApifyScraper] Google Search completado: ${results.length} resultados web procesados.`);
    return results;
  }

  // =========================================================================
  // 6. DISPACHADOR UNIFICADO MULTI-FUENTE
  // =========================================================================
  public static async scrapeMultiSource(req: UnifiedScrapeRequest): Promise<ScrapedLead[]> {
    switch (req.source) {
      case 'meta_ads':
        return this.scrapeMetaAds({
          query: req.query,
          countryCode: req.countryCode,
          maxResults: req.maxResults,
          serviceId: req.serviceId
        });

      case 'instagram':
        return this.scrapeInstagram({
          query: req.query,
          maxResults: req.maxResults,
          serviceId: req.serviceId
        });

      case 'apollo_b2b':
        return this.scrapeApollo({
          query: req.query,
          location: req.location,
          countryCode: req.countryCode,
          maxResults: req.maxResults,
          serviceId: req.serviceId
        });

      case 'google_search':
        return this.scrapeGoogleSearch({
          query: req.query,
          countryCode: req.countryCode,
          maxResults: req.maxResults,
          serviceId: req.serviceId
        });

      case 'google_maps':
      default:
        return this.scrapeGoogleMaps({
          query: req.query,
          location: req.location || 'Lima, Peru',
          countryCode: req.countryCode || 'pe',
          maxResults: req.maxResults,
          serviceId: req.serviceId
        });
    }
  }
}
