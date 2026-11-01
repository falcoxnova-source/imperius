const { Client } = require('pg');
const client = new Client({
  host: 'aws-1-eu-north-1.pooler.supabase.com', port: 6543,
  user: 'postgres.hhrgcnvydmjqcevgmlhj', password: 'Jfs.samsung1989*',
  database: 'postgres', ssl: { rejectUnauthorized: false },
});

async function main() {
  await client.connect();

  console.log('\n=== 1) Funciones relacionadas a combate/velocidad en DB ===');
  const fns = await client.query(`
    SELECT proname FROM pg_proc 
    WHERE proname IN ('fleet_calc_ship_speed','calculate_battle_result','resolve_combat','battle_round','execute_battle','process_combat')
    ORDER BY proname
  `);
  console.log(fns.rows.map(r => r.proname).join(', '));

  console.log('\n=== 2) fleet_calc_ship_speed (fórmula de velocidad) ===');
  const speedFn = await client.query(`SELECT prosrc FROM pg_proc WHERE proname='fleet_calc_ship_speed' LIMIT 1`);
  if (speedFn.rows[0]) console.log(speedFn.rows[0].prosrc);

  console.log('\n=== 3) Firma fleet_calc_ship_speed ===');
  const sig = await client.query(`SELECT pg_get_function_identity_arguments(oid) AS a FROM pg_proc WHERE proname='fleet_calc_ship_speed'`);
  console.log('  args:', sig.rows[0].a);

  console.log('\n=== 3b) TEST velocidad ===');
  const t1 = await client.query(`SELECT fleet_calc_ship_speed('light_fighter', 12500, 10, 0, 0) AS v`);
  console.log('light_fighter (12500) + combustion 10 =>', t1.rows[0].v, '(esperado 25000)');
  const t2 = await client.query(`SELECT fleet_calc_ship_speed('cruiser', 15000, 0, 10, 0) AS v`);
  console.log('cruiser (15000) + impulse 10 =>', t2.rows[0].v, '(esperado 45000)');
  const t3 = await client.query(`SELECT fleet_calc_ship_speed('destroyer', 10000, 0, 0, 10) AS v`);
  console.log('destroyer (10000) + hyperspace 10 =>', t3.rows[0].v, '(esperado 40000)');
  const t0 = await client.query(`SELECT fleet_calc_ship_speed('light_fighter', 12500, 0, 0, 0) AS v`);
  console.log('light_fighter sin tecs =>', t0.rows[0].v, '(esperado 12500)');
  const t5 = await client.query(`SELECT fleet_calc_ship_speed('battleship', 10000, 10, 5, 0) AS v`);
  console.log('battleship (10000) + impulse 5 (ignora combustion) =>', t5.rows[0].v, '(esperado 10000*1.5=15000)');

  console.log('\n=== 4) Combate: firmas ===');
  const battle = await client.query(`
    SELECT proname, pg_get_function_identity_arguments(oid) AS args
    FROM pg_proc 
    WHERE proname ILIKE '%battle%' OR proname ILIKE '%combat%'
    ORDER BY proname
  `);
  battle.rows.forEach(r => console.log(`  ${r.proname}(${r.args})`));

  console.log('\n=== 5) Buscar fórmulas con weapons_tech / shielding_tech / armour_tech ===');
  const bonus = await client.query(`
    SELECT proname 
    FROM pg_proc 
    WHERE prosrc ILIKE '%weapons_tech%' AND prosrc ILIKE '%weapon_power%' AND prosrc ILIKE '%1 + %'
    ORDER BY proname
  `);
  console.log('Funciones que aplican bonus de tec al weapon_power:');
  bonus.rows.forEach(r => console.log('  -', r.proname));

  await client.end();
}

main().catch(e => { console.error('❌', e.message); process.exit(1); });
