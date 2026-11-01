// Crea 5 colonias salteadas por la galaxia para jenserfs@gmail.com
const { Client } = require('pg');

const cfg = {
  host: 'aws-1-eu-north-1.pooler.supabase.com',
  port: 6543,
  database: 'postgres',
  user: 'postgres.hhrgcnvydmjqcevgmlhj',
  password: 'Jfs.samsung1989*',
  ssl: { rejectUnauthorized: false },
};

const EMAIL = 'jenserfs@gmail.com';
const N_COLONIES = 5;

function rnd(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }

(async () => {
  const c = new Client(cfg);
  await c.connect();
  try {
    const u = await c.query(
      `SELECT p.id, p.username FROM profiles p JOIN auth.users u ON u.id=p.id WHERE u.email=$1`,
      [EMAIL]
    );
    if (!u.rows.length) { console.log('❌ Usuario no encontrado'); return; }
    const userId = u.rows[0].id;
    console.log(`👤 ${EMAIL} -> ${u.rows[0].username} (${userId})`);

    const existing = await c.query(
      `SELECT galaxy, solar_system, position, is_main_planet, name
         FROM planets WHERE user_id=$1 AND planet_type='planet' AND NOT is_destroyed
         ORDER BY is_main_planet DESC, created_at`,
      [userId]
    );
    console.log(`📍 Planetas actuales (${existing.rows.length}):`);
    existing.rows.forEach(p => console.log(`   [${p.galaxy}:${p.solar_system}:${p.position}] ${p.name}${p.is_main_planet ? ' (principal)' : ''}`));

    // Galaxias salteadas: 1,2,3,4,5 (una por galaxia)
    const targetGalaxies = [1, 2, 3, 4, 5].slice(0, N_COLONIES);
    const created = [];

    for (const galaxy of targetGalaxies) {
      // Buscar posicion libre
      let attempts = 0, placed = false;
      while (attempts < 80 && !placed) {
        attempts++;
        const solar_system = rnd(1, 499);
        const position = rnd(4, 12); // posiciones habitables
        const clash = await c.query(
          `SELECT 1 FROM planets WHERE galaxy=$1 AND solar_system=$2 AND position=$3 AND planet_type='planet' LIMIT 1`,
          [galaxy, solar_system, position]
        );
        if (clash.rows.length) continue;

        const diameter = 12800 + rnd(0, 5000);
        const fields_max = 163 + rnd(0, 50);
        const temp_min = -20 + rnd(0, 40);
        const temp_max = 20 + rnd(0, 60);
        const image_id = rnd(1, 10);

        const ins = await c.query(
          `INSERT INTO planets (user_id, name, galaxy, solar_system, position, planet_type, is_main_planet, diameter, fields_max, temp_min, temp_max, image_id)
           VALUES ($1, $2, $3, $4, $5, 'planet', false, $6, $7, $8, $9, $10)
           RETURNING id`,
          [userId, `Colonia ${galaxy}`, galaxy, solar_system, position, diameter, fields_max, temp_min, temp_max, image_id]
        );
        const pid = ins.rows[0].id;
        await c.query(
          `INSERT INTO planet_resources (planet_id, metal, crystal, deuterium, metal_per_hour, crystal_per_hour, deuterium_per_hour)
           VALUES ($1, 500, 500, 0, 30, 15, 0)`,
          [pid]
        );
        created.push(`[${galaxy}:${solar_system}:${position}]`);
        placed = true;
      }
      if (!placed) console.log(`⚠️ No se pudo colocar en galaxia ${galaxy}`);
    }

    console.log(`\n✅ ${created.length} colonias creadas:`);
    created.forEach(co => console.log(`   ${co}`));
  } finally {
    await c.end();
  }
})().catch(e => { console.error(e); process.exit(1); });
