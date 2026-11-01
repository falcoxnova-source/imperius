process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const { Client } = require('pg');
(async () => {
  const c = new Client({
    host: 'aws-1-eu-north-1.pooler.supabase.com', port: 6543,
    user: 'postgres.hhrgcnvydmjqcevgmlhj', password: 'Jfs.samsung1989*',
    database: 'postgres', ssl: { rejectUnauthorized: false },
  });
  await c.connect();
  console.log('--- ANTES ---');
  const before = await c.query("SELECT code, weapon_power, structural_integrity, shield_power, rapid_fire->'deathstar' AS rf_ds FROM ship_types WHERE code IN ('falco_x_clasica','deathstar') ORDER BY code");
  console.table(before.rows);

  await c.query("UPDATE ship_types SET weapon_power = 200000 WHERE code = 'falco_x_clasica'");
  await c.query("UPDATE ship_types SET rapid_fire = COALESCE(rapid_fire, '{}'::jsonb) || jsonb_build_object('deathstar', 20) WHERE code = 'falco_x_clasica'");

  console.log('--- DESPUES ---');
  const after = await c.query("SELECT code, weapon_power, structural_integrity, shield_power, rapid_fire->'deathstar' AS rf_ds FROM ship_types WHERE code IN ('falco_x_clasica','deathstar') ORDER BY code");
  console.table(after.rows);
  await c.end();
})().catch(e => { console.error(e); process.exit(1); });
