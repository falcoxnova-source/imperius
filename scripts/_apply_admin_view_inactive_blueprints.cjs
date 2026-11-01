const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

const SQL_FILE = path.join(__dirname, '..', 'supabase', 'migrations', '20260427190000_admin_can_view_inactive_blueprints.sql');

const c = new Client({
  host: 'aws-1-eu-north-1.pooler.supabase.com', port: 6543,
  user: 'postgres.hhrgcnvydmjqcevgmlhj', password: 'Jfs.samsung1989*',
  database: 'postgres', ssl: { rejectUnauthorized: false },
});
(async () => {
  await c.connect();
  await c.query(fs.readFileSync(SQL_FILE, 'utf8'));
  console.log('✅ Migration aplicada');

  // Verificar
  const r = await c.query(`
    SELECT polname FROM pg_policy
    WHERE polrelid = 'public.ship_blueprints'::regclass
  `);
  console.table(r.rows);

  // Asegurar todos los planos siguen activos
  await c.query(`UPDATE ship_blueprints SET is_active = true WHERE code IN ('bp_deathstar','bp_falco_x_clasica','bp_mega_recycler','bp_nova','bp_nodra')`);

  const inv = await c.query(`SELECT code, name, is_active, is_droppable FROM ship_blueprints ORDER BY price_fxu`);
  console.table(inv.rows);

  await c.end();
})().catch(e => { console.error(e); process.exit(1); });
