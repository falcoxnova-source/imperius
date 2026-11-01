import pg from 'pg';
const { Client } = pg;
const c = new Client({
  host: 'aws-1-eu-north-1.pooler.supabase.com', port: 6543, database: 'postgres',
  user: 'postgres.hhrgcnvydmjqcevgmlhj', password: 'Jfs.samsung1989*',
  ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 30000
});
await c.connect();
const r = await c.query("SELECT prosrc FROM pg_proc WHERE proname = 'generate_espionage_report'");
const src = r.rows[0].prosrc;
if (src.includes('calculate_and_sync_resources_internal')) {
  console.log('OK - La funcion contiene calculate_and_sync_resources_internal');
} else {
  console.log('ERROR - No se encontro la llamada a sync resources');
}
if (src.includes('FOR UPDATE')) {
  console.log('OK - Tambien tiene FOR UPDATE (race condition protection)');
}
await c.end();
