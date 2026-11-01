const { Client } = require('pg');

async function main() {
  const c = new Client({
    host: 'aws-1-eu-north-1.pooler.supabase.com',
    port: 6543,
    database: 'postgres',
    user: 'postgres.hhrgcnvydmjqcevgmlhj',
    password: 'Jfs.samsung1989*',
    ssl: { rejectUnauthorized: false }
  });

  await c.connect();
  console.log('=== VERIFICACIÓN COMPLETA ===\n');

  // 1. Check column exists
  const cols = await c.query(`
    SELECT column_name, data_type 
    FROM information_schema.columns 
    WHERE table_name='jackpot_pools' AND column_name='destruction_ranking_reset_at'
  `);
  console.log('1. Columna destruction_ranking_reset_at:', cols.rows.length > 0 ? '✅ EXISTS' : '❌ MISSING');

  // 2. Check current value
  const val = await c.query(`SELECT destruction_ranking_reset_at FROM jackpot_pools WHERE id = 1`);
  console.log('   Valor actual:', val.rows[0]?.destruction_ranking_reset_at || 'NULL (cuenta todo desde inicio)');

  // 3. Check get_destruction_ranking has reset_at filter
  const fn1 = await c.query(`SELECT prosrc FROM pg_proc WHERE proname = 'get_destruction_ranking'`);
  const body1 = fn1.rows[0]?.prosrc || '';
  const hasFilter = body1.includes('destruction_ranking_reset_at') && body1.includes('created_at >= v_reset_at');
  console.log('\n2. get_destruction_ranking() tiene filtro por período:', hasFilter ? '✅ SÍ' : '❌ NO');

  // 4. Check admin_distribute has reset update
  const fn2 = await c.query(`SELECT prosrc FROM pg_proc WHERE proname = 'admin_distribute_destruction_pool'`);
  const body2 = fn2.rows[0]?.prosrc || '';
  const hasReset = body2.includes('destruction_ranking_reset_at = NOW()');
  const hasBug = body2.includes('counted_for_ranking');
  console.log('3. admin_distribute_destruction_pool():');
  console.log('   - Setea reset_at = NOW():', hasReset ? '✅ SÍ' : '❌ NO');
  console.log('   - Bug counted_for_ranking:', hasBug ? '❌ AÚN EXISTE' : '✅ ELIMINADO');

  // 5. Test get_destruction_ranking works
  console.log('\n4. Test get_destruction_ranking():');
  const test = await c.query(`SELECT * FROM get_destruction_ranking() LIMIT 5`);
  console.log(`   Encontrados: ${test.rows.length} jugadores`);
  test.rows.forEach(r => {
    console.log(`   ${r.username}: ${r.destruction_points} pts (atk: ${r.attacker_points}, def: ${r.defender_points})`);
  });

  // 6. Check no UPDATE without WHERE in either function
  console.log('\n5. Verificación pg_safeupdate:');
  [['get_destruction_ranking', body1], ['admin_distribute_destruction_pool', body2]].forEach(([name, body]) => {
    const lines = body.split('\n').filter(l => !l.trim().startsWith('--'));
    const bad = lines.filter(l => {
      const t = l.trim().toUpperCase();
      return t.startsWith('UPDATE') && t.includes('SET') && !t.includes('WHERE');
    });
    if (bad.length > 0) {
      console.log(`   ❌ ${name}: ${bad.length} UPDATEs sin WHERE`);
      bad.forEach(l => console.log(`      → ${l.trim()}`));
    } else {
      console.log(`   ✅ ${name}: todos los UPDATEs tienen WHERE`);
    }
  });

  await c.end();
}

main().catch(e => console.error(e));
