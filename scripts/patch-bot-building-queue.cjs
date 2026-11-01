const { Client } = require('pg');

const client = new Client({
  host: 'aws-1-eu-north-1.pooler.supabase.com',
  port: 6543,
  user: 'postgres.hhrgcnvydmjqcevgmlhj',
  password: 'Jfs.samsung1989*',
  database: 'postgres',
  ssl: { rejectUnauthorized: false }
});

async function patch() {
  await client.connect();
  console.log('✅ Conectado');

  const result = await client.query("SELECT prosrc, prorettype::regtype AS return_type FROM pg_proc WHERE proname = 'bot_ai_tick'");
  if (!result.rows.length) {
    throw new Error('bot_ai_tick no encontrada');
  }

  let src = result.rows[0].prosrc;
  const returnType = result.rows[0].return_type;

  if (src.includes('v_max_build_queue integer := 3;') && src.includes('v_has_commander boolean := false;')) {
    console.log('ℹ️ El parche de cola ya parece aplicado');
    await client.end();
    return;
  }

  src = src.replace(
    /  v_game_speed integer;\r?\n  v_bots_processed integer := 0;/,
    `  v_game_speed integer;\n  v_has_commander boolean := false;\n  v_max_build_queue integer := 3;\n  v_next_queue_position integer := 1;\n  v_queue_anchor_end_time timestamptz;\n  v_bots_processed integer := 0;`
  );

  if (!src.includes('v_has_commander boolean := false;')) {
    throw new Error('No pude insertar las declaraciones nuevas');
  }

  src = src.replace(
    /      -- Phase A: Buildings\r?\n      SELECT COUNT\(\*\) INTO v_queued_count\r?\n      FROM building_queue WHERE planet_id = v_planet.id;\r?\n\r?\n      IF v_queued_count = 0 THEN/,
    `      -- Phase A: Buildings\n      SELECT EXISTS (\n        SELECT 1\n        FROM user_officers uo\n        JOIN officer_types ot ON ot.id = uo.officer_type_id\n        WHERE uo.user_id = v_bot.id\n          AND ot.code = 'commander'\n          AND uo.expires_at > now()\n      ) INTO v_has_commander;\n\n      v_max_build_queue := CASE WHEN v_has_commander THEN 5 ELSE 3 END;\n\n      SELECT COUNT(*) INTO v_queued_count\n      FROM building_queue WHERE planet_id = v_planet.id;\n\n      IF v_queued_count < v_max_build_queue THEN`
  );

  if (!src.includes('v_max_build_queue := CASE WHEN v_has_commander THEN 5 ELSE 3 END;')) {
    throw new Error('No pude parchear la validación de slots de la cola');
  }

  src = src.replace(
    /            v_try_bt RECORD;\r?\n            v_building_wish_list text\[\];\r?\n            v_bw_idx integer;\r?\n            v_building_queued boolean := false;/,
    `            v_try_bt RECORD;\n            v_building_wish_list text[];\n            v_bw_idx integer;\n            v_build_slots_left integer := 0;\n            v_building_queued boolean := false;`
  );

  if (!src.includes('v_build_slots_left integer := 0;')) {
    throw new Error('No pude agregar la variable de slots');
  }

  src = src.replace(
    /            FOR v_bw_idx IN 1\.\.COALESCE\(array_length\(v_building_wish_list, 1\), 0\) LOOP\r?\n              EXIT WHEN v_building_queued;\r?\n              SELECT \* INTO v_try_bt FROM building_types WHERE code = v_building_wish_list\[v_bw_idx\];/,
    `            v_build_slots_left := GREATEST(0, v_max_build_queue - v_queued_count);\n\n            IF v_build_slots_left > 0 THEN\n              SELECT COALESCE(MAX(queue_position), 0), MAX(end_time)\n              INTO v_next_queue_position, v_queue_anchor_end_time\n              FROM building_queue\n              WHERE planet_id = v_planet.id;\n\n              v_next_queue_position := COALESCE(v_next_queue_position, 0) + 1;\n            END IF;\n\n            FOR v_bw_idx IN 1..COALESCE(array_length(v_building_wish_list, 1), 0) LOOP\n              EXIT WHEN v_build_slots_left <= 0;\n              SELECT * INTO v_try_bt FROM building_types WHERE code = v_building_wish_list[v_bw_idx];`
  );

  if (!src.includes('v_build_slots_left := GREATEST(0, v_max_build_queue - v_queued_count);')) {
    throw new Error('No pude parchear el loop de construcción');
  }

  src = src.replace(
    /                INSERT INTO building_queue \(planet_id, building_type_id, target_level, metal_cost, crystal_cost, deuterium_cost, build_time, queue_position, start_time, end_time\)\r?\n                VALUES \(v_planet.id, v_try_bt.id, v_target_level, v_cost_metal, v_cost_crystal, v_cost_deuterium, v_build_time, 1, now\(\), now\(\) \+ \(v_build_time \|\| ' seconds'\)::interval\);\r?\n                v_buildings_queued := v_buildings_queued \+ 1;\r?\n                v_building_queued := true;\r?\n                SELECT \* INTO v_resources FROM planet_resources WHERE planet_id = v_planet.id;/,
    `                INSERT INTO building_queue (planet_id, building_type_id, target_level, metal_cost, crystal_cost, deuterium_cost, build_time, queue_position, start_time, end_time)\n                VALUES (\n                  v_planet.id,\n                  v_try_bt.id,\n                  v_target_level,\n                  v_cost_metal,\n                  v_cost_crystal,\n                  v_cost_deuterium,\n                  v_build_time,\n                  v_next_queue_position,\n                  COALESCE(v_queue_anchor_end_time, now()),\n                  COALESCE(v_queue_anchor_end_time, now()) + (v_build_time || ' seconds')::interval\n                );\n                v_buildings_queued := v_buildings_queued + 1;\n                v_building_queued := true;\n                v_build_slots_left := v_build_slots_left - 1;\n                v_queued_count := v_queued_count + 1;\n                v_queue_anchor_end_time := COALESCE(v_queue_anchor_end_time, now()) + (v_build_time || ' seconds')::interval;\n                v_next_queue_position := v_next_queue_position + 1;\n                SELECT * INTO v_resources FROM planet_resources WHERE planet_id = v_planet.id;`
  );

  if (!src.includes('v_next_queue_position := v_next_queue_position + 1;')) {
    throw new Error('No pude parchear el INSERT de la cola');
  }

  await client.query(`CREATE OR REPLACE FUNCTION bot_ai_tick() RETURNS ${returnType} LANGUAGE plpgsql SECURITY DEFINER AS $func$${src}$func$;`);

  const verify = await client.query("SELECT prosrc FROM pg_proc WHERE proname = 'bot_ai_tick'");
  const verified = verify.rows[0].prosrc.includes("v_max_build_queue := CASE WHEN v_has_commander THEN 5 ELSE 3 END;");
  console.log(verified ? '✅ Parche aplicado correctamente' : '❌ No se pudo verificar el parche');

  await client.end();
}

patch().catch(async (error) => {
  console.error('❌ Error:', error.message);
  try { await client.end(); } catch {}
  process.exit(1);
});
