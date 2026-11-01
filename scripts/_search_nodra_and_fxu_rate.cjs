const { Client } = require('pg');
const c = new Client({
  host: 'aws-1-eu-north-1.pooler.supabase.com', port: 6543,
  user: 'postgres.hhrgcnvydmjqcevgmlhj', password: 'Jfs.samsung1989*',
  database: 'postgres', ssl: { rejectUnauthorized: false },
});
(async () => {
  await c.connect();
  // Search for "nodra" / "nodriza" / "mother"
  const r = await c.query(`
    SELECT code, name, category, weapon_power, structural_integrity
    FROM ship_types
    WHERE LOWER(code) LIKE '%nodr%'
       OR LOWER(name) LIKE '%nodr%'
       OR LOWER(code) LIKE '%mother%'
       OR LOWER(name) LIKE '%mother%'
       OR LOWER(code) LIKE '%destr%'
       OR LOWER(name) LIKE '%destr%'
       OR LOWER(code) LIKE '%mass%'
       OR LOWER(name) LIKE '%masiv%'
  `);
  console.log('=== Coincidencias Nodra / Destr / Masiva ===');
  console.table(r.rows);

  // FXU/USD config
  const cfgTables = await c.query(`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public' AND (
      table_name ILIKE '%fxu%' OR table_name ILIKE '%price%' OR table_name ILIKE '%credit%'
    )
    ORDER BY table_name
  `);
  console.log('=== Tablas relacionadas con FXU/precio ===');
  console.table(cfgTables.rows);

  await c.end();
})().catch(e => { console.error(e); process.exit(1); });
