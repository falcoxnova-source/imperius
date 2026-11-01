const { Client } = require('pg');
const c = new Client({
  host: 'aws-1-eu-north-1.pooler.supabase.com',
  port: 6543,
  database: 'postgres',
  user: 'postgres.hhrgcnvydmjqcevgmlhj',
  password: 'Jfs.samsung1989*',
  ssl: { rejectUnauthorized: false }
});

const EMAIL = 'Ghanaboii30@gmail.com';
const USDT_TO_ADD = 5;

async function main() {
  await c.connect();
  console.log('Connected to database');

  // 1. Find user by email
  const find = await c.query(
    `SELECT p.id, p.username, p.usdt_balance, a.email
     FROM profiles p
     JOIN auth.users a ON p.id = a.id
     WHERE LOWER(a.email) = LOWER($1)`,
    [EMAIL]
  );

  if (find.rows.length === 0) {
    console.log('❌ Usuario no encontrado:', EMAIL);
    await c.end();
    return;
  }

  const user = find.rows[0];
  console.log('✅ Usuario encontrado:', user.username, '| USDT actual:', user.usdt_balance);

  // 2. Get main planet
  const planetRes = await c.query(
    'SELECT id, name, galaxy, solar_system, position FROM planets WHERE user_id = $1 AND is_main_planet = true',
    [user.id]
  );

  if (planetRes.rows.length === 0) {
    console.log('❌ No tiene planeta principal');
    await c.end();
    return;
  }

  const planet = planetRes.rows[0];
  console.log('🌍 Planeta principal:', planet.name, `[${planet.galaxy}:${planet.solar_system}:${planet.position}]`);

  // 3. Check current buildings
  const buildings = await c.query(
    `SELECT bt.code, bt.name, pb.level
     FROM planet_buildings pb
     JOIN building_types bt ON pb.building_type_id = bt.id
     WHERE pb.planet_id = $1
     AND bt.code IN ('metal_mine','crystal_mine','deuterium_synthesizer','solar_plant','metal_storage','crystal_storage','deuterium_tank')
     ORDER BY bt.code`,
    [planet.id]
  );
  console.log('\n📊 Edificios actuales:');
  console.table(buildings.rows);

  // 4. Check current resources
  const resData = await c.query(
    'SELECT metal, crystal, deuterium, energy_used, energy_max FROM planet_resources WHERE planet_id = $1',
    [planet.id]
  );
  console.log('💎 Recursos actuales:');
  console.table(resData.rows);

  // ===== NOW APPLY CHANGES =====
  console.log('\n🔧 Aplicando cambios...\n');

  // 5. Add 5 USDT
  await c.query(
    'UPDATE profiles SET usdt_balance = COALESCE(usdt_balance, 0) + $1 WHERE id = $2',
    [USDT_TO_ADD, user.id]
  );
  console.log(`✅ +${USDT_TO_ADD} USDT añadidos`);

  // 6. Set building levels: mines L10, storages L10, solar plant L15
  const buildingUpdates = [
    { code: 'metal_mine', level: 10 },
    { code: 'crystal_mine', level: 10 },
    { code: 'deuterium_synthesizer', level: 10 },
    { code: 'metal_storage', level: 10 },
    { code: 'crystal_storage', level: 10 },
    { code: 'deuterium_tank', level: 10 },
    { code: 'solar_plant', level: 15 },  // L15 produces 1254 energy (mines L10 consume 1039)
  ];

  for (const b of buildingUpdates) {
    const result = await c.query(
      `UPDATE planet_buildings pb
       SET level = $1, is_upgrading = false, upgrade_end_time = NULL
       FROM building_types bt
       WHERE pb.building_type_id = bt.id
       AND pb.planet_id = $2
       AND bt.code = $3
       RETURNING bt.name, pb.level`,
      [b.level, planet.id, b.code]
    );

    if (result.rows.length > 0) {
      console.log(`✅ ${result.rows[0].name} → Nivel ${result.rows[0].level}`);
    } else {
      // Building doesn't exist yet, insert it
      const insertResult = await c.query(
        `INSERT INTO planet_buildings (planet_id, building_type_id, level)
         SELECT $1, bt.id, $2
         FROM building_types bt
         WHERE bt.code = $3
         RETURNING (SELECT name FROM building_types WHERE code = $3), level`,
        [planet.id, b.level, b.code]
      );
      console.log(`✅ ${b.code} creado → Nivel ${b.level}`);
    }
  }

  // 7. Calculate storage capacity at level 10
  // Formula: 5000 * floor(2.5 * e^(20*level/33))
  const storageLevel = 10;
  const storageCapacity = 5000 * Math.floor(2.5 * Math.exp((20 * storageLevel) / 33));
  console.log(`\n📦 Capacidad de almacén L10: ${storageCapacity.toLocaleString()}`);

  // 8. Calculate energy
  // Metal Mine L10: ceil(10 * 10 * 1.1^10) = 260
  // Crystal Mine L10: ceil(10 * 10 * 1.1^10) = 260
  // Deut Synth L10: ceil(20 * 10 * 1.1^10) = 519
  // Total consumption: 1039
  // Solar Plant L15: floor(20 * 15 * 1.1^15) = 1254
  const metalEnergy = Math.ceil(10 * 10 * Math.pow(1.1, 10));
  const crystalEnergy = Math.ceil(10 * 10 * Math.pow(1.1, 10));
  const deutEnergy = Math.ceil(20 * 10 * Math.pow(1.1, 10));
  const solarEnergy = Math.floor(20 * 15 * Math.pow(1.1, 15));
  const totalUsed = metalEnergy + crystalEnergy + deutEnergy;

  console.log(`⚡ Energía: Solar L15 produce ${solarEnergy} | Minas consumen ${totalUsed} | Neto: +${solarEnergy - totalUsed}`);

  // 9. Fill storages and update energy
  await c.query(
    `UPDATE planet_resources
     SET metal = $1, crystal = $2, deuterium = $3,
         metal_storage = $1, crystal_storage = $2, deuterium_storage = $3,
         energy_used = $4, energy_max = $5,
         last_update = NOW()
     WHERE planet_id = $6`,
    [storageCapacity, storageCapacity, storageCapacity, totalUsed, solarEnergy, planet.id]
  );
  console.log(`✅ Almacenes llenos: ${storageCapacity.toLocaleString()} de cada recurso`);
  console.log(`✅ Energía actualizada: ${solarEnergy} producida / ${totalUsed} consumida`);

  // 10. Verify final state
  console.log('\n========== ESTADO FINAL ==========');
  
  const finalProfile = await c.query(
    'SELECT username, usdt_balance FROM profiles WHERE id = $1',
    [user.id]
  );
  console.log('💰 USDT Balance:', finalProfile.rows[0].usdt_balance);

  const finalBuildings = await c.query(
    `SELECT bt.code, bt.name, pb.level
     FROM planet_buildings pb
     JOIN building_types bt ON pb.building_type_id = bt.id
     WHERE pb.planet_id = $1
     AND bt.code IN ('metal_mine','crystal_mine','deuterium_synthesizer','solar_plant','metal_storage','crystal_storage','deuterium_tank')
     ORDER BY bt.code`,
    [planet.id]
  );
  console.log('\n🏗️ Edificios:');
  console.table(finalBuildings.rows);

  const finalRes = await c.query(
    'SELECT metal, crystal, deuterium, energy_used, energy_max FROM planet_resources WHERE planet_id = $1',
    [planet.id]
  );
  console.log('💎 Recursos:');
  console.table(finalRes.rows);

  await c.end();
  console.log('\n✅ ¡Todo listo!');
}

main().catch(e => { console.error('❌ Error:', e.message); process.exit(1); });
