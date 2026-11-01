const { Client } = require('pg');
const c = new Client({
  host: 'aws-1-eu-north-1.pooler.supabase.com',
  port: 6543,
  database: 'postgres',
  user: 'postgres.hhrgcnvydmjqcevgmlhj',
  password: 'Jfs.samsung1989*',
  ssl: { rejectUnauthorized: false }
});

c.connect()
  .then(() => c.query("UPDATE user_technologies SET level = 0 WHERE user_id = '9700c4e0-d0e4-4efa-baf7-e9cb97945b16' AND technology_type_id = 15 RETURNING *"))
  .then(r => {
    console.log('Graviton bajado a nivel 0:', r.rowCount, 'fila(s)');
    c.end();
  })
  .catch(e => { console.error(e.message); c.end(); });
