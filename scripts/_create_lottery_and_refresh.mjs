import { Client } from 'pg';
const c = new Client({
  host: 'aws-1-eu-north-1.pooler.supabase.com',
  port: 6543,
  user: 'postgres.hhrgcnvydmjqcevgmlhj',
  password: 'Jfs.samsung1989*',
  database: 'postgres',
  ssl: { rejectUnauthorized: false }
});
await c.connect();

// Forzar refresh del cache de PostgREST
console.log('NOTIFY pgrst reload schema...');
await c.query("NOTIFY pgrst, 'reload schema'");
await c.query("NOTIFY pgrst, 'reload config'");

// Test as authenticated with same timeout
await c.query('SET ROLE authenticated');
await c.query("SET statement_timeout = '8s'");
const t0 = Date.now();
try {
  const r = await c.query('SELECT * FROM get_destruction_ranking()');
  console.log(`OK authenticated: ${r.rows.length} rows en ${Date.now()-t0}ms`);
} catch (e) {
  console.log(`ERROR authenticated en ${Date.now()-t0}ms:`, e.message);
}
await c.query('RESET ROLE');

// Crear un nuevo draw de loteria que cierre el dia 17 (en 7 dias)
console.log('\nCreando nuevo draw de loteria...');
const closes = new Date();
closes.setUTCDate(closes.getUTCDate() + 7);
closes.setUTCHours(20, 0, 0, 0); // 20:00 UTC
try {
  const r = await c.query('SELECT create_lottery_draw($1) AS result', [closes.toISOString()]);
  console.log('Resultado:', JSON.stringify(r.rows[0]));
} catch (e) {
  console.log('ERROR create_lottery_draw:', e.message);
}

// Verificar
console.log('\nVerificando estado final...');
const info = await c.query('SELECT get_lottery_info()');
console.log(JSON.stringify(info.rows[0].get_lottery_info, null, 2));

await c.end();
