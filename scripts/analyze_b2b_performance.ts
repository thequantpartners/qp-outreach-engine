import dotenv from 'dotenv';
dotenv.config();
import { DbConnection } from '../src/db/connection.js';

async function analyze() {
  await DbConnection.init();
  const pool = DbConnection.getPool();

  console.log('=== 1. NICHOS Y CATEGORÍAS EXPLORADAS EN INFRAESTRUCTURA COMERCIAL PERÚ ===');
  const catRes = await pool.query(`
    SELECT category, status, count(*) as count
    FROM leads 
    WHERE service_id = 'infraestructura-comercial-peru'
    GROUP BY category, status
    ORDER BY category, count DESC
  `);
  console.table(catRes.rows);

  console.log('\n=== 2. TOTALES POR CATEGORÍA AGRUPADA ===');
  const catGroupRes = await pool.query(`
    SELECT 
      category,
      count(*) as total_leads,
      count(*) FILTER (WHERE status = 'OUTREACH_SENT') as sent,
      count(*) FILTER (WHERE status = 'REPLIED') as replied,
      count(*) FILTER (WHERE status = 'QUALIFIED') as qualified,
      count(*) FILTER (WHERE status = 'CLOSED_LOST') as lost,
      count(*) FILTER (WHERE status = 'HUMAN_TAKEOVER') as takeover,
      ROUND(count(*) FILTER (WHERE status IN ('REPLIED', 'QUALIFIED', 'HUMAN_TAKEOVER'))::numeric / NULLIF(count(*) FILTER (WHERE status != 'DISCOVERED' AND status != 'INVALID_PHONE'), 0) * 100, 1) as reply_rate_pct
    FROM leads
    WHERE service_id = 'infraestructura-comercial-peru'
    GROUP BY category
    ORDER BY total_leads DESC
    LIMIT 20
  `);
  console.table(catGroupRes.rows);

  console.log('\n=== 3. ÚLTIMOS 25 MENSAJES DE RESPUESTA DE PROSPECTOS (REPLIED / QUALIFIED) ===');
  const chatRes = await pool.query(`
    SELECT 
      l.company_name,
      l.category,
      l.status,
      cm.content as client_message,
      cm.created_at
    FROM chat_messages cm
    JOIN leads l ON l.phone = cm.lead_phone
    WHERE l.service_id = 'infraestructura-comercial-peru'
      AND cm.role = 'user'
      AND length(cm.content) > 3
    ORDER BY cm.created_at DESC
    LIMIT 30
  `);
  console.table(chatRes.rows);

  process.exit(0);
}

analyze().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
