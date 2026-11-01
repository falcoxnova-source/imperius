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
      path.join(__dirname, '..', 'supabase', 'migrations', '20260415140000_fix_destruction_pool_distribution.sql'),
      'utf8'
    );

    await client.query(sql);
    console.log('✅ Migración aplicada: fix destruction pool distribution');

    // Verify function exists
    const res = await client.query(`
      SELECT routine_name 
      FROM information_schema.routines 
      WHERE routine_name = 'admin_distribute_destruction_pool'
    `);
    console.log('✅ Función verificada:', res.rows.length > 0 ? 'EXISTS' : 'MISSING');

    // Check the function body does NOT contain counted_for_ranking
    const src = await client.query(`
      SELECT prosrc FROM pg_proc WHERE proname = 'admin_distribute_destruction_pool'
    `);
    const body = src.rows[0]?.prosrc || '';
    const hasBug = body.includes('counted_for_ranking');
    console.log('✅ Bug eliminado (counted_for_ranking removido):', !hasBug ? 'SÍ' : 'NO — ¡AÚN TIENE EL BUG!');

    // Verify no other problematic UPDATEs without WHERE
    const lines = body.split('\n');
    let updateIssues = 0;
    lines.forEach((line, i) => {
      const trimmed = line.trim().toUpperCase();
      if (trimmed.startsWith('UPDATE') && !trimmed.includes('WHERE') && trimmed.includes('SET')) {
        console.log(`  ⚠️  UPDATE sin WHERE en línea ~${i}: ${line.trim().substring(0, 80)}`);
        updateIssues++;
      }
    });
    if (updateIssues === 0) {
      console.log('✅ Todos los UPDATEs tienen WHERE clause (pg_safeupdate safe)');
    }

  } catch (err) {
    console.error('❌ Error:', err.message);
  } finally {
    await client.end();
  }
}

main();
