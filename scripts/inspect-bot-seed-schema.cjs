const { Client } = require('pg');

const client = new Client({
  host: 'aws-1-eu-north-1.pooler.supabase.com',
  port: 6543,
  user: 'postgres.hhrgcnvydmjqcevgmlhj',
  password: 'Jfs.samsung1989*',
  database: 'postgres',
  ssl: { rejectUnauthorized: false }
});

const tables = [
  { schema: 'auth', name: 'users' },
  { schema: 'public', name: 'profiles' },
  { schema: 'public', name: 'planets' },
  { schema: 'public', name: 'planet_resources' },
  { schema: 'public', name: 'planet_buildings' },
  { schema: 'public', name: 'user_technologies' },
  { schema: 'public', name: 'planet_ships' },
  { schema: 'public', name: 'planet_defenses' }
];

(async () => {
  await client.connect();
  for (const t of tables) {
    console.log(`\n=== ${t.schema}.${t.name} ===`);
    const q = await client.query(
      `SELECT column_name, data_type, is_nullable, column_default
       FROM information_schema.columns
       WHERE table_schema = $1 AND table_name = $2
       ORDER BY ordinal_position`,
      [t.schema, t.name]
    );
    for (const r of q.rows) {
      console.log(`${r.column_name} | ${r.data_type} | null=${r.is_nullable} | default=${r.column_default || 'none'}`);
    }
  }
  await client.end();
})();
