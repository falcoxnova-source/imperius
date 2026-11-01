const { Client } = require('pg');
const c = new Client({
  host: 'aws-1-eu-north-1.pooler.supabase.com', port: 6543,
  database: 'postgres', user: 'postgres.hhrgcnvydmjqcevgmlhj',
  password: 'Jfs.samsung1989*', ssl: { rejectUnauthorized: false }
});

(async () => {
  await c.connect();

  // Find user by email
  const r1 = await c.query(`
    SELECT p.id, p.username, p.fxu_balance, au.email
    FROM profiles p
    JOIN auth.users au ON au.id = p.id
    WHERE au.email = 'gentlemediatv@gmail.com'
  `);

  if (r1.rows.length === 0) {
    console.log('❌ Usuario no encontrado con ese email');
    await c.end();
    return;
  }

  const user = r1.rows[0];
  console.log('=== USUARIO ===');
  console.log(`ID: ${user.id}`);
  console.log(`Username: ${user.username}`);
  console.log(`Email: ${user.email}`);
  console.log(`FXU Balance: ${user.fxu_balance}`);

  // Check current research levels (terraformer related)
  const r2 = await c.query(`
    SELECT r.internal_name, r.name, ur.level
    FROM user_research ur
    JOIN research r ON r.id = ur.research_id
    WHERE ur.user_id = $1
    ORDER BY r.internal_name
  `, [user.id]);

  console.log('\n=== INVESTIGACIONES DEL USUARIO ===');
  r2.rows.forEach(r => {
    console.log(`${r.internal_name} (${r.name}) = nivel ${r.level}`);
  });

  // Check what terraformer needs - look at research/buildings tables
  const r3 = await c.query(`
    SELECT id, internal_name, name, requirements
    FROM research
    WHERE internal_name ILIKE '%terraform%' OR name ILIKE '%terraform%'
  `);

  console.log('\n=== RESEARCH: TERRAFORMER ===');
  r3.rows.forEach(r => {
    console.log(`ID: ${r.id} | ${r.internal_name} | ${r.name}`);
    console.log(`Requirements: ${JSON.stringify(r.requirements)}`);
  });

  // Check buildings for terraformer
  const r4 = await c.query(`
    SELECT id, internal_name, name, requirements
    FROM buildings
    WHERE internal_name ILIKE '%terraform%' OR name ILIKE '%terraform%'
  `);

  console.log('\n=== BUILDING: TERRAFORMER ===');
  r4.rows.forEach(b => {
    console.log(`ID: ${b.id} | ${b.internal_name} | ${b.name}`);
    console.log(`Requirements: ${JSON.stringify(b.requirements)}`);
  });

  // Check user's current buildings on all planets
  const r5 = await c.query(`
    SELECT pl.id as planet_id, pl.name as planet_name, pl.galaxy, pl.system, pl.position,
           pb.building_id, b.internal_name, b.name, pb.level
    FROM planets pl
    LEFT JOIN planet_buildings pb ON pb.planet_id = pl.id
    LEFT JOIN buildings b ON b.id = pb.building_id
    WHERE pl.user_id = $1
    ORDER BY pl.id, b.internal_name
  `, [user.id]);

  console.log('\n=== PLANETAS Y EDIFICIOS DEL USUARIO ===');
  let currentPlanet = '';
  r5.rows.forEach(r => {
    if (r.planet_name !== currentPlanet) {
      currentPlanet = r.planet_name;
      console.log(`\n--- ${r.planet_name} [${r.galaxy}:${r.system}:${r.position}] (${r.planet_id}) ---`);
    }
    if (r.internal_name) {
      console.log(`  ${r.internal_name} = nivel ${r.level}`);
    }
  });

  await c.end();
})();
