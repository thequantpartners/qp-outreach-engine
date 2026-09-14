// =================================================================
// THE QUANT PARTNERS · MASTER SCRAPER ROUTER
// Este router es de uso exclusivo para la Central Maestra de Kenneth.
// En los nodos de clientes (MODE=client) este router NUNCA se monta.
// =================================================================

import { Router, Request, Response } from 'express';
import { ApifyScraper } from './apify_scraper.js';
import { OutreachRepo } from '../db/repo.js';
import {
  ScrapeGoogleMapsSchema,
  ScrapeMetaAdsSchema,
  ScrapeInstagramSchema,
  ScrapeApolloSchema,
  ScrapeGoogleSearchSchema,
  UnifiedScrapeSchema
} from '../types/index.js';

export const scraperRouter = Router();

// 1. Google Maps Scraping
scraperRouter.post('/google-maps', async (req: Request, res: Response) => {
  const parseResult = ScrapeGoogleMapsSchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({ error: 'Parámetros de scraping inválidos', details: parseResult.error.format() });
    return;
  }

  try {
    const leads = await ApifyScraper.scrapeGoogleMaps(parseResult.data);
    if (parseResult.data.serviceId) {
      await OutreachRepo.saveLeadsFromScraper(parseResult.data.serviceId, leads);
    }
    res.json({
      success: true,
      query: parseResult.data.query,
      location: parseResult.data.location,
      totalFound: leads.length,
      leads
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Error ejecutando scraping en Apify', details: err.message });
  }
});

// 2. Meta Ads Library Scraping
scraperRouter.post('/meta-ads', async (req: Request, res: Response) => {
  const parseResult = ScrapeMetaAdsSchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({ error: 'Parámetros inválidos para Meta Ads', details: parseResult.error.format() });
    return;
  }

  try {
    const leads = await ApifyScraper.scrapeMetaAds(parseResult.data);
    if (parseResult.data.serviceId) {
      await OutreachRepo.saveLeadsFromScraper(parseResult.data.serviceId, leads);
    }
    res.json({
      success: true,
      source: 'meta_ads',
      query: parseResult.data.query,
      totalFound: leads.length,
      leads
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Error ejecutando scraping en Meta Ads', details: err.message });
  }
});

// 3. Instagram Business Scraping
scraperRouter.post('/instagram', async (req: Request, res: Response) => {
  const parseResult = ScrapeInstagramSchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({ error: 'Parámetros inválidos para Instagram', details: parseResult.error.format() });
    return;
  }

  try {
    const leads = await ApifyScraper.scrapeInstagram(parseResult.data);
    if (parseResult.data.serviceId) {
      await OutreachRepo.saveLeadsFromScraper(parseResult.data.serviceId, leads);
    }
    res.json({
      success: true,
      source: 'instagram',
      query: parseResult.data.query,
      totalFound: leads.length,
      leads
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Error ejecutando scraping en Instagram', details: err.message });
  }
});

// 4. Apollo / B2B Decisores Scraping
scraperRouter.post('/apollo', async (req: Request, res: Response) => {
  const parseResult = ScrapeApolloSchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({ error: 'Parámetros inválidos para Apollo', details: parseResult.error.format() });
    return;
  }

  try {
    const leads = await ApifyScraper.scrapeApollo(parseResult.data);
    if (parseResult.data.serviceId) {
      await OutreachRepo.saveLeadsFromScraper(parseResult.data.serviceId, leads);
    }
    res.json({
      success: true,
      source: 'apollo_b2b',
      query: parseResult.data.query,
      totalFound: leads.length,
      leads
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Error ejecutando scraping en Apollo B2B', details: err.message });
  }
});

// 5. Google Search Scraping
scraperRouter.post('/google-search', async (req: Request, res: Response) => {
  const parseResult = ScrapeGoogleSearchSchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({ error: 'Parámetros inválidos para Google Search', details: parseResult.error.format() });
    return;
  }

  try {
    const leads = await ApifyScraper.scrapeGoogleSearch(parseResult.data);
    if (parseResult.data.serviceId) {
      await OutreachRepo.saveLeadsFromScraper(parseResult.data.serviceId, leads);
    }
    res.json({
      success: true,
      source: 'google_search',
      query: parseResult.data.query,
      totalFound: leads.length,
      leads
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Error ejecutando scraping en Google Search', details: err.message });
  }
});

// 6. Scraping Multi-Fuente Unificado
scraperRouter.post('/multi', async (req: Request, res: Response) => {
  const parseResult = UnifiedScrapeSchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({ error: 'Parámetros inválidos para Scraping Multi-Fuente', details: parseResult.error.format() });
    return;
  }

  try {
    const leads = await ApifyScraper.scrapeMultiSource(parseResult.data);
    if (parseResult.data.serviceId) {
      await OutreachRepo.saveLeadsFromScraper(parseResult.data.serviceId, leads);
    }
    res.json({
      success: true,
      source: parseResult.data.source,
      query: parseResult.data.query,
      totalFound: leads.length,
      leads
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Error ejecutando scraping multi-fuente', details: err.message });
  }
});
