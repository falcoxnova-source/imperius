/*
  # Terraformer: Campos exponenciales en vez de lineales

  ## Cambio
  Antes: cada nivel de Terraformer daba +5 campos fijos (lineal: level * 5)
  Ahora: formula exponencial FLOOR(5 * POWER(level, 1.3))

  ## Progresión
  Nivel 1:  5 campos  (antes: 5)   — igual
  Nivel 2:  12 campos (antes: 10)
  Nivel 3:  20 campos (antes: 15)
  Nivel 5:  40 campos (antes: 25)
  Nivel 10: 99 campos (antes: 50)
  Nivel 15: 172 campos (antes: 75)
  Nivel 20: 256 campos (antes: 100)

  ## Funciones afectadas
  1. terraformer_field_bonus(level) — NUEVA función helper
  2. complete_building_queue_item() — usa helper en vez de level * 5
  3. secure_demolish_building() — usa helper en vez de fijo 5
  4. calculate_planet_max_fields() — usa helper en vez de level * 5
  5. Recalcular fields_max de planetas existentes con terraformer
*/

-- ==========================================================================
-- 1. Función helper: calcula el bonus total de campos para un nivel dado
--    Formula: FLOOR(5 * POWER(level, 1.3))
-- ==========================================================================
CREATE OR REPLACE FUNCTION terraformer_field_bonus(p_level integer)
RETURNS integer
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  IF p_level <= 0 THEN
    RETURN 0;
  END IF;
  RETURN FLOOR(5 * POWER(p_level, 1.3))::integer;
END;
$$;


-- ==========================================================================
-- 2. complete_building_queue_item — cambiar terraformer de lineal a exponencial
-- ==========================================================================
CREATE OR REPLACE FUNCTION public.complete_building_queue_item(p_queue_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
SET lock_timeout TO '30s'
AS $function$
DECLARE
  v_queue building_queue%ROWTYPE;
  v_planet planets%ROWTYPE;
  v_existing_building planet_buildings%ROWTYPE;
  v_levels_added integer;
  v_building_type building_types%ROWTYPE;
  v_fields_increase integer := 0;
  v_old_level integer;
BEGIN
  SELECT * INTO v_queue FROM building_queue WHERE id = p_queue_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Queue item not found');
  END IF;

  SELECT * INTO v_planet FROM planets WHERE id = v_queue.planet_id;
  IF NOT FOUND OR v_planet.user_id != auth.uid() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Planet not found or not owned');
  END IF;

  IF v_queue.end_time IS NULL OR v_queue.end_time > (NOW() + INTERVAL '2 seconds') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Build not complete yet');
  END IF;

  SELECT * INTO v_building_type FROM building_types WHERE id = v_queue.building_type_id;

  SELECT * INTO v_existing_building
  FROM planet_buildings
  WHERE planet_id = v_queue.planet_id AND building_type_id = v_queue.building_type_id;

  IF FOUND THEN
    v_levels_added := v_queue.target_level - v_existing_building.level;
    v_old_level := v_existing_building.level;
    UPDATE planet_buildings
    SET level = v_queue.target_level, is_upgrading = false, upgrade_end_time = NULL
    WHERE id = v_existing_building.id;
  ELSE
    v_levels_added := v_queue.target_level;
    v_old_level := 0;
    INSERT INTO planet_buildings (planet_id, building_type_id, level, is_upgrading)
    VALUES (v_queue.planet_id, v_queue.building_type_id, v_queue.target_level, false);
  END IF;

  IF v_building_type.code = 'lunar_base' THEN
    v_fields_increase := v_levels_added * 3;

    UPDATE planets
    SET
      fields_used = fields_used + v_levels_added,
      fields_max = fields_max + v_fields_increase
    WHERE id = v_queue.planet_id;
  ELSIF v_building_type.code = 'terraformer' THEN
    -- Exponencial: diferencia entre bonus del nuevo nivel y bonus del nivel anterior
    v_fields_increase := terraformer_field_bonus(v_queue.target_level) - terraformer_field_bonus(v_old_level);

    UPDATE planets
    SET
      fields_used = fields_used + v_levels_added,
      fields_max = fields_max + v_fields_increase
    WHERE id = v_queue.planet_id;
  ELSE
    IF v_levels_added > 0 THEN
      UPDATE planets SET fields_used = fields_used + v_levels_added WHERE id = v_queue.planet_id;
    END IF;
  END IF;

  DELETE FROM building_queue WHERE id = p_queue_id;

  WITH reordered AS (
    SELECT id, ROW_NUMBER() OVER (ORDER BY queue_position) as new_pos
    FROM building_queue
    WHERE planet_id = v_queue.planet_id
  )
  UPDATE building_queue bq
  SET
    queue_position = r.new_pos,
    start_time = CASE WHEN r.new_pos = 1 AND bq.start_time IS NULL THEN NOW() ELSE bq.start_time END,
    end_time = CASE WHEN r.new_pos = 1 AND bq.end_time IS NULL THEN NOW() + (bq.build_time || ' seconds')::interval ELSE bq.end_time END
  FROM reordered r
  WHERE bq.id = r.id;

  RETURN jsonb_build_object(
    'success', true,
    'building_type_id', v_queue.building_type_id,
    'new_level', v_queue.target_level,
    'fields_increase', v_fields_increase
  );
END;
$function$;


-- ==========================================================================
-- 3. secure_demolish_building — cambiar terraformer de -5 fijo a exponencial
-- ==========================================================================
CREATE OR REPLACE FUNCTION secure_demolish_building(
  p_planet_id uuid,
  p_building_type_id integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_planet planets%ROWTYPE;
  v_building planet_buildings%ROWTYPE;
  v_building_type building_types%ROWTYPE;
  v_queue_count integer;
  v_current_level integer;
  v_refund_metal bigint;
  v_refund_crystal bigint;
  v_refund_deuterium bigint;
  v_fields_decrease integer := 0;
  v_fxu_fee numeric;
  v_user_fxu numeric;
  v_admin_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  IF is_user_in_vacation_mode(auth.uid()) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cannot demolish while in vacation mode');
  END IF;

  SELECT COALESCE(value::numeric, 2000) INTO v_fxu_fee
  FROM game_settings WHERE key = 'fxu_demolish_fee';

  IF v_fxu_fee IS NULL THEN
    v_fxu_fee := 2000;
  END IF;

  SELECT COALESCE(fxu_balance, 0) INTO v_user_fxu
  FROM profiles WHERE id = auth.uid();

  IF v_user_fxu < v_fxu_fee THEN
    RETURN jsonb_build_object('success', false, 'error', 'Insufficient FXU. Required: ' || v_fxu_fee::text || ', Available: ' || v_user_fxu::text);
  END IF;

  SELECT * INTO v_planet FROM planets WHERE id = p_planet_id AND user_id = auth.uid();
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Planet not found or not owned');
  END IF;

  SELECT * INTO v_building_type FROM building_types WHERE id = p_building_type_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Building type not found');
  END IF;

  SELECT * INTO v_building
  FROM planet_buildings
  WHERE planet_id = p_planet_id AND building_type_id = p_building_type_id;

  IF NOT FOUND OR COALESCE(v_building.level, 0) <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Building not found or already at level 0');
  END IF;

  v_current_level := v_building.level;

  SELECT COUNT(*) INTO v_queue_count
  FROM building_queue
  WHERE planet_id = p_planet_id;

  IF v_queue_count > 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cannot demolish while construction queue is active');
  END IF;

  IF v_building.is_upgrading THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cannot demolish while building is upgrading');
  END IF;

  PERFORM set_config('fxu.allow_update_9x7k2m', 'true', true);

  UPDATE profiles SET fxu_balance = fxu_balance - v_fxu_fee WHERE id = auth.uid();

  v_admin_id := get_admin_account_id();
  IF v_admin_id IS NOT NULL THEN
    UPDATE profiles SET fxu_balance = fxu_balance + v_fxu_fee WHERE id = v_admin_id;
  END IF;

  v_refund_metal := FLOOR(v_building_type.base_metal * POWER(v_building_type.cost_factor, v_current_level - 1) * 0.5);
  v_refund_crystal := FLOOR(v_building_type.base_crystal * POWER(v_building_type.cost_factor, v_current_level - 1) * 0.5);
  v_refund_deuterium := FLOOR(v_building_type.base_deuterium * POWER(v_building_type.cost_factor, v_current_level - 1) * 0.5);

  UPDATE planet_buildings
  SET level = v_current_level - 1
  WHERE id = v_building.id;

  UPDATE planet_resources
  SET
    metal = metal + v_refund_metal,
    crystal = crystal + v_refund_crystal,
    deuterium = deuterium + v_refund_deuterium,
    last_update = now()
  WHERE planet_id = p_planet_id;

  IF v_building_type.code = 'lunar_base' THEN
    v_fields_decrease := 3;
    UPDATE planets
    SET
      fields_used = GREATEST(0, fields_used - 1),
      fields_max = GREATEST(1, fields_max - v_fields_decrease)
    WHERE id = p_planet_id;
  ELSIF v_building_type.code = 'terraformer' THEN
    -- Exponencial: diferencia entre bonus del nivel actual y el nivel inferior
    v_fields_decrease := terraformer_field_bonus(v_current_level) - terraformer_field_bonus(v_current_level - 1);
    UPDATE planets
    SET
      fields_used = GREATEST(0, fields_used - 1),
      fields_max = GREATEST(1, fields_max - v_fields_decrease)
    WHERE id = p_planet_id;
  ELSE
    UPDATE planets
    SET fields_used = GREATEST(0, fields_used - 1)
    WHERE id = p_planet_id;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'new_level', v_current_level - 1,
    'refund_metal', v_refund_metal,
    'refund_crystal', v_refund_crystal,
    'refund_deuterium', v_refund_deuterium,
    'fxu_charged', v_fxu_fee
  );
END;
$$;


-- ==========================================================================
-- 4. calculate_planet_max_fields — usar formula exponencial
-- ==========================================================================
CREATE OR REPLACE FUNCTION calculate_planet_max_fields(p_planet_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_planet record;
  v_terraformer_level integer;
  v_base_fields integer;
  v_position_bonus integer;
BEGIN
  SELECT * INTO v_planet FROM public.planets WHERE id = p_planet_id;

  IF v_planet.planet_type = 'moon' THEN
    RETURN v_planet.fields_max;
  END IF;

  SELECT COALESCE(pb.level, 0) INTO v_terraformer_level
  FROM public.planet_buildings pb
  JOIN public.building_types bt ON pb.building_type_id = bt.id
  WHERE pb.planet_id = p_planet_id AND bt.code = 'terraformer';

  IF v_terraformer_level IS NULL THEN
    v_terraformer_level := 0;
  END IF;

  v_base_fields := FLOOR(POWER(v_planet.diameter / 1000.0, 2))::integer;

  v_position_bonus := CASE v_planet.position
    WHEN 1 THEN -30
    WHEN 2 THEN -20
    WHEN 3 THEN -10
    WHEN 10 THEN 5
    WHEN 11 THEN 10
    WHEN 12 THEN 15
    WHEN 13 THEN 20
    WHEN 14 THEN 15
    WHEN 15 THEN 10
    ELSE 0
  END;

  -- Exponencial: FLOOR(5 * POWER(level, 1.3)) en vez de level * 5
  RETURN GREATEST(40, v_base_fields + v_position_bonus + public.terraformer_field_bonus(v_terraformer_level));
END;
$$;


-- ==========================================================================
-- 5. Recalcular fields_max de todos los planetas que tienen terraformer
--    Corrige la diferencia entre la formula lineal vieja y la exponencial nueva
-- ==========================================================================
DO $$
DECLARE
  v_planet record;
  v_terraformer_level integer;
  v_old_bonus integer;
  v_new_bonus integer;
  v_diff integer;
  v_updated integer := 0;
BEGIN
  FOR v_planet IN
    SELECT p.id, p.fields_max, pb.level as terra_level
    FROM planets p
    JOIN planet_buildings pb ON pb.planet_id = p.id
    JOIN building_types bt ON pb.building_type_id = bt.id
    WHERE bt.code = 'terraformer'
      AND pb.level > 0
      AND p.planet_type = 'planet'
  LOOP
    v_old_bonus := v_planet.terra_level * 5;  -- formula lineal vieja
    v_new_bonus := terraformer_field_bonus(v_planet.terra_level);  -- formula exponencial nueva
    v_diff := v_new_bonus - v_old_bonus;

    IF v_diff != 0 THEN
      UPDATE planets
      SET fields_max = GREATEST(1, fields_max + v_diff)
      WHERE id = v_planet.id;
      v_updated := v_updated + 1;
    END IF;
  END LOOP;

  RAISE NOTICE 'Terraformer exponencial: % planetas actualizados', v_updated;
END;
$$;
