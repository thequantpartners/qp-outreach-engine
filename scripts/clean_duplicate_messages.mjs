import dotenv from 'dotenv';
import pg from 'pg';
const { Client } = pg;

dotenv.config();

async function run() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  console.log('🧹 [Deduplication] Conectado a PostgreSQL...');

  // Eliminar duplicados en chat_messages manteniendo el menor id
  const deleteRes = await client.query(`
    DELETE FROM chat_messages a
    USING chat_messages b
    WHERE a.id > b.id
      AND a.lead_phone = b.lead_phone
      AND a.role = b.role
      AND a.content = b.content;
  `);

  console.log(`✅ Registros duplicados eliminados: ${deleteRes.rowCount}`);

  const remaining = await client.query(`
    SELECT id, lead_phone, role, SUBSTRING(content, 1, 50) as snippet, created_at
    FROM chat_messages
    ORDER BY id ASC;
  `);

  console.log('\n📊 Mensajes vigentes en PostgreSQL:');
  console.table(remaining.rows);

  await client.end();
  process.exit(0);
}

run().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
