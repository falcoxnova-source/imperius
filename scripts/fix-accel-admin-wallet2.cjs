const { Client } = require('pg');

const client = new Client({
  host: 'aws-1-eu-north-1.pooler.supabase.com',
  port: 6543,
  user: 'postgres.hhrgcnvydmjqcevgmlhj',
  password: 'Jfs.samsung1989*',
  database: 'postgres',
  ssl: { rejectUnauthorized: false }
});

async function main() {
  await client.connect();

  // 1. Exact loss
  const lossRes = await client.query(`
    SELECT COUNT(*) as total_ops, SUM(amount) as total_lost
    FROM admin_revenue WHERE revenue_type = 'fleet_acceleration'
  `);
  const totalLost = parseFloat(lossRes.rows[0].total_lost);
  console.log(`🔴 TOTAL PERDIDO: ${totalLost.toFixed(2)} FXU (${lossRes.rows[0].total_ops} operaciones)\n`);

  // 2. Get admin
  const adminRes = await client.query(`
    SELECT id, username, fxu_balance FROM profiles WHERE is_admin = true ORDER BY created_at ASC LIMIT 1
  `);
  const admin = adminRes.rows[0];
  console.log(`Admin: ${admin.username} | Balance antes: ${parseFloat(admin.fxu_balance).toFixed(2)} FXU`);

  // 3. Credit using a DO block that calls _internal_set_fxu_context first
  console.log('\n=== ACREDITANDO FXU PERDIDOS AL ADMIN ===');
  await client.query(`
    DO $$
    BEGIN
      PERFORM _internal_set_fxu_context();
      UPDATE profiles SET fxu_balance = fxu_balance + ${totalLost} WHERE id = '${admin.id}';
    END $$;
  `);
  
  const afterRes = await client.query(`SELECT fxu_balance FROM profiles WHERE id = $1`, [admin.id]);
  console.log(`✅ Acreditados ${totalLost.toFixed(2)} FXU al admin`);
  console.log(`Balance después: ${parseFloat(afterRes.rows[0].fxu_balance).toFixed(2)} FXU`);

  // 4. Fix accelerate_fleet function
  console.log('\n=== CORRIGIENDO FUNCIÓN accelerate_fleet ===');
  await client.query(`
    CREATE OR REPLACE FUNCTION public.accelerate_fleet(p_fleet_id uuid)
    RETURNS jsonb
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path TO 'public'
    AS $function$
    DECLARE
      v_user_id uuid;
      v_fleet fleets%ROWTYPE;
      v_fxu_cost integer;
      v_current_fxu numeric;
      v_jackpot_percent numeric;
      v_jackpot_amount numeric;
      v_revenue_amount numeric;
      v_target_planet planets%ROWTYPE;
      v_defender_id uuid;
      v_origin_coords text;
      v_is_hostile boolean;
      v_one_way_flight_interval interval;
      v_admin_id uuid;
    BEGIN
      v_user_id := auth.uid();

      IF v_user_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'No autenticado');
      END IF;

      SELECT * INTO v_fleet FROM fleets WHERE id = p_fleet_id FOR UPDATE;

      IF v_fleet IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Flota no encontrada');
      END IF;

      IF v_fleet.user_id != v_user_id THEN
        RETURN jsonb_build_object('success', false, 'error', 'No eres el propietario de esta flota');
      END IF;

      IF v_fleet.is_completed THEN
        RETURN jsonb_build_object('success', false, 'error', 'La flota ya ha llegado');
      END IF;

      IF v_fleet.acs_id IS NOT NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'No se puede acelerar flotas en ataque grupal (ACS)');
      END IF;

      v_fxu_cost := calculate_fxu_cost_fleet(p_fleet_id);

      IF v_fxu_cost <= 0 THEN
        RETURN jsonb_build_object('success', false, 'error', 'La flota esta a punto de llegar');
      END IF;

      SELECT fxu_balance INTO v_current_fxu FROM profiles WHERE id = v_user_id;

      IF v_current_fxu IS NULL OR v_current_fxu < v_fxu_cost THEN
        RETURN jsonb_build_object(
          'success', false,
          'error', 'FXU insuficiente. Necesitas ' || v_fxu_cost || ' FXU (tienes ' || COALESCE(v_current_fxu, 0)::integer || ')'
        );
      END IF;

      SELECT COALESCE(value::numeric, 49) INTO v_jackpot_percent
      FROM game_settings WHERE key = 'fleet_acceleration_jackpot_percent';

      IF v_jackpot_percent < 0 THEN v_jackpot_percent := 0; END IF;
      IF v_jackpot_percent > 100 THEN v_jackpot_percent := 100; END IF;

      v_jackpot_amount := FLOOR(v_fxu_cost * v_jackpot_percent / 100);
      v_revenue_amount := v_fxu_cost - v_jackpot_amount;

      PERFORM _internal_set_fxu_context();

      -- Deduct from user
      UPDATE profiles SET fxu_balance = fxu_balance - v_fxu_cost WHERE id = v_user_id;

      -- Credit admin wallet
      SELECT id INTO v_admin_id FROM profiles WHERE is_admin = true ORDER BY created_at ASC LIMIT 1;
      IF v_admin_id IS NOT NULL AND v_revenue_amount > 0 THEN
        UPDATE profiles SET fxu_balance = fxu_balance + v_revenue_amount WHERE id = v_admin_id;
      END IF;

      -- Record revenue for tracking
      IF v_revenue_amount > 0 THEN
        INSERT INTO admin_revenue (revenue_type, amount, related_user_id, description)
        VALUES ('fleet_acceleration', v_revenue_amount, v_user_id,
          'Aceleracion de flota ' || v_fleet.mission_type ||
          CASE WHEN v_fleet.is_returning THEN ' (regreso)' ELSE '' END
        );
      END IF;

      -- Jackpot contribution
      IF v_jackpot_amount > 0 THEN
        PERFORM contribute_to_jackpot(v_jackpot_amount, 'fleet_acceleration', v_user_id);
      END IF;

      -- Alert defender if hostile fleet
      v_is_hostile := v_fleet.mission_type IN ('attack', 'espionage', 'acs_attack') AND NOT v_fleet.is_returning;

      IF v_is_hostile THEN
        SELECT p.* INTO v_target_planet
        FROM planets p
        WHERE p.galaxy = v_fleet.target_galaxy
          AND p.solar_system = v_fleet.target_system
          AND p.position = v_fleet.target_position
        LIMIT 1;

        IF v_target_planet IS NOT NULL AND v_target_planet.user_id != v_user_id THEN
          v_defender_id := v_target_planet.user_id;

          SELECT '[' || p.galaxy || ':' || p.solar_system || ':' || p.position || ']' INTO v_origin_coords
          FROM planets p WHERE p.id = v_fleet.origin_planet_id;

          INSERT INTO messages (recipient_id, sender_name, subject, body, message_type)
          VALUES (
            v_defender_id,
            'Sistema de Defensa',
            'ALERTA: Flota hostil acelerada',
            'Una flota hostil de tipo "' || v_fleet.mission_type || '" procedente de ' || COALESCE(v_origin_coords, 'coordenadas desconocidas') ||
            ' ha sido ACELERADA y llegara antes de lo previsto a tu planeta en [' ||
            v_fleet.target_galaxy || ':' || v_fleet.target_system || ':' || v_fleet.target_position || '].' ||
            E'\\n\\nPrepara tus defensas inmediatamente.',
            'combat'
          );
        END IF;
      END IF;

      -- Update fleet times
      IF v_fleet.is_returning THEN
        UPDATE fleets SET return_time = now() - interval '1 second' WHERE id = p_fleet_id;
      ELSE
        v_one_way_flight_interval := v_fleet.arrival_time - v_fleet.departure_time;
        UPDATE fleets
        SET arrival_time = now() - interval '1 second',
            return_time = now() + v_one_way_flight_interval
        WHERE id = p_fleet_id;
      END IF;

      -- Process arrival with triggers disabled for performance
      ALTER TABLE fleet_ships DISABLE TRIGGER trigger_fleet_ships_change_points;
      ALTER TABLE fleets DISABLE TRIGGER trigger_fleet_change_points;
      ALTER TABLE planet_ships DISABLE TRIGGER trigger_fleet_points;
      ALTER TABLE planet_defenses DISABLE TRIGGER trigger_defense_points;
      ALTER TABLE planet_buildings DISABLE TRIGGER trigger_building_points;

      PERFORM process_fleet_arrival(p_fleet_id);

      ALTER TABLE fleet_ships ENABLE TRIGGER trigger_fleet_ships_change_points;
      ALTER TABLE fleets ENABLE TRIGGER trigger_fleet_change_points;
      ALTER TABLE planet_ships ENABLE TRIGGER trigger_fleet_points;
      ALTER TABLE planet_defenses ENABLE TRIGGER trigger_defense_points;
      ALTER TABLE planet_buildings ENABLE TRIGGER trigger_building_points;

      PERFORM update_player_points(v_user_id);
      IF v_defender_id IS NOT NULL THEN
        PERFORM update_player_points(v_defender_id);
      END IF;

      -- If fleet is now returning after processing outbound, accelerate return too
      UPDATE fleets
      SET return_time = now() - interval '1 second'
      WHERE id = p_fleet_id
        AND is_returning = true
        AND is_completed = false;

      IF FOUND THEN
        ALTER TABLE fleet_ships DISABLE TRIGGER trigger_fleet_ships_change_points;
        ALTER TABLE fleets DISABLE TRIGGER trigger_fleet_change_points;
        ALTER TABLE planet_ships DISABLE TRIGGER trigger_fleet_points;
        ALTER TABLE planet_defenses DISABLE TRIGGER trigger_defense_points;
        ALTER TABLE planet_buildings DISABLE TRIGGER trigger_building_points;

        PERFORM process_fleet_arrival(p_fleet_id);

        ALTER TABLE fleet_ships ENABLE TRIGGER trigger_fleet_ships_change_points;
        ALTER TABLE fleets ENABLE TRIGGER trigger_fleet_change_points;
        ALTER TABLE planet_ships ENABLE TRIGGER trigger_fleet_points;
        ALTER TABLE planet_defenses ENABLE TRIGGER trigger_defense_points;
        ALTER TABLE planet_buildings ENABLE TRIGGER trigger_building_points;

        PERFORM update_player_points(v_user_id);
        IF v_defender_id IS NOT NULL THEN
          PERFORM update_player_points(v_defender_id);
        END IF;
      END IF;

      RETURN jsonb_build_object(
        'success', true,
        'message', 'Flota acelerada exitosamente',
        'fxu_spent', v_fxu_cost,
        'jackpot_contribution', v_jackpot_amount
      );
    END;
    $function$;
  `);
  console.log('✅ Función accelerate_fleet corregida');

  // 5. Final verify
  const finalRes = await client.query(`SELECT fxu_balance FROM profiles WHERE id = $1`, [admin.id]);
  console.log(`\n=== RESULTADO FINAL ===`);
  console.log(`Admin balance: ${parseFloat(finalRes.rows[0].fxu_balance).toFixed(2)} FXU`);
  console.log('✅ TODO CORREGIDO');

  await client.end();
}

main().catch(e => { console.error(e); process.exit(1); });
