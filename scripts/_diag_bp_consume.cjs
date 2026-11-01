const { Client } = require('pg');
(async () => {
  const c = new Client({
    host: 'aws-1-eu-north-1.pooler.supabase.com', port: 6543,
    user: 'postgres.hhrgcnvydmjqcevgmlhj', password: 'Jfs.samsung1989*',
    database: 'postgres', ssl: { rejectUnauthorized: false },
  });
  await c.connect();

  console.log('\n== Triggers en shipyard_queue ==');
  const trg = await c.query(`
    SELECT t.tgname, t.tgenabled, pg_get_triggerdef(t.oid) AS def
    FROM pg_trigger t
    WHERE t.tgrelid = 'public.shipyard_queue'::regclass
      AND NOT t.tgisinternal
    ORDER BY t.tgname
  `);
  for (const r of trg.rows) {
    console.log(`- ${r.tgname} (enabled=${r.tgenabled})`);
    console.log(`  ${r.def}`);
  }

  console.log('\n== Inventario de planos admin ==');
  const inv = await c.query(`
    SELECT usb.id, sb.code, usb.source, usb.acquired_at
    FROM user_ship_blueprints usb
    JOIN ship_blueprints sb ON sb.id = usb.blueprint_id
    JOIN profiles p ON p.id = usb.user_id
    WHERE p.username = 'admin'
    ORDER BY usb.acquired_at DESC
  `);
  console.table(inv.rows);

  console.log('\n== Cola actual de admin ==');
  const q = await c.query(`
    SELECT sq.id, sq.item_type, st.code AS ship, sq.quantity, sq.quantity_completed, sq.created_at
    FROM shipyard_queue sq
    JOIN planets pl ON pl.id = sq.planet_id
    JOIN profiles p ON p.id = pl.user_id
    LEFT JOIN ship_types st ON st.id = sq.ship_type_id
    WHERE p.username = 'admin'
    ORDER BY sq.created_at DESC
    LIMIT 10
  `);
  console.table(q.rows);

  console.log('\n== Mega reciclador stats ==');
  const sh = await c.query(`SELECT id, code, name, cargo_capacity, base_speed FROM ship_types WHERE code='mega_recycler'`);
  console.table(sh.rows);

  await c.end();
})().catch(e => { console.error(e); process.exit(1); });
