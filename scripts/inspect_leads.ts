import dotenv from 'dotenv';
dotenv.config();
import { OutreachRepo } from '../src/db/repo.js';
import { DbConnection } from '../src/db/connection.js';

async function inspect() {
  await OutreachRepo.init();
  const pool = DbConnection.getPool();

  console.log('\n=== SERVICIOS REGISTRADOS ===');
  const servicesRes = await pool.query('SELECT id, is_active, name FROM services');
  console.table(servicesRes.rows);

  console.log('\n=== RECUENTO DE LEADS POR SERVICIO Y ESTADO ===');
  const leadsRes = await pool.query(`
    SELECT service_id, status, count(*) as total 
    FROM leads 
    GROUP BY service_id, status 
    ORDER BY service_id, status
  `);
  console.table(leadsRes.rows);

  console.log('\n=== MUESTRA DE ÚLTIMOS 10 LEADS ===');
  const sampleRes = await pool.query(`
    SELECT id, service_id, company_name, phone, status, category, address, created_at 
    FROM leads 
    ORDER BY id DESC 
    LIMIT 10
  `);
  console.table(sampleRes.rows);

  process.exit(0);
}

inspect().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
