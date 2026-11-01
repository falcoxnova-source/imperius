/*
  Aplica la migracion 20260427150000_blueprint_drop_global_cooldown.sql
  directo en la BD via pg.
*/

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

(async () => {
  const sql = fs.readFileSync(
    path.join(__dirname, '..', 'supabase', 'migrations', '20260427150000_blueprint_drop_global_cooldown.sql'),
    'utf8'
  );

  const c = new Client({
    host: 'aws-1-eu-north-1.pooler.supabase.com', port: 6543,
    user: 'postgres.hhrgcnvydmjqcevgmlhj', password: 'Jfs.samsung1989*',
    database: 'postgres', ssl: { rejectUnauthorized: false },
  });
  await c.connect();

  console.log('--- ANTES ---');
  console.table((await c.query("SELECT id, drop_chance FROM expedition_blueprint_drop_config WHERE id=1")).rows);
  try {
    console.table((await c.query("SELECT code, drop_cooldown_seconds, last_drop_at FROM ship_blueprints ORDER BY code")).rows);
  } catch (e) { console.log('(columnas aun no existen)'); }

  console.log('--- APLICANDO MIGRACION ---');
  await c.query(sql);
  console.log('OK');

  console.log('--- DESPUES ---');
  console.table((await c.query("SELECT id, drop_chance, is_enabled, updated_at FROM expedition_blueprint_drop_config WHERE id=1")).rows);
  console.table((await c.query("SELECT code, name, drop_cooldown_seconds, last_drop_at FROM ship_blueprints ORDER BY code")).rows);

  await c.end();
})().catch(e => { console.error(e); process.exit(1); });
