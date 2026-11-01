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
  .then(() => c.query(`
    UPDATE user_technologies SET level = 1
    WHERE user_id = '0387a0c4-f34d-47ce-acb8-359e906a9d34' AND technology_type_id = 15
    RETURNING user_id, technology_type_id, level
  `))
  .then(r => {
    console.log('Graviton actualizado a nivel 1:');
    console.table(r.rows);
    c.end();
  })
  .catch(e => { console.error('Error:', e.message); c.end(); });
