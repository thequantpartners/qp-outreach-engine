import dotenv from 'dotenv';
import { ColdEmailScheduler } from '../src/email/cold_email_scheduler.js';
import { OutreachRepo } from '../src/db/repo.js';

dotenv.config();

async function main() {
  console.log('--- Iniciando Cold Email Worker Local conectado a Railway Postgres ---');
  await OutreachRepo.init();
  ColdEmailScheduler.start();
  console.log('✅ Worker activo. Presiona Ctrl+C para detener.');
}

main().catch(console.error);
