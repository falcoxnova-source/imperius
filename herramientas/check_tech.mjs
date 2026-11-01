import pg from 'pg';
const { Client } = pg;
const c = new Client({
  host: 'aws-1-eu-north-1.pooler.supabase.com', port: 6543, database: 'postgres',
  user: 'postgres.hhrgcnvydmjqcevgmlhj', password: 'Jfs.samsung1989*',
  ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 30000
});
await c.connect();

const r = await c.query(`
  SELECT ut.technology_type_id, tt.name, tt.code, ut.level
  FROM user_technologies ut
  JOIN technology_types tt ON tt.id = ut.technology_type_id
  WHERE ut.user_id = '9fa72d04-58e4-4297-bcc3-11b136b42493'
  AND ut.technology_type_id IN (4, 8)
`);
console.log(JSON.stringify(r.rows, null, 2));

await c.end();
