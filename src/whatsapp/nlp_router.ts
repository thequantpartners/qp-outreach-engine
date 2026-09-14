/**
 * Enrutador de Lenguaje Natural para Hermes C2
 * Interpreta intenciones de Kenneth y de clientes cuando escriben en lenguaje natural
 * sin necesidad de escribir comandos con barra diagonal (/).
 */
export interface IntentMatch {
  command: string;
  args: string[];
}

export class NLPRouter {
  /**
   * Normaliza texto para análisis (minúsculas, sin tildes, sin signos puntuación extremos)
   */
  public static normalize(text: string): string {
    return (text || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[¿?¡!.,;:_()\-]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Analiza un mensaje entrante y resuelve si corresponde a un comando de Hermes
   */
  public static resolveIntent(rawText: string): IntentMatch | null {
    if (!rawText) return null;
    const clean = this.normalize(rawText);

    // 1. Estado / Cómo vamos
    if (
      clean === 'como vamos' ||
      clean === 'como va todo' ||
      clean === 'como va' ||
      clean === 'estado' ||
      clean === 'status' ||
      clean === 'reporte' ||
      clean === 'metricas' ||
      clean === 'dashboard' ||
      clean.startsWith('dame el reporte') ||
      clean.startsWith('dame el estado')
    ) {
      return { command: 'status', args: [] };
    }

    // 2. Saldo / Créditos (Master)
    if (
      clean === 'saldo' ||
      clean === 'creditos' ||
      clean === 'balance' ||
      clean === 'cuanto queda' ||
      clean === 'cuanto saldo queda' ||
      clean === 'cuanto saldo tenemos' ||
      clean === 'consumo' ||
      clean.includes('cuanto saldo') ||
      clean.includes('cuantos creditos')
    ) {
      return { command: 'saldo', args: [] };
    }

    // 3. Pipeline / Embudo
    if (
      clean === 'pipeline' ||
      clean === 'embudo' ||
      clean === 'etapas' ||
      clean.startsWith('ver pipeline') ||
      clean.startsWith('ver embudo')
    ) {
      return { command: 'pipeline', args: [] };
    }

    // 4. Leads / Prospectos
    if (
      clean === 'leads' ||
      clean === 'prospectos' ||
      clean === 'contactos' ||
      clean === 'mis prospectos' ||
      clean === 'ver prospectos' ||
      clean === 'ver leads' ||
      clean.startsWith('dame los prospectos') ||
      clean.startsWith('dame los leads')
    ) {
      return { command: 'leads', args: [] };
    }

    // 5. Equipo de ventas
    if (
      clean === 'equipo' ||
      clean === 'vendedores' ||
      clean === 'asesores' ||
      clean === 'mis vendedores' ||
      clean === 'ver equipo'
    ) {
      return { command: 'equipo', args: [] };
    }

    // 6. Pausar / Detener motor
    if (
      clean === 'pausa' ||
      clean === 'pausar' ||
      clean === 'detener' ||
      clean === 'detente' ||
      clean === 'stop' ||
      clean === 'para el bot' ||
      clean === 'pausar prospeccion'
    ) {
      return { command: 'pausar', args: [] };
    }

    // 7. Reanudar motor
    if (
      clean === 'reanudar' ||
      clean === 'reanuda' ||
      clean.startsWith('reanuda') ||
      clean.startsWith('reanudar') ||
      clean === 'continua' ||
      clean === 'continuar' ||
      clean.startsWith('continua') ||
      clean.startsWith('continuar') ||
      clean === 'seguir' ||
      clean.startsWith('sigue') ||
      clean === 'start' ||
      clean === 'arrancar' ||
      clean.includes('iniciar prospeccion')
    ) {
      return { command: 'reanudar', args: [] };
    }

    // 8. Alertas (Mutear / Desmutear)
    if (
      clean === 'silenciar alertas' ||
      clean === 'mutear alertas' ||
      clean === 'apagar alertas' ||
      clean === 'quitar alertas' ||
      clean === 'alertas off'
    ) {
      return { command: 'alertas', args: ['off'] };
    }
    if (
      clean === 'activar alertas' ||
      clean === 'desmutear alertas' ||
      clean === 'encender alertas' ||
      clean === 'poner alertas' ||
      clean === 'alertas on'
    ) {
      return { command: 'alertas', args: ['on'] };
    }

    // 9. Scraping con Outscraper: "raspar X", "busca X en maps", "scrape X"
    const scrapeMatch = clean.match(/^(?:raspar|raspa|scrapear|scrapea|scrape|buscar|busca|extraer|extrae)\s+(.+)$/i);
    if (scrapeMatch && scrapeMatch[1]) {
      const queryPart = scrapeMatch[1].trim();
      // Si incluye cantidad al final ej: "dentistas surco 30"
      const parts = queryPart.split(' ');
      const last = parts[parts.length - 1];
      if (/^\d+$/.test(last)) {
        const count = last;
        const q = parts.slice(0, -1).join(' ');
        return { command: 'scrape', args: [q, count] };
      }
      return { command: 'scrape', args: [queryPart] };
    }

    // 10. Ayuda / Comandos
    if (
      clean === 'ayuda' ||
      clean === 'comandos' ||
      clean === 'menu' ||
      clean === 'opciones' ||
      clean.includes('ayuda') ||
      clean.includes('comando') ||
      clean.includes('menu') ||
      clean.includes('que puedes hacer') ||
      clean.startsWith('como te uso')
    ) {
      return { command: 'comandos', args: [] };
    }

    return null;
  }
}
