import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { NicheBlueprint } from '../types/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class BlueprintsManager {
  private static getBlueprintsDir(): string {
    const candidates = [
      path.resolve(__dirname, 'blueprints'),
      path.resolve(__dirname, '../../src/master/blueprints'),
      path.resolve(process.cwd(), 'src/master/blueprints'),
      path.resolve(process.cwd(), 'dist/master/blueprints')
    ];
    return candidates.find(d => fs.existsSync(d)) || candidates[0];
  }

  /**
   * Obtiene todos los blueprints de nichos disponibles
   */
  public static listBlueprints(): NicheBlueprint[] {
    const dir = this.getBlueprintsDir();
    if (!fs.existsSync(dir)) {
      return [];
    }

    const files = fs.readdirSync(dir).filter(f => f.endsWith('.json'));
    const blueprints: NicheBlueprint[] = [];

    for (const file of files) {
      try {
        const filePath = path.join(dir, file);
        const raw = fs.readFileSync(filePath, 'utf-8');
        const parsed = JSON.parse(raw);
        blueprints.push(parsed as NicheBlueprint);
      } catch (err: any) {
        console.warn(`⚠️ [BlueprintsManager] Error leyendo blueprint ${file}:`, err.message);
      }
    }

    return blueprints;
  }

  /**
   * Obtiene un blueprint específico por ID (ej. 'inmobiliarias', 'clinicas_salud')
   */
  public static getBlueprint(id: string): NicheBlueprint | null {
    const list = this.listBlueprints();
    return list.find(b => b.id.toLowerCase() === id.toLowerCase()) || null;
  }
}
