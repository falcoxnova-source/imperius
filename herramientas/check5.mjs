import pg from 'pg';
const { Client } = pg;
const c = new Client({
  host: 'aws-1-eu-north-1.pooler.supabase.com', port: 6543, database: 'postgres',
  user: 'postgres.hhrgcnvydmjqcevgmlhj', password: 'Jfs.samsung1989*',
  ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 30000
});
await c.connect();

const cols = await c.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name='jackpot_pools' ORDER BY ordinal_position");
console.log('jackpot_pools cols:', cols.rows.map(r=>r.column_name+' '+r.data_type).join(', '));
const d = await c.query('SELECT * FROM jackpot_pools');
console.log('jackpot_pools:', JSON.stringify(d.rows, null, 2));

await c.end();
