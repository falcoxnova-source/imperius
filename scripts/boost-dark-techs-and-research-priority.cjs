// 1) Regalar tecnologías base a dark@gmail.com para desbloquear naves.
// 2) Reordenar research_priority en bot_ai_tick para priorizar desbloqueo de flota.

const { Client } = require('pg');
const client = new Client({
  host: 'aws-1-eu-north-1.pooler.supabase.com', port: 6543,
  user: 'postgres.hhrgcnvydmjqcevgmlhj', password: 'Jfs.samsung1989*',
  database: 'postgres', ssl: { rejectUnauthorized: false },
});

async function main() {
  await client.connect();

  // ============================================================
  // PARTE 1: Regalar tecs a dark
  // ============================================================
  console.log('=== PARTE 1: Tecnologías para dark ===');
  const userId = (await client.query(`SELECT id FROM profiles WHERE email='dark@gmail.com'`)).rows[0].id;

  const techsToGrant = [
    { code: 'combustion_drive', level: 6 },
    { code: 'impulse_drive', level: 4 },
    { code: 'hyperspace_drive', level: 4 },
    { code: 'ion_tech', level: 2 },
    { code: 'armour_tech', level: 3 },
    { code: 'shielding_tech', level: 2 },
    { code: 'espionage_tech', level: 2 },
    { code: 'laser_tech', level: 3 },
    { code: 'computer_tech', level: 3 },
    { code: 'weapons_tech', level: 3 },
  ];

  for (const t of techsToGrant) {
    const tt = await client.query(`SELECT id FROM technology_types WHERE code=$1`, [t.code]);
    if (!tt.rows.length) { console.log(`  ⚠️  ${t.code} no existe`); continue; }
    await client.query(`
      INSERT INTO user_technologies (user_id, technology_type_id, level, is_researching)
      VALUES ($1, $2, $3, false)
      ON CONFLICT (user_id, technology_type_id) DO UPDATE
        SET level = GREATEST(user_technologies.level, EXCLUDED.level),
            is_researching = false
    `, [userId, tt.rows[0].id, t.level]);
    console.log(`  ✅ ${t.code} → L${t.level}`);
  }

  // ============================================================
  // PARTE 2: Parche de research_priority en bot_ai_tick
  // ============================================================
  console.log('\n=== PARTE 2: Reordenar prioridad research ===');
  const fn = await client.query(`SELECT prosrc FROM pg_proc WHERE proname='bot_ai_tick' LIMIT 1`);
  let src = fn.rows[0].prosrc;

  const oldPriority = `v_research_priority := ARRAY[
            'energy_tech',
            'combustion_drive',
            'espionage_tech',
            'computer_tech',
            'armour_tech',
            'weapons_tech',
            'shielding_tech',
            'impulse_drive',
            'laser_tech',
            'ion_tech',
            'astrophysics',
            'hyperspace_tech',
            'plasma_tech',
            'hyperspace_drive'
          ];`;

  const newPriority = `v_research_priority := ARRAY[
            'energy_tech',
            'combustion_drive',
            'armour_tech',
            'shielding_tech',
            'impulse_drive',
            'espionage_tech',
            'ion_tech',
            'laser_tech',
            'weapons_tech',
            'hyperspace_drive',
            'computer_tech',
            'astrophysics',
            'hyperspace_tech',
            'plasma_tech'
          ];`;

  if (!src.includes(oldPriority)) {
    console.log('  ⚠️  No se encontró el bloque original (puede haber cambiado formato)');
  } else {
    src = src.replace(oldPriority, newPriority);
    const sig = await client.query(`
      SELECT pg_get_function_identity_arguments(oid) AS args,
             pg_get_function_result(oid) AS result
      FROM pg_proc WHERE proname='bot_ai_tick' LIMIT 1
    `);
    await client.query(`
      CREATE OR REPLACE FUNCTION bot_ai_tick(${sig.rows[0].args})
      RETURNS ${sig.rows[0].result}
      LANGUAGE plpgsql
      AS $FUNC$
${src}
$FUNC$
    `);
    console.log('  ✅ Research priority actualizada');
    console.log('     Nuevo orden: energy → combustion → armour → shielding → impulse → espionage → ion → laser → weapons → hyperspace_drive → computer → astrophysics → hyperspace → plasma');
  }

  // ============================================================
  // PARTE 3: Tick de prueba
  // ============================================================
  console.log('\n=== Tick de prueba ===');
  const tickRes = await client.query(`SELECT bot_ai_tick()`);
  console.log('  ' + JSON.stringify(tickRes.rows[0].bot_ai_tick));

  // ============================================================
  // PARTE 4: Verificar colas de naves de dark
  // ============================================================
  console.log('\n=== Colas de naves dark tras tick ===');
  const queues = await client.query(`
    SELECT p.name, st.code, sq.quantity, sq.created_at
    FROM shipyard_queue sq
    JOIN planets p ON p.id=sq.planet_id
    JOIN ship_types st ON st.id=sq.ship_type_id
    WHERE p.user_id=$1 AND sq.item_type='ship'
    ORDER BY sq.created_at DESC LIMIT 10
  `, [userId]);
  queues.rows.forEach(q => console.log(`  ${q.name.padEnd(22)} ${q.code.padEnd(20)} x${q.quantity}`));

  await client.end();
}

main().catch(async e => { console.error('❌', e.message); try{await client.end();}catch{}; process.exit(1); });
