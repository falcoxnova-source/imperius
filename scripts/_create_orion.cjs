const { Client } = require('pg');
const crypto = require('crypto');
(async () => {
  const c = new Client({ host: 'aws-1-eu-north-1.pooler.supabase.com', port: 6543, user: 'postgres.hhrgcnvydmjqcevgmlhj', password: 'Jfs.samsung1989*', database: 'postgres', ssl: { rejectUnauthorized: false } });
  await c.connect();
  // Limpiar el Zenith fallido
  const z = await c.query(`SELECT id FROM auth.users WHERE email = 'zenith@npc.falcoxnova.com'`);
  if (z.rows.length > 0) {
    await c.query(`DELETE FROM planets WHERE user_id = $1`, [z.rows[0].id]);
    await c.query(`DELETE FROM profiles WHERE id = $1`, [z.rows[0].id]);
    await c.query(`DELETE FROM auth.users WHERE id = $1`, [z.rows[0].id]);
  }
  // Crear Orion como NPC #10
  const uid = crypto.randomUUID();
  const email = 'orion@npc.falcoxnova.com';
  await c.query(`INSERT INTO auth.users (id, instance_id, email, encrypted_password, email_confirmed_at, role, aud, created_at, updated_at, confirmation_token, raw_app_meta_data, raw_user_meta_data) VALUES ($1, '00000000-0000-0000-0000-000000000000', $2, 'fake_hash', NOW(), 'authenticated', 'authenticated', NOW(), NOW(), '', '{}', '{}')`, [uid, email]);
  await c.query(`UPDATE profiles SET username = 'Orion', email = $2, is_bot = true, autopilot_active = true WHERE id = $1`, [uid, email]);
  const pos = await c.query(`SELECT gs.pos FROM generate_series(4, 12) AS gs(pos) WHERE NOT EXISTS (SELECT 1 FROM planets WHERE galaxy = 3 AND solar_system = 80 AND position = gs.pos AND NOT is_destroyed) ORDER BY random() LIMIT 1`);
  const p = pos.rows[0].pos;
  const pr = await c.query(`INSERT INTO planets (id, user_id, name, galaxy, solar_system, position, planet_type, is_main_planet, is_destroyed, fields_used, fields_max, diameter, temp_min, temp_max, created_at, autopilot_role) VALUES (gen_random_uuid(), $1, 'Orion Prime', 3, 80, $2, 'planet', true, false, 0, 163, 12800, -20, 40, NOW(), 'balanced') RETURNING id`, [uid, p]);
  await c.query(`INSERT INTO planet_resources (planet_id, metal, crystal, deuterium, energy_max, energy_used, last_update) VALUES ($1, 500, 500, 0, 0, 0, NOW()) ON CONFLICT DO NOTHING`, [pr.rows[0].id]);
  console.log(`✅ NPC Orion (balanced) creado en 3:80:${p}`);
  await c.end();
})();
