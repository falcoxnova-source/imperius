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

    // Step 1: Apply the full updated migration (column + both functions)
    const sql = fs.readFileSync(
      path.join(__dirname, '..', 'supabase', 'migrations', '20260415140000_fix_destruction_pool_distribution.sql'),
      'utf8'
    );
    await client.query(sql);
    console.log('✅ Migración completa aplicada (columna + get_destruction_ranking + admin_distribute)');

    // Step 2: Force the reset NOW since the distribution already happened with old code
    await client.query(`UPDATE jackpot_pools SET destruction_ranking_reset_at = NOW() WHERE id = 1`);
    console.log('✅ destruction_ranking_reset_at = NOW() — ranking reiniciado');

    // Step 3: Verify the column exists
    const colCheck = await client.query(`
      SELECT column_name FROM information_schema.columns 
      WHERE table_name = 'jackpot_pools' AND column_name = 'destruction_ranking_reset_at'
    `);
    console.log('✅ Columna destruction_ranking_reset_at:', colCheck.rows.length > 0 ? 'EXISTS' : 'MISSING');

    // Step 4: Verify get_destruction_ranking has the period filter
    const fnRank = await client.query(`SELECT prosrc FROM pg_proc WHERE proname = 'get_destruction_ranking'`);
    const rankBody = fnRank.rows[0]?.prosrc || '';
    console.log('✅ get_destruction_ranking tiene filtro de periodo:', rankBody.includes('v_reset_at') ? 'SÍ' : 'NO');

    // Step 5: Verify admin_distribute has the reset line
    const fnDist = await client.query(`SELECT prosrc FROM pg_proc WHERE proname = 'admin_distribute_destruction_pool'`);
    const distBody = fnDist.rows[0]?.prosrc || '';
    console.log('✅ admin_distribute tiene reset_at = NOW():', distBody.includes('destruction_ranking_reset_at') ? 'SÍ' : 'NO');

    // Step 6: Test that the ranking now returns 0 players (fresh period)
    const { rows: ranking } = await client.query(`SELECT * FROM get_destruction_ranking() LIMIT 5`);
    console.log(`\n🔍 Ranking destrucción después del reset: ${ranking.length} jugadores`);
    if (ranking.length === 0) {
      console.log('✅ PERFECTO — Ranking vacío, nuevo período comenzó');
    } else {
      for (const r of ranking) {
        console.log(`  ⚠️ ${r.username}: ${r.destruction_points} pts (batalla después del reset?)`);
      }
    }

    // Step 7: Show reset timestamp
    const { rows: jp } = await client.query(`SELECT destruction_ranking_reset_at, destruction_balance FROM jackpot_pools WHERE id = 1`);
    console.log(`\n📊 Estado actual:`);
    console.log(`  destruction_ranking_reset_at: ${jp[0]?.destruction_ranking_reset_at}`);
    console.log(`  destruction_balance: ${jp[0]?.destruction_balance}`);

  } catch (err) {
    console.error('❌ Error:', err.message);
  } finally {
    await client.end();
  }
}

main();
