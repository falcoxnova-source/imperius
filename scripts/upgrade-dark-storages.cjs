// Mejora todos los planetas de dark@gmail.com:
// - Renombra colonias con nombres creíbles
// - Pone almacenes Level 10 en todos (main + colonias)
// - Llena los almacenes al máximo (5,350,000 cada recurso)

const { Client } = require('pg');
const client = new Client({
  host: 'aws-1-eu-north-1.pooler.supabase.com', port: 6543,
  user: 'postgres.hhrgcnvydmjqcevgmlhj', password: 'Jfs.samsung1989*',
  database: 'postgres', ssl: { rejectUnauthorized: false },
});

// Capacidad L10 = 5000 * floor(2.5 * exp(20*10/33)) = 5,350,000
const STORAGE_L10 = Math.floor(5000 * Math.floor(2.5 * Math.exp((20 * 10) / 33)));

// Building type IDs (obtenidos de building_types):
const METAL_STORAGE_ID = 6;
const CRYSTAL_STORAGE_ID = 7;
const DEUTERIUM_TANK_ID = 8;

// Nombres creíbles estilo sci-fi para colonias
const CREDIBLE_NAMES = [
  'Nueva Terra',
  'Andromeda Prime',
  'Kepler-442',
  'Proxima B',
  'Nebula Orion',
  'Vega Alpha',
  'Ciudadela Sirius',
];

async function main() {
  await client.connect();

  // 1. Obtener user
  const userRes = await client.query(`SELECT id, username FROM profiles WHERE email = 'dark@gmail.com'`);
  if (!userRes.rows.length) throw new Error('Usuario no encontrado');
  const userId = userRes.rows[0].id;
  console.log(`✅ Usuario: ${userRes.rows[0].username} (${userId})`);

  // 2. Obtener todos sus planetas
  const planetsRes = await client.query(
    `SELECT id, name, galaxy, solar_system, position, is_main_planet
     FROM planets WHERE user_id = $1 AND is_destroyed = false
     ORDER BY is_main_planet DESC, created_at ASC`,
    [userId]
  );
  console.log(`\n📍 Planetas encontrados: ${planetsRes.rows.length}\n`);

  let nameIdx = 0;
  for (const planet of planetsRes.rows) {
    const isMain = planet.is_main_planet;
    let newName = planet.name;

    // Renombrar colonias (no el principal)
    if (!isMain) {
      newName = CREDIBLE_NAMES[nameIdx++ % CREDIBLE_NAMES.length];
      await client.query(`UPDATE planets SET name = $1 WHERE id = $2`, [newName, planet.id]);
    }

    // 3. Almacenes L10: upsert planet_buildings para los 3 tipos
    for (const btId of [METAL_STORAGE_ID, CRYSTAL_STORAGE_ID, DEUTERIUM_TANK_ID]) {
      await client.query(`
        INSERT INTO planet_buildings (planet_id, building_type_id, level, is_upgrading, created_at)
        VALUES ($1, $2, 10, false, now())
        ON CONFLICT (planet_id, building_type_id) DO UPDATE
          SET level = 10, is_upgrading = false
      `, [planet.id, btId]);
    }

    // 4. Actualizar planet_resources: capacidad + llenar al máximo
    await client.query(`
      UPDATE planet_resources
      SET metal = $2,
          crystal = $2,
          deuterium = $2,
          metal_storage = $2,
          crystal_storage = $2,
          deuterium_storage = $2,
          last_update = now()
      WHERE planet_id = $1
    `, [planet.id, STORAGE_L10]);

    const tag = isMain ? '🌍 PRINCIPAL' : '🛰️  colonia';
    console.log(`${tag} "${newName}" @ G${planet.galaxy}:${planet.solar_system}:${planet.position}`);
    console.log(`   → Almacenes L10 (${STORAGE_L10.toLocaleString()} c/u)  LLENOS\n`);
  }

  console.log('='.repeat(70));
  console.log(`✅ ${planetsRes.rows.length} planetas actualizados`);
  console.log(`💰 Recursos totales: ${(STORAGE_L10 * 3 * planetsRes.rows.length).toLocaleString()} unidades`);
  console.log('='.repeat(70));

  await client.end();
}

main().catch(async (e) => {
  console.error('❌ Error:', e.message);
  try { await client.end(); } catch {}
  process.exit(1);
});
