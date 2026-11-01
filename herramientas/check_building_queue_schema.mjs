import pg from 'pg';
const { Client } = pg;
const c = new Client({
  host: 'aws-1-eu-north-1.pooler.supabase.com', port: 6543, database: 'postgres',
  user: 'postgres.hhrgcnvydmjqcevgmlhj', password: 'Jfs.samsung1989*',
  ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 30000
});
await c.connect();
const r = await c.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'building_queue' ORDER BY ordinal_position");
console.log('building_queue columns:');
for (const row of r.rows) {
  console.log(`  ${row.column_name} (${row.data_type})`);
}
await c.end();
