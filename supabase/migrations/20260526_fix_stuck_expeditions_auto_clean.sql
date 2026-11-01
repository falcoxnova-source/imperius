-- Auto-clean expired active expeditions so players never get stuck

CREATE OR REPLACE FUNCTION get_hero_active_expedition(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_active record;
BEGIN
  SELECT a.*, e.name, e.duration_minutes, e.xp_reward, e.hp_damage
  INTO v_active
  FROM hero_ship_active_expedition a
  JOIN hero_ship_expeditions e ON e.id = a.expedition_id
  WHERE a.user_id = p_user_id AND a.claimed = false;

  IF NOT FOUND THEN
    RETURN 'null'::jsonb;
  END IF;

  -- Auto-clean expired expeditions so players never get stuck
  IF now() >= v_active.returns_at THEN
    DELETE FROM hero_ship_active_expedition WHERE id = v_active.id;
    RETURN 'null'::jsonb;
  END IF;

  RETURN jsonb_build_object(
    'id', v_active.id,
    'expedition_name', v_active.name,
    'duration_minutes', v_active.duration_minutes,
    'xp_reward', v_active.xp_reward,
    'hp_damage', v_active.hp_damage,
    'started_at', v_active.started_at::text,
    'returns_at', v_active.returns_at::text,
    'can_claim', false,
    'remaining_seconds', EXTRACT(EPOCH FROM (v_active.returns_at - now()))
  );
END;
$$;

CREATE OR REPLACE FUNCTION start_hero_expedition(p_user_id uuid, p_expedition_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ship record;
  v_expedition record;
  v_active record;
  v_planet_id uuid;
  v_resources record;
  v_puntos_totales integer;
  v_costo_deuterio bigint;
BEGIN
  PERFORM create_hero_ship(p_user_id);
  SELECT * INTO v_ship FROM user_hero_ships WHERE user_id = p_user_id FOR UPDATE;

  IF v_ship.hp <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Tu nave esta daniada. Reparala antes de salir');
  END IF;

  IF v_ship.repair_until IS NOT NULL AND now() < v_ship.repair_until THEN
    RETURN jsonb_build_object('success', false, 'error', 'La nave esta siendo reparada en el hangar. Espera a que termine');
  END IF;

  SELECT * INTO v_expedition FROM hero_ship_expeditions WHERE id = p_expedition_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Expedicion no encontrada');
  END IF;

  IF v_ship.level < v_expedition.min_level THEN
    RETURN jsonb_build_object('success', false, 'error', 'Nivel minimo requerido: ' || v_expedition.min_level);
  END IF;

  SELECT * INTO v_active FROM hero_ship_active_expedition WHERE user_id = p_user_id AND claimed = false;
  IF FOUND THEN
    IF v_active.returns_at < now() THEN
      DELETE FROM hero_ship_active_expedition WHERE id = v_active.id;
    ELSE
      RETURN jsonb_build_object('success', false, 'error', 'Ya tienes una expedicion en curso');
    END IF;
  END IF;

  v_puntos_totales := COALESCE(v_ship.attack_points, 0) + COALESCE(v_ship.defense_points, 0) + COALESCE(v_ship.shield_points, 0) + COALESCE(v_ship.speed_points, 0);
  v_costo_deuterio := CEIL(v_expedition.duration_minutes * (POWER(v_ship.level, 2) * 10 + v_puntos_totales * 3) + 100);

  SELECT id INTO v_planet_id FROM planets WHERE user_id = p_user_id AND is_main_planet = true LIMIT 1;
  IF v_planet_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No tienes un planeta principal');
  END IF;

  SELECT deuterium INTO v_resources FROM planet_resources WHERE planet_id = v_planet_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Recursos del planeta no encontrados');
  END IF;

  IF v_resources.deuterium < v_costo_deuterio THEN
    RETURN jsonb_build_object('success', false, 'error', 'Deuterio insuficiente. Necesitas: ' || v_costo_deuterio || ', tienes: ' || FLOOR(v_resources.deuterium));
  END IF;

  UPDATE planet_resources SET deuterium = deuterium - v_costo_deuterio WHERE planet_id = v_planet_id;

  INSERT INTO hero_ship_active_expedition (user_id, expedition_id, started_at, returns_at)
  VALUES (p_user_id, p_expedition_id, now(), now() + (v_expedition.duration_minutes || ' minutes')::interval)
  ON CONFLICT (user_id) DO UPDATE SET
    expedition_id = EXCLUDED.expedition_id,
    started_at = EXCLUDED.started_at,
    returns_at = EXCLUDED.returns_at,
    claimed = false;

  RETURN jsonb_build_object(
    'success', true,
    'returns_at', (now() + (v_expedition.duration_minutes || ' minutes')::interval)::text,
    'duration_minutes', v_expedition.duration_minutes,
    'deuterium_cost', v_costo_deuterio
  );
END;
$$;
