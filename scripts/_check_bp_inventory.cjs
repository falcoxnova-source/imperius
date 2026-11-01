const { Client } = require('pg');

(async () => {
  const c = new Client({
    host: 'aws-1-eu-north-1.pooler.supabase.com',
    port: 6543,
    user: 'postgres.hhrgcnvydmjqcevgmlhj',
    password: 'Jfs.samsung1989*',
    database: 'postgres',
    ssl: { rejectUnauthorized: false },
  });
  await c.connect();
  const r = await c.query(`
    SELECT p.username, sb.code as bp_code, sb.ship_type_id, st.code as ship_code, COUNT(*)::int qty
    FROM user_ship_blueprints usb
    JOIN ship_blueprints sb ON sb.id = usb.blueprint_id
    JOIN ship_types st ON st.id = sb.ship_type_id
    LEFT JOIN profiles p ON p.id = usb.user_id
    GROUP BY 1,2,3,4
    ORDER BY p.username, sb.code
  `);
  console.table(r.rows);

  const bps = await c.query(`SELECT id, code, ship_type_id, is_active FROM ship_blueprints ORDER BY id`);
  console.log('\n--- ship_blueprints ---');
  console.table(bps.rows);

  // Check RLS policies
  const pol = await c.query(`
    SELECT polname, polcmd, polroles::regrole[]
    FROM pg_policy
    WHERE polrelid = 'public.user_ship_blueprints'::regclass
  `);
  console.log('\n--- RLS user_ship_blueprints ---');
  console.table(pol.rows);
  const tbl = await c.query(`SELECT relrowsecurity FROM pg_class WHERE oid='public.user_ship_blueprints'::regclass`);
  console.log('RLS enabled:', tbl.rows[0]);

  await c.end();
})().catch((e) => { console.error(e); process.exit(1); });
