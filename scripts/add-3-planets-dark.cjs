// Agrega 3 planetas a dark@gmail.com con almacenes L10 llenos de recursos

const { Client } = require('pg');
const crypto = require('crypto');

const client = new Client({
  host: 'aws-1-eu-north-1.pooler.supabase.com',
  port: 6543,
  user: 'postgres.hhrgcnvydmjqcevgmlhj',
  password: 'Jfs.samsung1989*',
  database: 'postgres',
  ssl: { rejectUnauthorized: false },
});

async function main() {
  await client.connect();

  // 1. Obtener user_id de dark@gmail.com
  const userRes = await client.query(
    `SELECT id, username, email FROM profiles WHERE email = $1`,
    ['dark@gmail.com']
  );
  if (!userRes.rows.length) throw new Error('Usuario dark@gmail.com no encontrado');
  const userId = userRes.rows[0].id;
  console.log(`✅ Usuario: ${userRes.rows[0].username} (${userId})`);

  // 2. Ver planetas actuales
  const currentRes = await client.query(
    `SELECT id, name, galaxy, solar_system, position FROM planets WHERE user_id = $1 ORDER BY is_main_planet DESC`,
    [userId]
  );
  console.log(`\n📍 Planetas actuales: ${currentRes.rows.length}`);
  currentRes.rows.forEach(p => console.log(`   - ${p.name} @ G${p.galaxy}:${p.solar_system}:${p.position}`));

  // 3. Crear 3 nuevos planetas con nombres
  const planetNames = ['Colonia Xnova 1', 'Colonia Xnova 2', 'Colonia Xnova 3'];
  const newPlanets = [];

  for (const name of planetNames) {
    const planetId = crypto.randomUUID();
    
    // Encontrar slot libre aleatorio en galaxia 1-3, sistema 1-499, posición 4-12
    const slotRes = await client.query(`
      SELECT 
        floor(random() * 3 + 1)::int as galaxy,
        floor(random() * 499 + 1)::int as solar_system,
        floor(random() * 9 + 4)::int as position
    `);
    const slot = slotRes.rows[0];

    // Verificar que el slot esté libre
    const checkRes = await client.query(
      `SELECT id FROM planets WHERE galaxy = $1 AND solar_system = $2 AND position = $3 LIMIT 1`,
      [slot.galaxy, slot.solar_system, slot.position]
    );
    if (checkRes.rows.length > 0) {
      console.log(`⚠️  Slot G${slot.galaxy}:${slot.solar_system}:${slot.position} ocupado, reintentando...`);
      continue; // Reintentar
    }

    // Insertar planeta
    await client.query(`
      INSERT INTO planets (
        id, user_id, name, galaxy, solar_system, position,
        planet_type, diameter, fields_used, fields_max, temp_min, temp_max,
        is_main_planet, is_destroyed, last_update, created_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6,
        'planet', 12800, 163, 163, -30, 40,
        false, false, now(), now()
      )
    `, [planetId, userId, name, slot.galaxy, slot.solar_system, slot.position]);

    // Almacenes Level 10 = 50000 de capacidad cada uno
    // Llenar con máximo
    const maxStorage = 50000;
    
    // Insertar recursos con almacenes L10
    await client.query(`
      INSERT INTO planet_resources (
        planet_id, metal, crystal, deuterium, energy_used, energy_max,
        metal_per_hour, crystal_per_hour, deuterium_per_hour,
        metal_storage, crystal_storage, deuterium_storage,
        last_update,
        metal_mine_percent, crystal_mine_percent, deuterium_synth_percent,
        solar_plant_percent, fusion_reactor_percent, solar_satellite_percent
      ) VALUES (
        $1,
        $2, $3, $4,
        0, 0,
        0, 0, 0,
        $5, $6, $7,
        now(),
        100, 100, 100,
        100, 100, 100
      )
    `, [planetId, maxStorage, maxStorage, maxStorage, maxStorage, maxStorage, maxStorage]);

    newPlanets.push({ id: planetId, name, galaxy: slot.galaxy, sys: slot.solar_system, pos: slot.position });
    console.log(`✅ ${name} @ G${slot.galaxy}:${slot.solar_system}:${slot.position} (almacenes L10 con max recursos)`);
  }

  console.log(`\n✨ 3 planetas agregados a dark@gmail.com`);
  console.log(`📊 Total planetas ahora: ${currentRes.rows.length + newPlanets.length}`);

  await client.end();
}

main().catch(async (e) => {
  console.error('❌ Error:', e.message);
  try { await client.end(); } catch {}
  process.exit(1);
});
