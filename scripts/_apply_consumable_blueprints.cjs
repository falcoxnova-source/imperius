const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

(async () => {
  const c = new Client({
    host: 'aws-1-eu-north-1.pooler.supabase.com', port: 6543,
    user: 'postgres.hhrgcnvydmjqcevgmlhj', password: 'Jfs.samsung1989*',
    database: 'postgres', ssl: { rejectUnauthorized: false },
  });

  await c.connect();
  const sql = fs.readFileSync(
    path.join(__dirname, '..', 'supabase', 'migrations', '20260618300000_consumable_blueprints.sql'),
    'utf8'
  );

  await c.query('BEGIN');
  try {
    await c.query(sql);
    await c.query('COMMIT');
    console.log('✓ Sistema de planos consumibles aplicado');

    const cfg = await c.query(`
      SELECT id, drop_chance, only_unowned, is_enabled, updated_at
      FROM expedition_blueprint_drop_config
      WHERE id = 1
    `);
    console.log('Config drops expedicion:');
    console.table(cfg.rows);

    const counts = await c.query(`
      SELECT sb.code, COUNT(*)::int AS total_units
      FROM user_ship_blueprints usb
      JOIN ship_blueprints sb ON sb.id = usb.blueprint_id
      GROUP BY sb.code
      ORDER BY sb.code
    `);
    console.log('Inventario global de planos (unidades):');
    console.table(counts.rows);
  } catch (e) {
    await c.query('ROLLBACK');
    console.error('✗', e.message);
    process.exitCode = 1;
  } finally {
    await c.end();
  }
})();
