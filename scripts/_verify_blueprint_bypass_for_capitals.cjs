const { Client } = require('pg');
const c = new Client({
  host: 'aws-1-eu-north-1.pooler.supabase.com', port: 6543,
  user: 'postgres.hhrgcnvydmjqcevgmlhj', password: 'Jfs.samsung1989*',
  database: 'postgres', ssl: { rejectUnauthorized: false },
});
(async () => {
  await c.connect();

  // 1) Confirmar planos activos vinculados a sus ship_types
  const bps = await c.query(`
    SELECT sb.code AS bp_code, sb.is_active, st.code AS ship_code, st.name AS ship_name
    FROM ship_blueprints sb
    JOIN ship_types st ON st.id = sb.ship_type_id
    ORDER BY sb.price_fxu
  `);
  console.log('=== Planos vinculados a naves ===');
  console.table(bps.rows);

  // 2) Verificar la funcion del shipyard contiene el bypass
  const fn = await c.query(`SELECT pg_get_functiondef(oid) AS def FROM pg_proc WHERE proname = 'add_to_shipyard_queue'`);
  const def = fn.rows[0]?.def || '';
  const hasBypass = def.includes('v_has_enough_blueprints')
                 && def.includes("bt.code = 'shipyard'")
                 && def.includes('Hangar nivel 1');
  console.log('add_to_shipyard_queue tiene bypass de plano (Hangar 1):', hasBypass ? '✅' : '❌');

  await c.end();
})().catch(e => { console.error(e); process.exit(1); });
