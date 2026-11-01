// Añade logs temporales a Phase H miner para ver por qué no dispara
const { Client } = require('pg');
const client = new Client({host:'aws-1-eu-north-1.pooler.supabase.com',port:6543,user:'postgres.hhrgcnvydmjqcevgmlhj',password:'Jfs.samsung1989*',database:'postgres',ssl:{rejectUnauthorized:false}});

(async () => {
  await client.connect();
  const fn = await client.query(`
    SELECT p.prosrc, pg_get_function_identity_arguments(p.oid) AS args, pg_get_function_result(p.oid) AS result
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE p.proname='bot_ai_tick' AND n.nspname='public' LIMIT 1
  `);
  let src = fn.rows[0].prosrc;

  // Normalizar line endings a \n para que los replace funcionen
  src = src.replace(/\r\n/g, '\n');

  // Inyectar log justo después del IF principal de Phase H y antes del inner IF
  const marker = `        AND v_planet_role <> 'military' THEN
        SELECT COALESCE(ps.quantity, 0) INTO v_small_cargo_count FROM planet_ships ps WHERE ps.planet_id = v_planet.id AND ps.ship_type_id = v_small_cargo_type_id;`;
  const injected = `        AND v_planet_role <> 'military' THEN
        PERFORM log_autopilot_event(v_bot.id, v_planet.id, 'phaseH_entered', jsonb_build_object('role', v_planet_role, 'active_fleets', v_origin_active_fleets, 'fleet_action_taken', v_fleet_action_taken));
        SELECT COALESCE(ps.quantity, 0) INTO v_small_cargo_count FROM planet_ships ps WHERE ps.planet_id = v_planet.id AND ps.ship_type_id = v_small_cargo_type_id;`;

  if (!src.includes(marker)) {
    console.log('❌ marker no encontrado, buscando contexto...');
    const idx = src.indexOf("AND v_planet_role <> 'military' THEN");
    console.log('contexto:', src.slice(idx - 50, idx + 500));
    process.exit(1);
  }
  src = src.replace(marker, injected);

  // También loggear cuando encuentra destino
  src = src.replace(
    `            IF v_transport_done THEN EXIT; END IF;
            SELECT * INTO v_other_resources FROM planet_resources WHERE planet_id = v_other_planet.id;`,
    `            IF v_transport_done THEN EXIT; END IF;
            PERFORM log_autopilot_event(v_bot.id, v_planet.id, 'phaseH_candidate', jsonb_build_object('target_id', v_other_planet.id, 'target_role', v_other_planet.role));
            SELECT * INTO v_other_resources FROM planet_resources WHERE planet_id = v_other_planet.id;`
  );

  // Y cuando pasa la condición de envío
  src = src.replace(
    `              IF (v_send_metal + v_send_crystal + v_send_deut) >= (CASE WHEN v_planet_role = 'miner' THEN 1000 ELSE 5000 END) THEN`,
    `              PERFORM log_autopilot_event(v_bot.id, v_planet.id, 'phaseH_attempt', jsonb_build_object('target_id', v_other_planet.id, 'send_m', v_send_metal, 'send_c', v_send_crystal, 'send_d', v_send_deut, 'cap', v_cargo_capacity, 'small', v_small_cargo_count, 'large', v_large_cargo_count));
              IF (v_send_metal + v_send_crystal + v_send_deut) >= (CASE WHEN v_planet_role = 'miner' THEN 1000 ELSE 5000 END) THEN`
  );

  // Loggear resultado de secure_send_fleet
  src = src.replace(
    `                IF COALESCE((v_fleet_result->>'success')::boolean, false) THEN
                  v_fleets_sent := v_fleets_sent + 1;
                  v_transports_sent := v_transports_sent + 1;
                  PERFORM log_autopilot_event(v_bot.id, v_planet.id, 'transport_sent',`,
    `                PERFORM log_autopilot_event(v_bot.id, v_planet.id, 'phaseH_result', jsonb_build_object('target_id', v_other_planet.id, 'result', v_fleet_result));
                IF COALESCE((v_fleet_result->>'success')::boolean, false) THEN
                  v_fleets_sent := v_fleets_sent + 1;
                  v_transports_sent := v_transports_sent + 1;
                  PERFORM log_autopilot_event(v_bot.id, v_planet.id, 'transport_sent',`
  );

  await client.query(`
    CREATE OR REPLACE FUNCTION public.bot_ai_tick(${fn.rows[0].args})
    RETURNS ${fn.rows[0].result}
    LANGUAGE plpgsql
    AS $FUNC_FXU$
${src}
$FUNC_FXU$;
  `);
  console.log('✅ Logs de diagnóstico inyectados en Phase H');

  // Ejecutar tick
  const before = new Date();
  const t = await client.query(`SELECT bot_ai_tick() AS r`);
  console.log('Tick:', JSON.stringify(t.rows[0].r));

  // Mostrar eventos phaseH_* de NOVA y PIPI
  const ev = await client.query(`
    SELECT e.created_at, pr.username, p.name AS planet, e.event_type, e.payload
    FROM autopilot_events e
    JOIN profiles pr ON pr.id = e.user_id
    LEFT JOIN planets p ON p.id = e.planet_id
    WHERE e.user_id IN ('9700c4e0-d0e4-4efa-baf7-e9cb97945b16','50da268b-d729-4f06-b8af-e03aa0437c1f')
      AND e.created_at >= $1
      AND e.event_type LIKE 'phaseH%'
    ORDER BY e.created_at DESC, pr.username, p.name
  `, [before]);
  console.log('Eventos Phase H:');
  for (const r of ev.rows) {
    console.log(`  [${r.username}] ${r.planet || '?'} ${r.event_type}:`, JSON.stringify(r.payload));
  }

  await client.end();
})().catch(e => { console.error(e); process.exit(1); });
