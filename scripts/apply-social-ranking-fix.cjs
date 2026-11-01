const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

async function main() {
  const client = new Client({
    host: 'aws-1-eu-north-1.pooler.supabase.com',
    port: 6543,
    database: 'postgres',
    user: 'postgres.hhrgcnvydmjqcevgmlhj',
    password: 'Jfs.samsung1989*',
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();
    console.log('✅ Conectado');

    const sql = fs.readFileSync(
      path.join(__dirname, '..', 'supabase', 'migrations', '20260415130000_fix_social_ranking_pool_update.sql'),
      'utf8'
    );

    await client.query(sql);
    console.log('✅ Migración aplicada: fix social ranking pool UPDATE');

    // Verify function exists
    const res = await client.query(`
      SELECT routine_name 
      FROM information_schema.routines 
      WHERE routine_name = 'admin_distribute_social_ranking_pool'
    `);
    console.log('✅ Función verificada:', res.rows.length > 0 ? 'EXISTS' : 'MISSING');

    // Check the function body contains the fix
    const src = await client.query(`
      SELECT prosrc FROM pg_proc WHERE proname = 'admin_distribute_social_ranking_pool'
    `);
    const body = src.rows[0]?.prosrc || '';
    const hasFix = body.includes('WHERE id IS NOT NULL');
    console.log('✅ Fix aplicado (WHERE id IS NOT NULL):', hasFix ? 'SÍ' : 'NO');

  } catch (err) {
    console.error('❌ Error:', err.message);
  } finally {
    await client.end();
  }
}

main();
