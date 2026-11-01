const { Client } = require('pg');
const c = new Client({ host: 'aws-1-eu-north-1.pooler.supabase.com', port: 6543, user: 'postgres.hhrgcnvydmjqcevgmlhj', password: 'Jfs.samsung1989*', database: 'postgres', ssl: { rejectUnauthorized: false } });

async function main() {
  await c.connect();
  const r = await c.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name='fleets' ORDER BY ordinal_position");
  r.rows.forEach(x => console.log(x.column_name, '|', x.data_type));
  await c.end();
}
main().catch(e => { console.error(e); process.exit(1); });
