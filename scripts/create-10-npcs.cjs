const { Client } = require('pg');
const crypto = require('crypto');

// Nombres temáticos para los NPCs (estilo sci-fi/militar)
const NPC_NAMES = [
  'Vortex',
  'Nebula',
  'Phantom',
  'Stryker',
  'Eclipse',
  'Nova',
  'Titan',
  'Spectra',
  'Zenith',
  'Pulsar'
];

// Roles distribuidos: 4 military, 3 miner, 2 balanced, 1 research
const NPC_ROLES = [
  'military',
  'miner',
  'military',
  'balanced',
  'miner',
  'military',
  'research',
  'miner',
  'balanced',
  'military'
];

(async () => {
  const c = new Client({
    host: 'aws-1-eu-north-1.pooler.supabase.com',
    port: 6543,
    user: 'postgres.hhrgcnvydmjqcevgmlhj',
    password: 'Jfs.samsung1989*',
    database: 'postgres',
    ssl: { rejectUnauthorized: false }
  });
  await c.connect();

  // Repartir NPCs por distintos sistemas para que no estén todos juntos
  const galaxySpread = [
    { galaxy: 1, system: 50 },
    { galaxy: 1, system: 120 },
    { galaxy: 1, system: 200 },
    { galaxy: 1, system: 280 },
    { galaxy: 1, system: 350 },
    { galaxy: 2, system: 60 },
    { galaxy: 2, system: 150 },
    { galaxy: 2, system: 250 },
    { galaxy: 3, system: 80 },
    { galaxy: 3, system: 180 }
  ];

  const created = [];

  for (let i = 0; i < 10; i++) {
    const userId = crypto.randomUUID();
    const username = NPC_NAMES[i];
    const email = `${username.toLowerCase()}@npc.falcoxnova.com`;
    const role = NPC_ROLES[i];
    const loc = galaxySpread[i];

    try {
      // 1) Crear usuario en auth.users (necesario para FK en profiles)
      await c.query(`
        INSERT INTO auth.users (id, instance_id, email, encrypted_password, email_confirmed_at, role, aud, created_at, updated_at, confirmation_token, raw_app_meta_data, raw_user_meta_data)
        VALUES ($1, '00000000-0000-0000-0000-000000000000', $2, '$2a$10$abcdefghijklmnopqrstuvwxyz012345678901234567890', NOW(), 'authenticated', 'authenticated', NOW(), NOW(), '', '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb)
      `, [userId, email]);

      // 2) Actualizar perfil NPC (trigger en auth.users ya lo creó con el id)
      await c.query(`
        UPDATE profiles SET username = $2, email = $3, is_bot = true, autopilot_active = true
        WHERE id = $1
      `, [userId, username, email]);

      // 3) Buscar posición libre en el sistema solar (posiciones 4-12 son mejores)
      const posRes = await c.query(`
        SELECT gs.pos FROM generate_series(4, 12) AS gs(pos)
        WHERE NOT EXISTS (
          SELECT 1 FROM planets p
          WHERE p.galaxy = $1 AND p.solar_system = $2 AND p.position = gs.pos AND NOT p.is_destroyed
        )
        ORDER BY random()
        LIMIT 1
      `, [loc.galaxy, loc.system]);

      let finalSystem = loc.system;
      let finalPosition;

      if (posRes.rows.length === 0) {
        console.log(`⚠️  No hay posición libre en ${loc.galaxy}:${loc.system}, buscando sistema cercano...`);
        const altRes = await c.query(`
          SELECT s.sys, gs.pos
          FROM (SELECT $2::int + off AS sys FROM (VALUES (1),(-1),(2),(-2),(3),(-3)) AS t(off)) s,
               generate_series(4, 12) AS gs(pos)
          WHERE s.sys > 0 AND s.sys <= 499
            AND NOT EXISTS (
              SELECT 1 FROM planets p
              WHERE p.galaxy = $1 AND p.solar_system = s.sys AND p.position = gs.pos AND NOT p.is_destroyed
            )
          ORDER BY ABS(s.sys - $2::int), random()
          LIMIT 1
        `, [loc.galaxy, loc.system]);
        if (altRes.rows.length === 0) {
          console.log(`❌ No se encontró posición para ${username}, saltando...`);
          continue;
        }
        finalSystem = altRes.rows[0].sys;
        finalPosition = altRes.rows[0].pos;
      } else {
        finalPosition = posRes.rows[0].pos;
      }

      // 4) Crear planeta principal
      const planetRes = await c.query(`
        INSERT INTO planets (id, user_id, name, galaxy, solar_system, position, planet_type, is_main_planet, is_destroyed, fields_used, fields_max, diameter, temp_min, temp_max, created_at, autopilot_role)
        VALUES (gen_random_uuid(), $1, $2 || ' Prime', $3, $4, $5, 'planet', true, false, 0, 163, 12800, -20, 40, NOW(), $6)
        RETURNING id
      `, [userId, username, loc.galaxy, finalSystem, finalPosition, role]);

      const planetId = planetRes.rows[0].id;

      // 5) Inicializar recursos del planeta (500 metal, 500 crystal, 0 deut — desde cero)
      await c.query(`
        INSERT INTO planet_resources (planet_id, metal, crystal, deuterium, energy_max, energy_used, last_update)
        VALUES ($1, 500, 500, 0, 0, 0, NOW())
        ON CONFLICT (planet_id) DO NOTHING
      `, [planetId]);

      created.push({ username, role, location: `${loc.galaxy}:${finalSystem}:${finalPosition}` });
      console.log(`✅ NPC ${username} (${role}) creado en ${loc.galaxy}:${finalSystem}:${finalPosition}`);

    } catch (e) {
      console.error(`❌ Error creando ${username}:`, e.message);
    }
  }

  console.log('\n=== RESUMEN ===');
  console.log(`NPCs creados: ${created.length}/10`);
  created.forEach(n => console.log(`  ${n.username.padEnd(10)} ${n.role.padEnd(10)} ${n.location}`));
  console.log('\nEstos NPCs empezarán desde 0 y progresarán automáticamente con bot_ai_tick().');

  await c.end();
})();
