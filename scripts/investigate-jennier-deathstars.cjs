const { Client } = require('pg');

const c = new Client({
  host: 'aws-1-eu-north-1.pooler.supabase.com',
  port: 6543,
  database: 'postgres',
  user: 'postgres.hhrgcnvydmjqcevgmlhj',
  password: 'Jfs.samsung1989*',
  ssl: { rejectUnauthorized: false }
});

async function main() {
  await c.connect();

  // 1. Find user
  console.log('=== 1. USUARIO ===');
  const user = await c.query("SELECT id, username, email FROM profiles WHERE email = 'jennierfs@gmail.com'");
  console.log(JSON.stringify(user.rows, null, 2));
  if (user.rows.length === 0) { console.log('No encontrado'); await c.end(); return; }
  const userId = user.rows[0].id;

  // 2. Planetas del usuario
  console.log('\n=== 2. PLANETAS ===');
  const planets = await c.query(`
    SELECT p.id, p.name, p.galaxy, p.solar_system, p.position, p.planet_type,
           pr.metal, pr.crystal, pr.deuterium, p.fields_used, p.fields_max
    FROM planets p
    LEFT JOIN planet_resources pr ON pr.planet_id = p.id
    WHERE p.user_id = $1 ORDER BY p.galaxy, p.solar_system, p.position
  `, [userId]);
  console.log(JSON.stringify(planets.rows, null, 2));

  // 3. Deathstars actuales en cada planeta
  console.log('\n=== 3. ESTRELLAS DE LA MUERTE EN PLANETAS ===');
  const deathstars = await c.query(`
    SELECT p.name, p.galaxy || ':' || p.solar_system || ':' || p.position as coords,
           ps.quantity, st.code, st.name as ship_name
    FROM planet_ships ps
    JOIN ship_types st ON st.id = ps.ship_type_id
    JOIN planets p ON p.id = ps.planet_id
    WHERE p.user_id = $1 AND st.code = 'deathstar'
  `, [userId]);
  console.log(JSON.stringify(deathstars.rows, null, 2));

  // 4. Deathstars en flotas activas
  console.log('\n=== 4. DEATHSTARS EN FLOTAS ACTIVAS ===');
  const dsInFleets = await c.query(`
    SELECT f.id as fleet_id, f.mission_type, f.is_returning, f.is_completed,
           fs.quantity, f.departure_time, f.arrival_time,
           p.galaxy || ':' || p.solar_system || ':' || p.position as origin,
           f.target_galaxy || ':' || f.target_system || ':' || f.target_position as target
    FROM fleets f
    JOIN fleet_ships fs ON fs.fleet_id = f.id
    JOIN ship_types st ON st.id = fs.ship_type_id
    LEFT JOIN planets p ON p.id = f.origin_planet_id
    WHERE f.user_id = $1 AND st.code = 'deathstar'
    ORDER BY f.created_at DESC
  `, [userId]);
  console.log(JSON.stringify(dsInFleets.rows, null, 2));

  // 5. Historial de construcción de deathstars (shipyard_queue completadas)
  console.log('\n=== 5. COLA DE ASTILLERO (DEATHSTARS) ===');
  const sqDS = await c.query(`
    SELECT sq.*, st.code, st.name as ship_name,
           p.name as planet_name, p.galaxy || ':' || p.solar_system || ':' || p.position as coords
    FROM shipyard_queue sq
    JOIN ship_types st ON st.id = sq.ship_type_id
    JOIN planets p ON p.id = sq.planet_id
    WHERE p.user_id = $1 AND st.code = 'deathstar'
    ORDER BY sq.created_at DESC
  `, [userId]);
  console.log(JSON.stringify(sqDS.rows, null, 2));

  // 6. Niveles de edificios clave (astillero, lab) en cada planeta
  console.log('\n=== 6. EDIFICIOS CLAVE (ASTILLERO, LAB, MINAS) ===');
  const buildings = await c.query(`
    SELECT p.name as planet_name, p.galaxy || ':' || p.solar_system || ':' || p.position as coords,
           bt.code, bt.name as building_name, pb.level
    FROM planet_buildings pb
    JOIN building_types bt ON bt.id = pb.building_type_id
    JOIN planets p ON p.id = pb.planet_id
    WHERE p.user_id = $1
      AND bt.code IN ('shipyard', 'research_lab', 'metal_mine', 'crystal_mine', 'deuterium_synthesizer', 'nanite_factory', 'solar_plant', 'fusion_reactor')
    ORDER BY p.galaxy, p.solar_system, p.position, bt.code
  `, [userId]);
  console.log(JSON.stringify(buildings.rows, null, 2));

  // 7. Tecnologías relevantes
  console.log('\n=== 7. TECNOLOGIAS RELEVANTES ===');
  const techs = await c.query(`
    SELECT tt.code, tt.name, ut.level
    FROM user_technologies ut
    JOIN technology_types tt ON tt.id = ut.technology_type_id
    WHERE ut.user_id = $1
      AND tt.code IN ('graviton_tech', 'hyperspace_tech', 'hyperspace_drive', 'weapons_tech', 'shielding_tech', 'armour_tech', 'plasma_tech')
    ORDER BY tt.code
  `, [userId]);
  console.log(JSON.stringify(techs.rows, null, 2));

  // 8. Reportes de batalla donde ganó loot (recursos)
  console.log('\n=== 8. LOOT OBTENIDO EN BATALLAS (top 30) ===');
  const loot = await c.query(`
    SELECT id, coordinates, result, 
           loot_metal, loot_crystal, loot_deuterium,
           (loot_metal + loot_crystal + loot_deuterium) as total_loot,
           created_at
    FROM battle_reports
    WHERE attacker_id = $1 AND (loot_metal > 0 OR loot_crystal > 0 OR loot_deuterium > 0)
    ORDER BY (loot_metal + loot_crystal + loot_deuterium) DESC
    LIMIT 30
  `, [userId]);
  console.log(JSON.stringify(loot.rows, null, 2));

  // 9. Total de loot acumulado
  console.log('\n=== 9. TOTAL LOOT ACUMULADO ===');
  const totalLoot = await c.query(`
    SELECT COUNT(*) as battles_with_loot,
           SUM(loot_metal) as total_metal,
           SUM(loot_crystal) as total_crystal,
           SUM(loot_deuterium) as total_deuterium,
           SUM(loot_metal + loot_crystal + loot_deuterium) as grand_total
    FROM battle_reports
    WHERE attacker_id = $1 AND (loot_metal > 0 OR loot_crystal > 0 OR loot_deuterium > 0)
  `, [userId]);
  console.log(JSON.stringify(totalLoot.rows, null, 2));

  // 10. Expediciones con recompensas de recursos
  console.log('\n=== 10. MENSAJES DE EXPEDICION CON RECURSOS (top 30) ===');
  const expeditions = await c.query(`
    SELECT id, subject, body, created_at
    FROM messages
    WHERE recipient_id = $1
      AND (subject ILIKE '%expedici%' OR subject ILIKE '%expedition%')
      AND (body ILIKE '%metal%' OR body ILIKE '%cristal%' OR body ILIKE '%deuterio%' OR body ILIKE '%nave%' OR body ILIKE '%ship%')
    ORDER BY created_at DESC
    LIMIT 30
  `, [userId]);
  console.log(JSON.stringify(expeditions.rows, null, 2));

  // 11. Transacciones del mercado (compras/ventas)
  console.log('\n=== 11. TRANSACCIONES DE MERCADO ===');
  const market = await c.query(`
    SELECT mt.id, mt.listing_id, mt.buyer_id, mt.seller_id, mt.quantity, mt.total_price, mt.created_at,
           mt.item_type, mt.item_code
    FROM market_transactions mt
    WHERE mt.buyer_id = $1 OR mt.seller_id = $1
    ORDER BY mt.created_at DESC
    LIMIT 30
  `, [userId]);
  console.log(JSON.stringify(market.rows, null, 2));

  // 12. Flotas de transporte recibidas (otros le enviaron recursos)
  console.log('\n=== 12. FLOTAS DE TRANSPORTE RECIBIDAS (últimas 50) ===');
  const transports = await c.query(`
    SELECT f.id, f.user_id, f.mission_type, f.is_completed,
           f.cargo_metal, f.cargo_crystal, f.cargo_deuterium,
           (f.cargo_metal + f.cargo_crystal + f.cargo_deuterium) as total_cargo,
           f.target_galaxy || ':' || f.target_system || ':' || f.target_position as target,
           pr.username as sender,
           f.arrival_time, f.created_at
    FROM fleets f
    LEFT JOIN profiles pr ON pr.id = f.user_id
    WHERE f.mission_type = 'transport'
      AND f.user_id != $1
      AND EXISTS (
        SELECT 1 FROM planets p 
        WHERE p.user_id = $1 
          AND p.galaxy = f.target_galaxy 
          AND p.solar_system = f.target_system 
          AND p.position = f.target_position
      )
    ORDER BY f.created_at DESC
    LIMIT 50
  `, [userId]);
  console.log(JSON.stringify(transports.rows, null, 2));

  // 13. Costo total de 4 Estrellas de la Muerte
  console.log('\n=== 13. COSTO DE 4 ESTRELLAS DE LA MUERTE ===');
  const dsCost = await c.query(`
    SELECT metal_cost, crystal_cost, deuterium_cost,
           metal_cost * 4 as total_metal_4,
           crystal_cost * 4 as total_crystal_4,
           deuterium_cost * 4 as total_deut_4,
           (metal_cost + crystal_cost + deuterium_cost) * 4 as grand_total_4
    FROM ship_types WHERE code = 'deathstar'
  `);
  console.log(JSON.stringify(dsCost.rows, null, 2));

  // 14. Recursos actuales del jugador
  console.log('\n=== 14. RECURSOS ACTUALES EN TODOS LOS PLANETAS ===');
  const resources = await c.query(`
    SELECT p.name, p.galaxy || ':' || p.solar_system || ':' || p.position as coords,
           pr.metal, pr.crystal, pr.deuterium,
           (pr.metal + pr.crystal + pr.deuterium) as total
    FROM planets p
    LEFT JOIN planet_resources pr ON pr.planet_id = p.id
    WHERE p.user_id = $1 ORDER BY p.galaxy, p.solar_system, p.position
  `, [userId]);
  console.log(JSON.stringify(resources.rows, null, 2));

  // 15. Todas las naves del jugador (resumen)
  console.log('\n=== 15. TODAS LAS NAVES DEL JUGADOR ===');
  const allShips = await c.query(`
    SELECT p.name as planet_name, p.galaxy || ':' || p.solar_system || ':' || p.position as coords,
           st.code, st.name as ship_name, ps.quantity
    FROM planet_ships ps
    JOIN ship_types st ON st.id = ps.ship_type_id
    JOIN planets p ON p.id = ps.planet_id
    WHERE p.user_id = $1 AND ps.quantity > 0
    ORDER BY p.galaxy, p.solar_system, p.position, st.code
  `, [userId]);
  console.log(JSON.stringify(allShips.rows, null, 2));

  await c.end();
}

main().catch(e => { console.error(e); process.exit(1); });
