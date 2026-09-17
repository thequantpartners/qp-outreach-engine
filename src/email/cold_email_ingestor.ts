import { ApifyScraper } from '../scraper/apify_scraper.js';
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
   * Resuelve los términos óptimos de búsqueda en Apollo por nicho y país
   */
  public static getQueryForNiche(niche: string, country: 'PE' | 'US', cityOrState?: string): string {
    const loc = cityOrState || (country === 'PE' ? 'Lima' : 'Miami');

    if (niche.toLowerCase().includes('clinic') || niche.toLowerCase().includes('estetic') || niche.toLowerCase().includes('salud')) {
      return country === 'PE'
        ? `clinica estetica ${loc}`
        : `medspa ${loc}`;
    }

    if (niche.toLowerCase().includes('educa') || niche.toLowerCase().includes('diplomad')) {
      return country === 'PE'
        ? `instituto diplomados ${loc}`
        : `executive education academy ${loc}`;
    }

    if (niche.toLowerCase().includes('inmobil') || niche.toLowerCase().includes('realt')) {
      return country === 'PE'
        ? `inmobiliaria ${loc}`
        : `realtor real estate ${loc}`;
    }

    if (niche.toLowerCase().includes('legal') || niche.toLowerCase().includes('abogad')) {
      return country === 'PE'
        ? `estudio de abogados ${loc}`
        : `immigration law firm ${loc}`;
    }

    return `${niche} ${loc}`;
  }

  /**
   * Extrae decisores desde Apollo, los limpia y los encola en la base de datos
   */
  public static async ingestFromApollo(opts: IngestLeadsOptions): Promise<{
    totalScraped: number;
    queuedCount: number;
    skippedCount: number;
    leads: EmailCampaignLead[];
  }> {
    const maxLeads = opts.maxLeads || 20;
    const countryCode = opts.country.toLowerCase();
    const query = this.getQueryForNiche(opts.niche, opts.country, opts.cityOrState);

    console.log(`🔍 [ColdEmailIngestor] Extrayendo decisores en Apollo para "${query}" (${opts.country.toUpperCase()})...`);

    const scraped = await ApifyScraper.scrapeApollo({
      query,
      countryCode,
      maxResults: maxLeads
    });

    const candidates: EmailCampaignLead[] = [];

    for (const item of scraped) {
      if (!item.email || !item.email.includes('@')) {
        continue; // Descartar si no tiene correo corporativo válido
      }

      const email = item.email.toLowerCase().trim();
      const rawTitle = item.title || 'Empresa';
      // Extraer nombre de la empresa limpio
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

    const { queued, skipped } = await OutreachRepo.queueEmailLeads(candidates);

    console.log(`✅ [ColdEmailIngestor] Ingesta completada: ${scraped.length} escaneados, ${queued} nuevos encolados (${skipped} omitidos/duplicados).`);

    return {
      totalScraped: scraped.length,
      queuedCount: queued,
      skippedCount: skipped,
      leads: candidates
    };
  }
}
