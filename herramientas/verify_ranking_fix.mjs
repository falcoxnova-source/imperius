import pg from 'pg';
const { Client } = pg;
const c = new Client({
  host: 'aws-1-eu-north-1.pooler.supabase.com', port: 6543, database: 'postgres',
  user: 'postgres.hhrgcnvydmjqcevgmlhj', password: 'Jfs.samsung1989*',
  ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 30000
});
await c.connect();
const r = await c.query("SELECT prosrc FROM pg_proc WHERE proname = 'get_destruction_ranking'");
const src = r.rows[0].prosrc;
const defCount = (src.match(/\/ 1000/g) || []).length;
if (defCount >= 2) {
  console.log('OK - / 1000 encontrado ' + defCount + ' veces (defender_fleet_loss y attacker_fleet_loss)');
} else {
  console.log('ERROR - Se esperaban 2 ocurrencias de / 1000, se encontraron ' + defCount);
}
await c.end();
