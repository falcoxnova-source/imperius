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

  // 1. Check jackpot_pools columns
  const cols = await c.query(`SELECT column_name, data_type FROM information_schema.columns WHERE table_name='jackpot_pools' ORDER BY ordinal_position`);
  console.log('=== jackpot_pools columns ===');
  cols.rows.forEach(x => console.log(`  ${x.column_name} (${x.data_type})`));

  // 2. Check current get_destruction_ranking filter
  const fn = await c.query(`SELECT prosrc FROM pg_proc WHERE proname = 'get_destruction_ranking'`);
  const body = fn.rows[0]?.prosrc || '';
  const hasResetFilter = body.includes('reset_at') || body.includes('created_at >=');
  console.log('\n=== get_destruction_ranking ===');
  console.log('Has period filter:', hasResetFilter ? 'YES' : 'NO (processes ALL reports)');

  // Find the FROM battle_reports line
  const brLine = body.split('\n').find(l => l.includes('FROM battle_reports'));
  console.log('Query line:', brLine?.trim());

  // 3. Check RankingPage.tsx usage
  console.log('\n=== Frontend usage ===');
  console.log('RankingPage calls get_destruction_ranking() via RPC');

  await c.end();
}

main().catch(e => console.error(e));
