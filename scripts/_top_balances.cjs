const { Client } = require('pg');
(async () => {
  const c = new Client({
    host: 'aws-1-eu-north-1.pooler.supabase.com', port: 6543,
    user: 'postgres.hhrgcnvydmjqcevgmlhj', password: 'Jfs.samsung1989*',
    database: 'postgres', ssl: { rejectUnauthorized: false },
  });
  await c.connect();
  // check profiles columns for fxu balance
  const cols = await c.query(`
    SELECT column_name, data_type FROM information_schema.columns
     WHERE table_name='profiles' AND table_schema='public'
       AND (column_name ILIKE '%fxu%' OR column_name ILIKE '%usdt%' OR column_name ILIKE '%balance%' OR column_name ILIKE '%token%')
     ORDER BY column_name`);
  console.log('profiles balance columns:');
  for (const co of cols.rows) console.log(' ', co.column_name, co.data_type);

  // Top 20 FXU
  const fxu = await c.query(`
    SELECT email, username, fxu_balance
      FROM profiles
     WHERE fxu_balance IS NOT NULL AND fxu_balance > 0
     ORDER BY fxu_balance DESC
     LIMIT 20`);
  console.log('\n=== TOP 20 FXU balance ===');
  let i = 1;
  for (const row of fxu.rows) {
    console.log(`${String(i).padStart(3)} | ${String(row.fxu_balance).padStart(18)} | ${(row.username||'-').substring(0,20).padEnd(20)} | ${row.email}`);
    i++;
  }

  // Top 20 USDT
  const usdt = await c.query(`
    SELECT email, username, usdt_balance
      FROM profiles
     WHERE usdt_balance IS NOT NULL AND usdt_balance > 0
     ORDER BY usdt_balance DESC
     LIMIT 20`);
  console.log('\n=== TOP 20 USDT balance ===');
  i = 1;
  for (const row of usdt.rows) {
    console.log(`${String(i).padStart(3)} | ${String(row.usdt_balance).padStart(18)} | ${(row.username||'-').substring(0,20).padEnd(20)} | ${row.email}`);
    i++;
  }

  // Totals
  const t = await c.query(`SELECT SUM(fxu_balance)::numeric(20,4) AS tfxu, SUM(usdt_balance)::numeric(20,4) AS tusdt, COUNT(*) FILTER (WHERE fxu_balance>0) AS users_fxu, COUNT(*) FILTER (WHERE usdt_balance>0) AS users_usdt FROM profiles`);
  console.log('\nGLOBAL:', t.rows[0]);
  await c.end();
})();
