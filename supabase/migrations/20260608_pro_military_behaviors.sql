-- =====================================================================
-- PRO MILITARY BEHAVIORS: IPM, Inactive Farming, Phalanx
-- Runs alongside bot_ai_tick without modifying it
-- =====================================================================

-- PHASE 1: Launch IPM attacks to soften defenses before main attack
CREATE OR REPLACE FUNCTION bot_launch_ipm_attacks()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_bot RECORD;
  v_planet RECORD;
  v_target RECORD;
  v_ipm_count integer;
  v_ipm_type_id integer;
  v_abm_type_id integer;
  v_silo_level integer;
  v_spy RECORD;
  v_defense_power integer;
  v_missiles_to_send integer;
  v_fleet_result jsonb;
BEGIN
  SELECT id INTO v_ipm_type_id FROM defense_types WHERE code = 'interplanetary_missile' LIMIT 1;
  IF v_ipm_type_id IS NULL THEN RETURN; END IF;

  FOR v_bot IN SELECT id FROM profiles WHERE (is_bot = true OR autopilot_active = true) AND is_banned = false LOOP
    FOR v_planet IN
      SELECT p.*, COALESCE(pd.quantity, 0) as ipm_qty,
             COALESCE(pb.level, 0) as silo_level
      FROM planets p
      LEFT JOIN planet_defenses pd ON pd.planet_id = p.id AND pd.defense_type_id = v_ipm_type_id
      LEFT JOIN planet_buildings pb ON pb.planet_id = p.id AND pb.building_type_id = (SELECT id FROM building_types WHERE code = 'missile_silo' LIMIT 1)
      WHERE p.user_id = v_bot.id
        AND p.planet_type = 'planet'
        AND COALESCE(pd.quantity, 0) >= 3
        AND COALESCE(pb.level, 0) >= 2
      LIMIT 5
    LOOP
      -- Find targets with heavy defenses (from spy reports <24h)
      FOR v_target IN
        SELECT DISTINCT
          CAST(regexp_replace(split_part(m.body, 'Coordenadas: [', 2), '].*', '') AS text) as coords,
          m.recipient_id
        FROM messages m
        WHERE m.recipient_id = v_bot.id
          AND m.message_type = 'espionage'
          AND m.created_at >= NOW() - interval '24 hours'
          AND (
            m.body LIKE '%Lanzamisiles%' OR m.body LIKE '%Laser Ligero%' 
            OR m.body LIKE '%Laser Pesado%' OR m.body LIKE '%Canon Ionico%'
            OR m.body LIKE '%Canon Gauss%' OR m.body LIKE '%Torreta de Plasma%'
          )
        LIMIT 5
      LOOP
        -- Parse coordinates and launch IPMs
        BEGIN
          DECLARE
            v_galaxy integer;
            v_system integer;
            v_position integer;
            v_coords_parts text[];
          BEGIN
            -- Basic coords parsing: [g:ss:pp]
            v_coords_parts := string_to_array(REPLACE(REPLACE(v_target.coords, '[', ''), ']', ''), ':');
            IF array_length(v_coords_parts, 1) >= 3 THEN
              v_galaxy := v_coords_parts[1]::integer;
              v_system := v_coords_parts[2]::integer;
              v_position := v_coords_parts[3]::integer;
              
              -- Send up to 5 IPMs
              v_missiles_to_send := LEAST(v_planet.ipm_qty, 5);
              IF v_missiles_to_send > 0 THEN
                v_fleet_result := secure_send_fleet(
                  p_origin_planet_id := v_planet.id,
                  p_target_galaxy := v_galaxy,
                  p_target_system := v_system,
                  p_target_position := v_position,
                  p_mission_type := 'attack',
                  p_fleet_ships := jsonb_build_array(jsonb_build_object('ship_type_id', v_ipm_type_id, 'quantity', v_missiles_to_send)),
                  p_cargo_metal := 0, p_cargo_crystal := 0, p_cargo_deuterium := 0,
                  p_speed_percent := 100,
                  p_target_type := 'planet',
                  p_override_user_id := v_bot.id
                );
              END IF;
            END IF;
          END;
        EXCEPTION WHEN OTHERS THEN NULL;
        END;
      END LOOP;
    END LOOP;
  END LOOP;
END;
$$;

-- PHASE 2: Farm inactive/abandoned players
CREATE OR REPLACE FUNCTION bot_farm_inactive_players()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_bot RECORD;
  v_planet RECORD;
  v_target RECORD;
  v_combat_ships integer;
  v_small_cargo_count integer;
  v_large_cargo_count integer;
  v_light_fighter_count integer;
  v_small_cargo_type_id integer;
  v_large_cargo_type_id integer;
  v_light_fighter_type_id integer;
  v_send_lf integer;
  v_send_sc integer;
  v_send_lc integer;
  v_fleet_result jsonb;
BEGIN
  SELECT id INTO v_small_cargo_type_id FROM ship_types WHERE code = 'small_cargo' LIMIT 1;
  SELECT id INTO v_large_cargo_type_id FROM ship_types WHERE code = 'large_cargo' LIMIT 1;
  SELECT id INTO v_light_fighter_type_id FROM ship_types WHERE code = 'light_fighter' LIMIT 1;

  FOR v_bot IN SELECT id FROM profiles WHERE (is_bot = true OR autopilot_active = true) AND is_banned = false LOOP
    FOR v_planet IN
      SELECT p.*
      FROM planets p
      WHERE p.user_id = v_bot.id AND p.planet_type = 'planet'
        AND EXISTS (SELECT 1 FROM planet_ships ps WHERE ps.planet_id = p.id AND ps.ship_type_id IN (v_light_fighter_type_id, (SELECT id FROM ship_types WHERE code = 'heavy_fighter' LIMIT 1)))
      LIMIT 3
    LOOP
      -- Count combat + cargo ships
      SELECT COALESCE(SUM(ps.quantity), 0) INTO v_combat_ships
      FROM planet_ships ps
      WHERE ps.planet_id = v_planet.id
        AND ps.ship_type_id IN (SELECT id FROM ship_types WHERE code IN ('light_fighter','heavy_fighter','cruiser','battleship','battlecruiser','bomber','destroyer','nova','falco_x'));

      IF v_combat_ships < 5 THEN CONTINUE; END IF;

      -- Find inactive targets (no activity > 7 days, not in vacation, low points)
      FOR v_target IN
        SELECT p.galaxy, p.solar_system, p.position, pr.username,
               COALESCE(pr.points_total, 0) as points,
               COALESCE(pr.last_activity, pr.created_at) as last_act
        FROM planets p
        JOIN profiles pr ON pr.id = p.user_id
        WHERE p.planet_type = 'planet'
          AND pr.is_banned = false
          AND COALESCE(pr.vacation_mode, false) = false
          AND pr.is_bot = false
          AND pr.id <> v_bot.id
          AND COALESCE(pr.last_activity, pr.created_at) < NOW() - interval '7 days'
          AND COALESCE(pr.points_total, 0) < 50000
          AND p.galaxy = v_planet.galaxy
          AND ABS(p.solar_system - v_planet.solar_system) <= 10
          -- Not in our alliance
          AND NOT EXISTS (
            SELECT 1 FROM alliance_members am1
            JOIN alliance_members am2 ON am2.alliance_id = am1.alliance_id
            WHERE am1.user_id = v_bot.id AND am2.user_id = pr.id
          )
          -- Not attacked same target in last 24h (max 2x/day)
          AND (
            SELECT COUNT(*) FROM fleets f
            WHERE f.user_id = v_bot.id 
              AND f.target_galaxy = p.galaxy 
              AND f.target_system = p.solar_system 
              AND f.target_position = p.position
              AND f.mission_type = 'attack'
              AND f.departure_time > NOW() - interval '24 hours'
          ) < 2
        ORDER BY pr.last_activity ASC NULLS FIRST, pr.points_total ASC
        LIMIT 3
      LOOP
        -- Send light raiding party: 20% LF + cargo for loot
        SELECT COALESCE(ps.quantity, 0) INTO v_light_fighter_count FROM planet_ships ps WHERE ps.planet_id = v_planet.id AND ps.ship_type_id = v_light_fighter_type_id;
        SELECT COALESCE(ps.quantity, 0) INTO v_small_cargo_count FROM planet_ships ps WHERE ps.planet_id = v_planet.id AND ps.ship_type_id = v_small_cargo_type_id;
        SELECT COALESCE(ps.quantity, 0) INTO v_large_cargo_count FROM planet_ships ps WHERE ps.planet_id = v_planet.id AND ps.ship_type_id = v_large_cargo_type_id;

        v_send_lf := GREATEST(3, FLOOR(v_light_fighter_count * 0.15)::int);
        v_send_sc := FLOOR(v_small_cargo_count * 0.20)::int;
        v_send_lc := FLOOR(v_large_cargo_count * 0.20)::int;

        IF v_send_lf < 3 THEN CONTINUE; END IF;

        v_fleet_result := secure_send_fleet(
          p_origin_planet_id := v_planet.id,
          p_target_galaxy := v_target.galaxy,
          p_target_system := v_target.solar_system,
          p_target_position := v_target.position,
          p_mission_type := 'attack',
          p_fleet_ships := (
            SELECT jsonb_agg(obj) FROM (
              SELECT jsonb_build_object('ship_type_id', v_light_fighter_type_id, 'quantity', v_send_lf) AS obj WHERE v_send_lf > 0
              UNION ALL SELECT jsonb_build_object('ship_type_id', v_small_cargo_type_id, 'quantity', v_send_sc) WHERE v_send_sc > 0
              UNION ALL SELECT jsonb_build_object('ship_type_id', v_large_cargo_type_id, 'quantity', v_send_lc) WHERE v_send_lc > 0
            ) sub
          ),
          p_cargo_metal := 5000,
          p_cargo_crystal := 2500,
          p_cargo_deuterium := 1000,
          p_speed_percent := 100,
          p_target_type := 'planet',
          p_override_user_id := v_bot.id
        );

        IF COALESCE((v_fleet_result->>'success')::boolean, false) THEN
          EXIT;
        END IF;
      END LOOP;
    END LOOP;
  END LOOP;
END;
$$;

-- PHASE 3: Use sensor phalanx to detect enemy fleets
CREATE OR REPLACE FUNCTION bot_use_sensor_phalanx()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_bot RECORD;
  v_planet RECORD;
  v_phalanx_level integer;
  v_phalanx_range integer;
  v_scan_galaxy integer;
  v_scan_system integer;
  v_fleet_count integer;
BEGIN
  FOR v_bot IN SELECT id FROM profiles WHERE (is_bot = true OR autopilot_active = true) AND is_banned = false LOOP
    FOR v_planet IN
      SELECT p.*, COALESCE(pb.level, 0) as phalanx_level
      FROM planets p
      LEFT JOIN planet_buildings pb ON pb.planet_id = p.id AND pb.building_type_id = (SELECT id FROM building_types WHERE code = 'sensor_phalanx' LIMIT 1)
      WHERE p.user_id = v_bot.id
        AND p.planet_type = 'planet'
        AND COALESCE(pb.level, 0) >= 1
      LIMIT 2
    LOOP
      v_phalanx_range := LEAST(v_planet.phalanx_level, 10);
      
      FOR v_scan_system IN GREATEST(1, v_planet.solar_system - v_phalanx_range)..LEAST(499, v_planet.solar_system + v_phalanx_range)
      LOOP
        IF v_scan_system = v_planet.solar_system THEN CONTINUE; END IF;
        
        -- Just check if there are hostile fleets in this system
        SELECT COUNT(*) INTO v_fleet_count
        FROM fleets f
        WHERE f.target_galaxy = v_planet.galaxy
          AND f.target_system = v_scan_system
          AND f.user_id <> v_bot.id
          AND f.is_completed = false
          AND f.is_returning = false
          AND f.mission_type IN ('attack', 'transport', 'deploy', 'colonize', 'harvest')
          AND f.arrival_time > NOW()
          AND f.arrival_time < NOW() + interval '2 hours';

        -- Log the scan result (stored for future reference)
        IF v_fleet_count > 0 THEN
          -- Insert a system message so the bot "remembers" this intel
          INSERT INTO messages (sender_id, recipient_id, subject, body, message_type, is_read)
          VALUES (v_bot.id, v_bot.id, 'Phalanx Scan',
                  'Phalanx detected ' || v_fleet_count || ' hostile fleet(s) in Galaxy ' || v_planet.galaxy || ' System ' || v_scan_system || '. Time: ' || NOW()::text,
                  'espionage', true)
          ON CONFLICT DO NOTHING;
        END IF;
      END LOOP;
    END LOOP;
  END LOOP;
END;
$$;

-- =====================================================================
-- MASTER PRO TICK: Runs all 3 behaviors (call from cron or bot_ai_tick)
-- =====================================================================
CREATE OR REPLACE FUNCTION bot_military_pro_tick()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- 30% chance each behavior per tick (avoids spam, hits ~every 3-4 ticks)
  IF random() < 0.30 THEN PERFORM bot_launch_ipm_attacks(); END IF;
  IF random() < 0.30 THEN PERFORM bot_farm_inactive_players(); END IF;
  IF random() < 0.30 THEN PERFORM bot_use_sensor_phalanx(); END IF;
END;
$$;

-- Schedule via cron (runs every 3 minutes, between main bot ticks)
SELECT cron.schedule('bot-military-pro', '*/3 * * * *', 'SELECT bot_military_pro_tick()');
