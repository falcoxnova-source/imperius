const { Client } = require('pg');

const c = new Client({
  host: 'aws-1-eu-north-1.pooler.supabase.com',
  port: 6543,
  database: 'postgres',
  user: 'postgres.hhrgcnvydmjqcevgmlhj',
  password: 'Jfs.samsung1989*',
  ssl: { rejectUnauthorized: false }
});

const USER_ID = '9700c4e0-d0e4-4efa-baf7-e9cb97945b16';
const MAIN_PLANET_ID = '3b75ec4b-95d0-49dd-bca4-626e25d6c888';

async function main() {
  await c.connect();
  console.log('Conectado a la base de datos.\n');

  // =============================================
  // 1. NANOBOTS (nanite_factory) a nivel 1
  // building_type_id = 10
  // =============================================
  console.log('=== 1. Subiendo Nanobots a nivel 1 ===');
  const r1 = await c.query(`
    UPDATE planet_buildings 
    SET level = 1 
    WHERE planet_id = $1 AND building_type_id = 10
    RETURNING *
  `, [MAIN_PLANET_ID]);
  console.log('Nanobots actualizado:', r1.rowCount, 'filas\n');

  // =============================================
  // 2. LABORATORIO a nivel 12 (prereq de Graviton)
  // building_type_id = 12
  // =============================================
  console.log('=== 2. Subiendo Laboratorio a nivel 12 ===');
  const r2 = await c.query(`
    UPDATE planet_buildings 
    SET level = 12 
    WHERE planet_id = $1 AND building_type_id = 12
    RETURNING *
  `, [MAIN_PLANET_ID]);
  console.log('Laboratorio actualizado:', r2.rowCount, 'filas\n');

  // =============================================
  // 3. ENERGY_TECH a nivel 12 (prereq de Terraformer)
  // technology_type_id = 1
  // =============================================
  console.log('=== 3. Subiendo Energia a nivel 12 ===');
  const r3 = await c.query(`
    UPDATE user_technologies 
    SET level = 12 
    WHERE user_id = $1 AND technology_type_id = 1
    RETURNING *
  `, [USER_ID]);
  console.log('Energy Tech actualizado:', r3.rowCount, 'filas\n');

  // =============================================
  // 4. HYPERSPACE_TECH a nivel 6 (prereq de Death Star)
  // technology_type_id = 4
  // =============================================
  console.log('=== 4. Subiendo Hiperespacio a nivel 6 ===');
  const r4 = await c.query(`
    UPDATE user_technologies 
    SET level = 6 
    WHERE user_id = $1 AND technology_type_id = 4
    RETURNING *
  `, [USER_ID]);
  console.log('Hyperspace Tech actualizado:', r4.rowCount, 'filas\n');

  // =============================================
  // 5. HYPERSPACE_DRIVE a nivel 7 (prereq de Death Star)
  // technology_type_id = 8
  // =============================================
  console.log('=== 5. Subiendo Propulsor Hiperespacial a nivel 7 ===');
  const r5 = await c.query(`
    UPDATE user_technologies 
    SET level = 7 
    WHERE user_id = $1 AND technology_type_id = 8
    RETURNING *
  `, [USER_ID]);
  console.log('Hyperspace Drive actualizado:', r5.rowCount, 'filas\n');

  // =============================================
  // 6. GRAVITON_TECH a nivel 1 (prereq de Death Star)
  // technology_type_id = 15 - NO EXISTE, hay que crear
  // =============================================
  console.log('=== 6. Creando Graviton a nivel 1 ===');
  const r6 = await c.query(`
    INSERT INTO user_technologies (user_id, technology_type_id, level)
    VALUES ($1, 15, 1)
    ON CONFLICT (user_id, technology_type_id) 
    DO UPDATE SET level = 1
    RETURNING *
  `, [USER_ID]);
  console.log('Graviton Tech creado:', r6.rowCount, 'filas\n');

  // =============================================
  // 7. LLENAR ALMACENES al maximo
  // =============================================
  console.log('=== 7. Llenando almacenes al maximo ===');
  const r7 = await c.query(`
    UPDATE planet_resources 
    SET metal = metal_storage, 
        crystal = crystal_storage, 
        deuterium = deuterium_storage,
        last_update = NOW()
    WHERE planet_id = $1
    RETURNING metal, crystal, deuterium, metal_storage, crystal_storage, deuterium_storage
  `, [MAIN_PLANET_ID]);
  console.log('Recursos actualizados:');
  if (r7.rows.length > 0) {
    console.log('  Metal:', r7.rows[0].metal, '/', r7.rows[0].metal_storage);
    console.log('  Cristal:', r7.rows[0].crystal, '/', r7.rows[0].crystal_storage);
    console.log('  Deuterio:', r7.rows[0].deuterium, '/', r7.rows[0].deuterium_storage);
  }

  // =============================================
  // VERIFICACION FINAL
  // =============================================
  console.log('\n========== VERIFICACION FINAL ==========\n');
  
  const buildings = await c.query(`
    SELECT bt.code, bt.name, pb.level 
    FROM planet_buildings pb 
    JOIN building_types bt ON bt.id = pb.building_type_id 
    WHERE pb.planet_id = $1 AND bt.code IN ('nanite_factory', 'research_lab', 'shipyard', 'robotics_factory')
    ORDER BY pb.building_type_id
  `, [MAIN_PLANET_ID]);
  console.log('Edificios clave:');
  buildings.rows.forEach(b => console.log(`  ${b.name}: nivel ${b.level}`));

  const techs = await c.query(`
    SELECT tt.code, tt.name, ut.level 
    FROM user_technologies ut 
    JOIN technology_types tt ON tt.id = ut.technology_type_id 
    WHERE ut.user_id = $1 AND tt.code IN ('energy_tech', 'hyperspace_tech', 'hyperspace_drive', 'graviton_tech', 'computer_tech', 'shielding_tech')
    ORDER BY ut.technology_type_id
  `, [USER_ID]);
  console.log('\nTecnologias clave:');
  techs.rows.forEach(t => console.log(`  ${t.name}: nivel ${t.level}`));

  const resources = await c.query('SELECT metal, crystal, deuterium, metal_storage, crystal_storage, deuterium_storage FROM planet_resources WHERE planet_id = $1', [MAIN_PLANET_ID]);
  console.log('\nRecursos:');
  if (resources.rows.length > 0) {
    const r = resources.rows[0];
    console.log(`  Metal: ${r.metal} / ${r.metal_storage}`);
    console.log(`  Cristal: ${r.crystal} / ${r.crystal_storage}`);
    console.log(`  Deuterio: ${r.deuterium} / ${r.deuterium_storage}`);
  }

  console.log('\n✅ Todas las actualizaciones completadas exitosamente!');
  await c.end();
}

main().catch(e => { console.error('ERROR:', e); c.end(); });
