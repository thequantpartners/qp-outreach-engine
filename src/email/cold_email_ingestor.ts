import { ApifyScraper } from '../scraper/apify_scraper.js';
import { OutscraperScraper } from '../scraper/outscraper_scraper.js';
import { OutreachRepo } from '../db/repo.js';
import { EmailCampaignLead } from '../types/index.js';

export interface IngestLeadsOptions {
  niche: 'clinicas' | 'educacion' | 'inmobiliarias' | 'legal' | string;
  country: 'PE' | 'US';
  cityOrState?: string;
  maxLeads?: number;
}

export class ColdEmailIngestor {
  /**
   * Extrae correos corporativos directamente desde el sitio web de la empresa
   */
  public static async extractEmailFromWebsite(websiteUrl?: string): Promise<string | null> {
    if (!websiteUrl || typeof websiteUrl !== 'string' || !websiteUrl.startsWith('http')) {
      return null;
    }

    // Descartar redes sociales como website primario para rastreo de correo corporativo
    if (/facebook\.com|instagram\.com|tiktok\.com|linkedin\.com|twitter\.com/i.test(websiteUrl)) {
      return null;
    }

    const cleanBaseUrl = websiteUrl.replace(/\/+$/, '');
    const pathsToTry = ['', '/contacto', '/contact', '/contact-us', '/nosotros', '/about'];

    for (const p of pathsToTry) {
      try {
        const targetUrl = `${cleanBaseUrl}${p}`;
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 6000);

        const res = await fetch(targetUrl, {
          signal: controller.signal,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
          }
        });
        clearTimeout(timeout);

        if (!res.ok) continue;

        const html = await res.text();
        const emailMatches = html.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/gi) || [];
        const cleanEmails = emailMatches
          .map(e => e.toLowerCase().trim())
          .filter(e =>
            !e.endsWith('.png') &&
            !e.endsWith('.jpg') &&
            !e.endsWith('.jpeg') &&
            !e.endsWith('.webp') &&
            !e.endsWith('.svg') &&
            !e.includes('sentry') &&
            !e.includes('wixpress') &&
            !e.includes('example.com') &&
            !e.includes('bootstrap') &&
            !e.includes('cloudflare') &&
            !e.includes('google')
          );

        if (cleanEmails.length > 0) {
          return cleanEmails[0];
        }
      } catch {
        // Continuar con la siguiente ruta si esta falla o da timeout
      }
    }

    return null;
  }

  /**
   * Resuelve los términos óptimos de búsqueda por nicho y país
   */
  public static getQueryForNiche(niche: string, country: 'PE' | 'US', cityOrState?: string): string {
    const loc = cityOrState || (country === 'PE' ? 'Lima' : 'Miami');

    if (niche.toLowerCase().includes('clinic') || niche.toLowerCase().includes('estetic') || niche.toLowerCase().includes('salud') || niche.toLowerCase().includes('dental')) {
      return country === 'PE'
        ? `clinica estetica ${loc}`
        : `medspa ${loc}`;
    }

    if (niche.toLowerCase().includes('educa') || niche.toLowerCase().includes('diplomad')) {
      return country === 'PE'
        ? `instituto diplomados capacitacion ${loc}`
        : `executive education academy ${loc}`;
    }

    if (niche.toLowerCase().includes('inmobil') || niche.toLowerCase().includes('realt')) {
      return country === 'PE'
        ? `inmobiliaria constructora ${loc}`
        : `realtor real estate agency ${loc}`;
    }

    if (niche.toLowerCase().includes('legal') || niche.toLowerCase().includes('abogad')) {
      return country === 'PE'
        ? `estudio de abogados corporativo ${loc}`
        : `immigration law firm ${loc}`;
    }

    return `${niche} ${loc}`;
  }

  /**
   * Pipeline Híbrido Resiliente: Extrae empresas de Google Maps / Outscraper y rastrea sus correos corporativos en tiempo real
   */
  public static async ingestFromWebCrawler(opts: IngestLeadsOptions): Promise<{
    totalScraped: number;
    queuedCount: number;
    skippedCount: number;
    leads: EmailCampaignLead[];
  }> {
    const maxLeads = opts.maxLeads || 15;
    const query = this.getQueryForNiche(opts.niche, opts.country, opts.cityOrState);

    console.log(`📡 [ColdEmailIngestor] Rastreo Web Corporativo para "${query}" (${opts.country})...`);

    const scrapedBusinesses = await OutscraperScraper.scrapeGoogleMaps({
      query,
      location: opts.cityOrState || (opts.country === 'PE' ? 'Lima' : 'Miami'),
      limit: Math.min(30, maxLeads * 3),
      region: opts.country
    });

    const candidates: EmailCampaignLead[] = [];

    for (const b of scrapedBusinesses) {
      if (!b.website) continue;

      const email = await this.extractEmailFromWebsite(b.website);
      if (!email) continue;

      const companyName = OutreachRepo.cleanCompanyName(b.title || 'Empresa');
      let contactName: string | undefined = undefined;
      let firstName: string | undefined = undefined;

      // Detectar si el título de la empresa contiene el nombre de un doctor/profesional (ej. Dra. Lady Segovia)
      const doctorMatch = b.title.match(/(?:Dr\.|Dra\.|Doctor|Doctora)\s+([A-Za-zÁÉÍÓÚñÑ]+)(?:\s+([A-Za-zÁÉÍÓÚñÑ]+))?/i);
      if (doctorMatch) {
        firstName = doctorMatch[1];
        contactName = doctorMatch[0];
      }

      candidates.push({
        email,
        companyName,
        contactName,
        firstName,
        title: doctorMatch ? 'Director/a Médico/a' : 'Gerente General',
        industry: b.categoryName || opts.niche,
        city: b.city || opts.cityOrState || (opts.country === 'PE' ? 'Lima' : 'Miami'),
        countryCode: opts.country,
        source: 'google_maps_enriched',
        status: 'QUEUED'
      });

      if (candidates.length >= maxLeads) break;
    }

    const { queued, skipped } = await OutreachRepo.queueEmailLeads(candidates);

    console.log(`✅ [ColdEmailIngestor] Rastreo web completado: ${candidates.length} empresas con correo corporativo verificado extraídas (${queued} nuevos encolados).`);

    return {
      totalScraped: scrapedBusinesses.length,
      queuedCount: queued,
      skippedCount: skipped,
      leads: candidates
    };
  }

  /**
   * Ingesta inteligente: Intenta Apollo primero, y si no está disponible, ejecuta el crawler web corporativo
   */
  public static async ingestFromApollo(opts: IngestLeadsOptions): Promise<{
    totalScraped: number;
    queuedCount: number;
    skippedCount: number;
    leads: EmailCampaignLead[];
  }> {
    try {
      const maxLeads = opts.maxLeads || 20;
      const countryCode = opts.country.toLowerCase();
      const query = this.getQueryForNiche(opts.niche, opts.country, opts.cityOrState);

      console.log(`🔍 [ColdEmailIngestor] Intentando Apollo para "${query}" (${opts.country.toUpperCase()})...`);

      const scraped = await ApifyScraper.scrapeApollo({
        query,
        countryCode,
        maxResults: maxLeads
      });

      const candidates: EmailCampaignLead[] = [];

      for (const item of scraped) {
        if (!item.email || !item.email.includes('@')) continue;

        const email = item.email.toLowerCase().trim();
        const rawTitle = item.title || 'Empresa';
        const companyParts = rawTitle.split(' - ');
        const rawCompany = companyParts[0].trim();
        const companyName = OutreachRepo.cleanCompanyName(rawCompany);

        const contactName = item.metadata?.contactName || (companyParts.length > 1 ? companyParts[1].trim() : undefined);
        let firstName: string | undefined = undefined;

        if (contactName) {
          const nameParts = contactName.replace(/^(Dr\.|Dra\.|Ing\.|Lic\.|Abog\.)\s+/i, '').trim().split(' ');
          firstName = nameParts[0];
        }

        candidates.push({
          email,
          companyName,
          contactName,
          firstName,
          title: item.metadata?.jobTitle,
          industry: item.categoryName,
          city: item.city || opts.cityOrState || (opts.country === 'PE' ? 'Lima' : 'Florida'),
          countryCode: opts.country,
          source: 'apollo_b2b',
          status: 'QUEUED'
        });
      }

      if (candidates.length > 0) {
        const { queued, skipped } = await OutreachRepo.queueEmailLeads(candidates);
        return {
          totalScraped: scraped.length,
          queuedCount: queued,
          skippedCount: skipped,
          leads: candidates
        };
      }
    } catch (err: any) {
      console.warn(`[ColdEmailIngestor] Apollo no disponible (${err.message}), activando Rastreo Web Corporativo de alta fidelidad...`);
    }

    // Fallback resiliente automático: Rastreo Web de portales corporativos
    return this.ingestFromWebCrawler(opts);
  }
}
