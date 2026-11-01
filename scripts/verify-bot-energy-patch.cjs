const { Client } = require('pg');
(async () => {
  const c = new Client({
    host: 'aws-1-eu-north-1.pooler.supabase.com',
    port: 6543,
    user: 'postgres.hhrgcnvydmjqcevgmlhj',
    password: process.env.SUPABASE_DB_PASSWORD || 'Jfs.samsung1989*',
    database: 'postgres',
    ssl: { rejectUnauthorized: false }
  });
  await c.connect();
  const r = await c.query("SELECT prosrc FROM pg_proc WHERE proname='bot_ai_tick'");
  const src = r.rows[0].prosrc;

  console.log('=== Validación ===');
  console.log('v_energy_balance declarado:', src.includes('v_energy_balance numeric := 0;') ? '✅' : '❌');
  console.log('Lectura energy_production:', src.includes('SELECT COALESCE(energy_production, 0) - COALESCE(energy_consumption, 0)') ? '✅' : '❌');
  console.log('Filtro wish_list:', src.includes("IF v_energy_balance < 0 THEN") ? '✅' : '❌');
  console.log('Fusion fallback:', src.includes("'fusion_reactor'") ? '✅' : '❌');
  console.log('Skip minas en déficit:', src.includes("IF v_wish_item IN ('metal_mine', 'crystal_mine', 'deuterium_synthesizer')") ? '✅' : '❌');

  console.log('\n=== Ejecutando bot_ai_tick() ===');
  const t = await c.query('SELECT bot_ai_tick() AS result');
  console.log(JSON.stringify(t.rows[0].result, null, 2));

  // Inspeccionar colas recientes de solar_plant vs minas
  console.log('\n=== Últimas 10 órdenes a bots (edificios, 2 min) ===');
  const q = await c.query(`
    SELECT bq.start_time, bt.code, bq.target_level, bq.queue_position, pr.username, p.coordinates
    FROM building_queue bq
    JOIN planets p ON p.id = bq.planet_id
    JOIN profiles pr ON pr.id = p.user_id
    JOIN building_types bt ON bt.id = bq.building_type_id
    WHERE (pr.is_bot = true OR pr.autopilot_active = true)
      AND bq.start_time > now() - interval '2 minutes'
    ORDER BY bq.start_time DESC
    LIMIT 15
  `);
  q.rows.forEach(x => console.log(`${x.start_time.toISOString()} ${x.username.padEnd(15)} ${x.code.padEnd(22)} L${x.target_level} pos${x.queue_position}`));

  await c.end();
})();
