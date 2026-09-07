import dotenv from 'dotenv';
import pg from 'pg';
const { Client } = pg;

dotenv.config();

async function run() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  console.log('🧹 [Cleanup] Conectado a PostgreSQL en Railway...');
  const realPhones = ['51993346759']; // ROMAN MEDICAL SAC (@HUNAM75)

  const checkRes = await client.query('SELECT id, phone, company_name, status FROM leads');
  console.log(`Total prospectos encontrados: ${checkRes.rows.length}`);

  for (const lead of checkRes.rows) {
    if (!realPhones.includes(lead.phone)) {
      console.log(`🗑️ Eliminando lead dummy: ${lead.company_name} (${lead.phone})`);
      await client.query('DELETE FROM chat_messages WHERE lead_phone = $1', [lead.phone]);
      await client.query('DELETE FROM leads WHERE id = $1', [lead.id]);
    } else {
      console.log(`✅ CONSERVANDO REAL: ${lead.company_name} (${lead.phone}) - Estado: ${lead.status}`);
    }
  }

  const remaining = await client.query('SELECT phone, company_name, status, service_id FROM leads');
  console.log('\n📊 [Cleanup Finalizado] Leads reales en PostgreSQL:');
  console.table(remaining.rows);

  await client.end();
  process.exit(0);
}

run().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
