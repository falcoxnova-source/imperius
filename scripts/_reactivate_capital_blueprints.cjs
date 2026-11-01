const { Client } = require('pg');
const c = new Client({
  host: 'aws-1-eu-north-1.pooler.supabase.com', port: 6543,
  user: 'postgres.hhrgcnvydmjqcevgmlhj', password: 'Jfs.samsung1989*',
  database: 'postgres', ssl: { rejectUnauthorized: false },
});
(async () => {
  await c.connect();

  // Re-activar los 3 planos capitales
  await c.query(`
    UPDATE ship_blueprints
    SET is_active = true
    WHERE code IN ('bp_deathstar', 'bp_nova', 'bp_nodra')
  `);

  // Verificar planos en inventarios
  const inv = await c.query(`
    SELECT sb.code, sb.name, sb.is_active, COUNT(usb.id) AS planos_en_inventario
    FROM ship_blueprints sb
    LEFT JOIN user_ship_blueprints usb ON usb.blueprint_id = sb.id
    GROUP BY sb.id, sb.code, sb.name, sb.is_active
    ORDER BY sb.code
  `);
  console.log('=== Estado planos + inventario usuarios ===');
  console.table(inv.rows);

  await c.end();
})().catch(e => { console.error(e); process.exit(1); });
