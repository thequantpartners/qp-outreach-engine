import pg from 'pg';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '../../');

// Cargar .env de la raíz del proyecto y luego del cwd si existe
dotenv.config({ path: path.resolve(projectRoot, '.env') });
dotenv.config();

const { Pool } = pg;

export class DbConnection {
  private static pool: pg.Pool | null = null;
  private static isConnectedToPg: boolean = false;

  public static get fallbackFilePath(): string {
    const rawDir = process.env.STORAGE_DIR || './storage';
    const resolvedDir = path.isAbsolute(rawDir) ? rawDir : path.resolve(projectRoot, rawDir);
    return path.resolve(resolvedDir, 'db_fallback.json');
  }

  public static async init(): Promise<void> {
    const databaseUrl = process.env.DATABASE_URL;

    if (databaseUrl) {
      try {
        console.log('[DbConnection] Conectando a PostgreSQL (Railway / Supabase)...');
        const isSslNeeded = databaseUrl.includes('supabase') || databaseUrl.includes('railway') || databaseUrl.includes('sslmode=require');
        
        DbConnection.pool = new Pool({
          connectionString: databaseUrl,
          ssl: isSslNeeded ? { rejectUnauthorized: false } : undefined,
          max: 10,
          idleTimeoutMillis: 30000
        });

        // Test connection
        const client = await DbConnection.pool.connect();
        await client.query('SELECT 1');
        client.release();

        DbConnection.isConnectedToPg = true;
        console.log('✅ [DbConnection] Conectado exitosamente a PostgreSQL!');
        return;
      } catch (err: any) {
        console.warn('⚠️ [DbConnection] No se pudo conectar a PostgreSQL. Activando fallback local en JSON:', err.message);
      }
    } else {
      console.log('ℹ️ [DbConnection] DATABASE_URL no definida. Usando almacenamiento persistente local en:', DbConnection.fallbackFilePath);
    }

    DbConnection.initFallbackFile();
  }

  private static initFallbackFile(): void {
    const dir = path.dirname(DbConnection.fallbackFilePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    if (!fs.existsSync(DbConnection.fallbackFilePath)) {
      const initialData = {
        services: [],
        leads: [],
        messages: [],
        settings: {
          dailyLimit: 35,
          minDelaySeconds: 180,
          maxDelaySeconds: 300,
          startHour: 9,
          endHour: 19,
          adminWhatsAppPhone: process.env.ADMIN_WHATSAPP_PHONE || '',
          webhookUrl: process.env.WEBHOOK_URL || '',
          isAutonomousActive: true
        }
      };
      fs.writeFileSync(DbConnection.fallbackFilePath, JSON.stringify(initialData, null, 2), 'utf-8');
    }
  }

  public static isPg(): boolean {
    return DbConnection.isConnectedToPg;
  }

  public static getPool(): pg.Pool {
    if (!DbConnection.pool || !DbConnection.isConnectedToPg) {
      throw new Error('PostgreSQL Pool no está disponible');
    }
    return DbConnection.pool;
  }

  public static getFallbackData(): any {
    try {
      if (!fs.existsSync(DbConnection.fallbackFilePath)) {
        DbConnection.initFallbackFile();
      }
      const raw = fs.readFileSync(DbConnection.fallbackFilePath, 'utf-8');
      return JSON.parse(raw);
    } catch {
      return { services: [], leads: [], messages: [], settings: {} };
    }
  }

  public static saveFallbackData(data: any): void {
    try {
      fs.writeFileSync(DbConnection.fallbackFilePath, JSON.stringify(data, null, 2), 'utf-8');
    } catch (err: any) {
      console.error('[DbConnection] Error guardando fallback local:', err.message);
    }
  }
}
