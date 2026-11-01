const { Client } = require('pg');
const client = new Client({
  host: 'aws-1-eu-north-1.pooler.supabase.com',
  port: 6543,
  user: 'postgres.hhrgcnvydmjqcevgmlhj',
  password: 'Jfs.samsung1989*',
  database: 'postgres',
  ssl: { rejectUnauthorized: false }
});

async function run() {
  await client.connect();
  
  // 1. Find user
  const user = await client.query("SELECT id, username, email FROM profiles WHERE email = 'armandobejarano20@gmail.com'");
  console.log('=== USUARIO ===');
  console.log(JSON.stringify(user.rows, null, 2));
  
  if (user.rows.length > 0) {
    const userId = user.rows[0].id;
    
    // 2. All planets of this user
    const planets = await client.query("SELECT id, name, galaxy, system, planet, is_main_planet, is_destroyed FROM planets WHERE user_id = $1 ORDER BY galaxy, system, planet", [userId]);
    console.log('\n=== PLANETAS DEL USUARIO ===');
    planets.rows.forEach(p => {
      console.log(`  ${p.name} [${p.galaxy}:${p.system}:${p.planet}] ${p.is_main_planet ? '(PRINCIPAL)' : ''} ${p.is_destroyed ? '(DESTRUIDO)' : ''} id=${p.id}`);
    });
    
    // 3. Check source planets
    const source1 = await client.query("SELECT id, name, user_id, galaxy, system, planet FROM planets WHERE galaxy=3 AND system=162 AND planet=7");
    console.log('\n=== PLANETA EN 3:162:7 ===');
    console.log(JSON.stringify(source1.rows, null, 2));
    
    const source2 = await client.query("SELECT id, name, user_id, galaxy, system, planet FROM planets WHERE galaxy=3 AND system=162 AND planet=11");
    console.log('\n=== PLANETA EN 3:162:11 ===');
    console.log(JSON.stringify(source2.rows, null, 2));
    
    // 4. Check destination coordinates are FREE
    const dest1 = await client.query("SELECT id, name, user_id, galaxy, system, planet FROM planets WHERE galaxy=2 AND system=265 AND planet=15");
    console.log('\n=== DESTINO 2:265:15 (debe estar vacio) ===');
    console.log(dest1.rows.length === 0 ? '  ✅ LIBRE' : JSON.stringify(dest1.rows, null, 2));
    
    const dest2 = await client.query("SELECT id, name, user_id, galaxy, system, planet FROM planets WHERE galaxy=4 AND system=214 AND planet=15");
    console.log('\n=== DESTINO 4:214:15 (debe estar vacio) ===');
    console.log(dest2.rows.length === 0 ? '  ✅ LIBRE' : JSON.stringify(dest2.rows, null, 2));
    
    // 5. Check active fleets involving these planets
    const fleets = await client.query(`
      SELECT id, mission_type, status, 
             start_galaxy, start_system, start_planet,
             end_galaxy, end_system, end_planet,
             arrival_time, return_time
      FROM fleets 
      WHERE user_id = $1
        AND status NOT IN ('completed','returned','cancelled')
    `, [userId]);
    console.log('\n=== FLOTAS ACTIVAS DEL USUARIO ===');
    if (fleets.rows.length === 0) {
      console.log('  ✅ Sin flotas activas');
    } else {
      fleets.rows.forEach(f => {
        console.log(`  Flota ${f.id}: ${f.mission_type} ${f.status} [${f.start_galaxy}:${f.start_system}:${f.start_planet}] -> [${f.end_galaxy}:${f.end_system}:${f.end_planet}]`);
      });
    }
    
    // 6. Check fleets from OTHER players targeting these coords
    const incomingFleets = await client.query(`
      SELECT id, user_id, mission_type, status,
             start_galaxy, start_system, start_planet,
             end_galaxy, end_system, end_planet
      FROM fleets 
      WHERE ((end_galaxy=3 AND end_system=162 AND end_planet IN (7,11))
          OR (start_galaxy=3 AND start_system=162 AND start_planet IN (7,11)))
        AND user_id != $1
        AND status NOT IN ('completed','returned','cancelled')
    `, [userId]);
    console.log('\n=== FLOTAS ENTRANTES DE OTROS JUGADORES ===');
    if (incomingFleets.rows.length === 0) {
      console.log('  ✅ Sin flotas entrantes');
    } else {
      incomingFleets.rows.forEach(f => {
        console.log(`  ⚠️ Flota ${f.id}: ${f.mission_type} de user ${f.user_id} [${f.start_galaxy}:${f.start_system}:${f.start_planet}] -> [${f.end_galaxy}:${f.end_system}:${f.end_planet}]`);
      });
    }
  } else {
    console.log('❌ Usuario no encontrado');
  }
  
  await client.end();
}
run().catch(e => console.error(e));
