const { Client } = require('pg');
const client = new Client({
  host: 'aws-1-eu-north-1.pooler.supabase.com', port: 6543,
  user: 'postgres.hhrgcnvydmjqcevgmlhj', password: 'Jfs.samsung1989*',
  database: 'postgres', ssl: { rejectUnauthorized: false },
});

async function main() {
  await client.connect();

  console.log('\n=== 1) contribute_to_jackpot (distribución a los 4 pools) ===');
  const c = await client.query(`SELECT prosrc FROM pg_proc WHERE proname='contribute_to_jackpot' LIMIT 1`);
  console.log(c.rows[0]?.prosrc);

  console.log('\n=== 2) game_settings pool percentages ===');
  const gs = await client.query(`SELECT key, value FROM game_settings WHERE key ILIKE '%jackpot%' OR key ILIKE '%pool%' OR key ILIKE '%acceleration%' ORDER BY key`);
  console.log(gs.rows);

  console.log('\n=== 3) Revenue semanal tabla admin_revenue por tipo ===');
  const rev = await client.query(`
    SELECT revenue_type, COUNT(*) AS n, SUM(amount)::numeric AS total_fxu
    FROM admin_revenue
    WHERE created_at >= date_trunc('week', now())
    GROUP BY revenue_type
    ORDER BY total_fxu DESC
  `);
  console.log(rev.rows);

  console.log('\n=== 4) Total admin_revenue y total contribuido al jackpot esta semana ===');
  const poolContrib = await client.query(`
    SELECT source, COUNT(*) AS n, SUM(amount)::numeric AS total_fxu
    FROM jackpot_contributions
    WHERE created_at >= date_trunc('week', now())
    GROUP BY source
    ORDER BY total_fxu DESC
  `).catch(e => ({rows: [{err: e.message}]}));
  console.log(poolContrib.rows);

  console.log('\n=== 5) Verificar si existe jackpot_contributions ===');
  const tbls = await client.query(`
    SELECT table_name FROM information_schema.tables 
    WHERE table_schema='public' AND (table_name ILIKE '%jackpot%' OR table_name ILIKE '%contribution%' OR table_name ILIKE '%revenue%')
    ORDER BY table_name
  `);
  console.log(tbls.rows.map(r => r.table_name));

  console.log('\n=== 6) Muestra de admin_revenue fleet_acceleration ===');
  const fa = await client.query(`
    SELECT amount, description, created_at FROM admin_revenue
    WHERE revenue_type='fleet_acceleration'
      AND created_at >= date_trunc('week', now())
    ORDER BY created_at DESC LIMIT 10
  `);
  console.log(fa.rows);

  await client.end();
}

main().catch(e => { console.error('❌', e.message); process.exit(1); });
