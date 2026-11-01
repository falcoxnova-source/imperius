const { Client } = require('pg');
const client = new Client({
  host: 'aws-1-eu-north-1.pooler.supabase.com', port: 6543,
  user: 'postgres.hhrgcnvydmjqcevgmlhj', password: 'Jfs.samsung1989*',
  database: 'postgres', ssl: { rejectUnauthorized: false },
});

async function main() {
  await client.connect();

  console.log('\n=== 1) Pool actual en jackpot_pools ===');
  const pools = await client.query(`SELECT * FROM jackpot_pools WHERE id=1`);
  console.log(pools.rows[0]);

  console.log('\n=== 2) ¿Dónde se llama admin_update_jackpot_pools o distribuciones? Revisar por tipo de revenue ===');
  // Buscar funciones que agregan revenue
  const revFns = await client.query(`
    SELECT proname FROM pg_proc 
    WHERE prosrc ILIKE '%admin_update_jackpot_pools%' OR prosrc ILIKE '%jackpot_pools%SET%balance%'
    ORDER BY proname
  `);
  console.log('Funciones que modifican jackpot_pools:');
  revFns.rows.forEach(r => console.log('  -', r.proname));

  console.log('\n=== 3) Función accelerate_fleet + otras accelerate ===');
  const accel = await client.query(`
    SELECT proname FROM pg_proc 
    WHERE proname ILIKE '%accelerate%' OR proname ILIKE '%speedup%'
    ORDER BY proname
  `);
  console.log(accel.rows.map(r => r.proname).join(', '));

  console.log('\n=== 4) Fuente de accelerate_fleet (solo parte relevante a revenue/pool) ===');
  const src = await client.query(`SELECT prosrc FROM pg_proc WHERE proname='accelerate_fleet' LIMIT 1`);
  if (src.rows[0]) {
    const text = src.rows[0].prosrc;
    // mostrar líneas con jackpot, pool, revenue, admin
    const lines = text.split('\n');
    lines.forEach((l, i) => {
      if (/jackpot|pool|revenue|admin_wallet|fxu_balance|transaction|record_fxu/i.test(l)) {
        console.log(`  L${i+1}: ${l.trim()}`);
      }
    });
  }

  console.log('\n=== 5) admin_update_jackpot_pools: ver qué porcentajes reparte ===');
  const adminFn = await client.query(`SELECT prosrc FROM pg_proc WHERE proname='admin_update_jackpot_pools' LIMIT 1`);
  if (adminFn.rows[0]) console.log(adminFn.rows[0].prosrc);

  console.log('\n=== 6) Semana actual revenue por tipo desde fxu_transactions ===');
  // la imagen dice "Acelerar 265.247 / $26.52"
  const tx = await client.query(`
    SELECT transaction_type, COUNT(*) AS n, SUM(amount)::numeric AS total
    FROM fxu_transactions
    WHERE created_at >= date_trunc('week', now())
      AND amount < 0
    GROUP BY transaction_type
    ORDER BY total
  `);
  console.log(tx.rows);

  console.log('\n=== 7) Cambios en jackpot_pools esta semana ===');
  const poolHist = await client.query(`
    SELECT * FROM jackpot_pool_history
    WHERE created_at >= date_trunc('week', now())
    ORDER BY created_at DESC
    LIMIT 20
  `).catch(e => ({rows: [{err: e.message}]}));
  console.log(poolHist.rows);

  await client.end();
}

main().catch(e => { console.error('❌', e.message); process.exit(1); });
