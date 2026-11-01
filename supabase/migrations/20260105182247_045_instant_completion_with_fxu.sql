/*
  # Sistema de Completado Instantaneo con FXU

  1. Descripcion General
    - Permite a los jugadores pagar FXU para completar instantaneamente construcciones, investigaciones, naves y defensas
    - El costo se calcula basado en:
      - Tiempo restante (mas tiempo = mas caro)
      - Costo en recursos del item (items mas caros = mas FXU)
      - Nivel/cantidad del item

  2. Nuevas Funciones
    - `calculate_fxu_cost_building` - Calcula costo FXU para edificios
    - `calculate_fxu_cost_research` - Calcula costo FXU para investigaciones
    - `calculate_fxu_cost_shipyard` - Calcula costo FXU para astillero
    - `instant_complete_building` - Completa un edificio pagando FXU
    - `instant_complete_research` - Completa una investigacion pagando FXU
    - `instant_complete_shipyard_item` - Completa un item del astillero pagando FXU

  3. Formula de Costo
    - Base = (tiempo_restante_segundos / 60) = minutos restantes
    - Multiplicador de recursos = (metal + crystal + deuterium) / 10000
    - Costo final = GREATEST(1, base * (1 + multiplicador_recursos * 0.1))

  4. Seguridad
    - Solo usuarios autenticados pueden usar estas funciones
    - Verificacion de propiedad del item
    - Verificacion de saldo FXU suficiente
*/

-- Funcion para calcular costo FXU de un edificio en cola
CREATE OR REPLACE FUNCTION calculate_fxu_cost_building(p_queue_id uuid)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_queue_item building_queue%ROWTYPE;
  v_seconds_remaining integer;
  v_resource_multiplier numeric;
  v_base_cost numeric;
BEGIN
  SELECT * INTO v_queue_item FROM building_queue WHERE id = p_queue_id;
  
  IF v_queue_item IS NULL THEN
    RETURN 0;
  END IF;
  
  IF v_queue_item.queue_position = 1 AND v_queue_item.start_time IS NOT NULL THEN
    v_seconds_remaining := GREATEST(0, EXTRACT(EPOCH FROM (v_queue_item.end_time - now()))::integer);
  ELSE
    v_seconds_remaining := v_queue_item.build_time;
  END IF;
  
  IF v_seconds_remaining <= 0 THEN
    RETURN 0;
  END IF;
  
  v_resource_multiplier := (COALESCE(v_queue_item.metal_cost, 0) + COALESCE(v_queue_item.crystal_cost, 0) + COALESCE(v_queue_item.deuterium_cost, 0))::numeric / 10000;
  v_base_cost := (v_seconds_remaining::numeric / 60) * (1 + v_resource_multiplier * 0.1);
  
  RETURN GREATEST(1, CEIL(v_base_cost));
END;
$$;

-- Funcion para calcular costo FXU de una investigacion
CREATE OR REPLACE FUNCTION calculate_fxu_cost_research(p_technology_id uuid)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tech user_technologies%ROWTYPE;
  v_tech_type technology_types%ROWTYPE;
  v_seconds_remaining integer;
  v_resource_multiplier numeric;
  v_base_cost numeric;
BEGIN
  SELECT * INTO v_tech FROM user_technologies WHERE id = p_technology_id;
  
  IF v_tech IS NULL OR NOT v_tech.is_researching THEN
    RETURN 0;
  END IF;
  
  v_seconds_remaining := GREATEST(0, EXTRACT(EPOCH FROM (v_tech.research_end_time - now()))::integer);
  
  IF v_seconds_remaining <= 0 THEN
    RETURN 0;
  END IF;
  
  SELECT * INTO v_tech_type FROM technology_types WHERE id = v_tech.technology_type_id;
  
  v_resource_multiplier := (COALESCE(v_tech_type.base_metal_cost, 0) + COALESCE(v_tech_type.base_crystal_cost, 0) + COALESCE(v_tech_type.base_deuterium_cost, 0))::numeric / 10000;
  v_resource_multiplier := v_resource_multiplier * POWER(2, v_tech.level);
  v_base_cost := (v_seconds_remaining::numeric / 60) * (1 + v_resource_multiplier * 0.15);
  
  RETURN GREATEST(1, CEIL(v_base_cost));
END;
$$;

-- Funcion para calcular costo FXU de un item del astillero
CREATE OR REPLACE FUNCTION calculate_fxu_cost_shipyard(p_queue_id uuid)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_queue_item shipyard_queue%ROWTYPE;
  v_seconds_remaining integer;
  v_units_remaining integer;
  v_resource_multiplier numeric;
  v_base_cost numeric;
BEGIN
  SELECT * INTO v_queue_item FROM shipyard_queue WHERE id = p_queue_id;
  
  IF v_queue_item IS NULL THEN
    RETURN 0;
  END IF;
  
  v_units_remaining := v_queue_item.quantity - COALESCE(v_queue_item.quantity_completed, 0);
  
  IF v_units_remaining <= 0 THEN
    RETURN 0;
  END IF;
  
  IF v_queue_item.queue_position = 1 AND v_queue_item.current_unit_end_time IS NOT NULL THEN
    v_seconds_remaining := GREATEST(0, EXTRACT(EPOCH FROM (v_queue_item.current_unit_end_time - now()))::integer);
    v_seconds_remaining := v_seconds_remaining + ((v_units_remaining - 1) * v_queue_item.build_time_per_unit);
  ELSE
    v_seconds_remaining := v_units_remaining * v_queue_item.build_time_per_unit;
  END IF;
  
  IF v_seconds_remaining <= 0 THEN
    RETURN 0;
  END IF;
  
  v_resource_multiplier := (COALESCE(v_queue_item.metal_cost, 0) + COALESCE(v_queue_item.crystal_cost, 0) + COALESCE(v_queue_item.deuterium_cost, 0))::numeric / 10000;
  v_base_cost := (v_seconds_remaining::numeric / 60) * (1 + v_resource_multiplier * 0.1);
  
  RETURN GREATEST(1, CEIL(v_base_cost));
END;
$$;

-- Funcion para completar instantaneamente un edificio
CREATE OR REPLACE FUNCTION instant_complete_building(p_queue_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_queue_item building_queue%ROWTYPE;
  v_planet planets%ROWTYPE;
  v_fxu_cost numeric;
  v_current_fxu numeric;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;
  
  SELECT * INTO v_queue_item FROM building_queue WHERE id = p_queue_id;
  IF v_queue_item IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Queue item not found');
  END IF;
  
  SELECT * INTO v_planet FROM planets WHERE id = v_queue_item.planet_id;
  IF v_planet.user_id != v_user_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not your planet');
  END IF;
  
  v_fxu_cost := calculate_fxu_cost_building(p_queue_id);
  IF v_fxu_cost <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Building already complete');
  END IF;
  
  SELECT fxu_balance INTO v_current_fxu FROM profiles WHERE id = v_user_id;
  IF v_current_fxu < v_fxu_cost THEN
    RETURN jsonb_build_object('success', false, 'error', 'Insufficient FXU balance', 'required', v_fxu_cost, 'current', v_current_fxu);
  END IF;
  
  UPDATE profiles SET fxu_balance = fxu_balance - v_fxu_cost WHERE id = v_user_id;
  
  INSERT INTO planet_buildings (planet_id, building_type_id, level)
  VALUES (v_queue_item.planet_id, v_queue_item.building_type_id, v_queue_item.target_level)
  ON CONFLICT (planet_id, building_type_id)
  DO UPDATE SET level = EXCLUDED.level;
  
  DELETE FROM building_queue WHERE id = p_queue_id;
  
  UPDATE building_queue
  SET queue_position = queue_position - 1,
      start_time = CASE WHEN queue_position = 2 THEN now() ELSE start_time END,
      end_time = CASE WHEN queue_position = 2 THEN now() + (build_time || ' seconds')::interval ELSE end_time END
  WHERE planet_id = v_queue_item.planet_id AND queue_position > v_queue_item.queue_position;
  
  PERFORM calculate_user_points(v_user_id);
  
  RETURN jsonb_build_object('success', true, 'fxu_spent', v_fxu_cost);
END;
$$;

-- Funcion para completar instantaneamente una investigacion
CREATE OR REPLACE FUNCTION instant_complete_research(p_technology_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_tech user_technologies%ROWTYPE;
  v_fxu_cost numeric;
  v_current_fxu numeric;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;
  
  SELECT * INTO v_tech FROM user_technologies WHERE id = p_technology_id;
  IF v_tech IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Technology not found');
  END IF;
  
  IF v_tech.user_id != v_user_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not your technology');
  END IF;
  
  IF NOT v_tech.is_researching THEN
    RETURN jsonb_build_object('success', false, 'error', 'Technology not being researched');
  END IF;
  
  v_fxu_cost := calculate_fxu_cost_research(p_technology_id);
  IF v_fxu_cost <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Research already complete');
  END IF;
  
  SELECT fxu_balance INTO v_current_fxu FROM profiles WHERE id = v_user_id;
  IF v_current_fxu < v_fxu_cost THEN
    RETURN jsonb_build_object('success', false, 'error', 'Insufficient FXU balance', 'required', v_fxu_cost, 'current', v_current_fxu);
  END IF;
  
  UPDATE profiles SET fxu_balance = fxu_balance - v_fxu_cost WHERE id = v_user_id;
  
  UPDATE user_technologies
  SET level = level + 1,
      is_researching = false,
      research_end_time = NULL,
      research_planet_id = NULL
  WHERE id = p_technology_id;
  
  PERFORM calculate_user_points(v_user_id);
  
  RETURN jsonb_build_object('success', true, 'fxu_spent', v_fxu_cost);
END;
$$;

-- Funcion para completar instantaneamente un item del astillero
CREATE OR REPLACE FUNCTION instant_complete_shipyard_item(p_queue_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_queue_item shipyard_queue%ROWTYPE;
  v_planet planets%ROWTYPE;
  v_fxu_cost numeric;
  v_current_fxu numeric;
  v_units_remaining integer;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;
  
  SELECT * INTO v_queue_item FROM shipyard_queue WHERE id = p_queue_id;
  IF v_queue_item IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Queue item not found');
  END IF;
  
  SELECT * INTO v_planet FROM planets WHERE id = v_queue_item.planet_id;
  IF v_planet.user_id != v_user_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not your planet');
  END IF;
  
  v_units_remaining := v_queue_item.quantity - COALESCE(v_queue_item.quantity_completed, 0);
  IF v_units_remaining <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Item already complete');
  END IF;
  
  v_fxu_cost := calculate_fxu_cost_shipyard(p_queue_id);
  IF v_fxu_cost <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Item already complete');
  END IF;
  
  SELECT fxu_balance INTO v_current_fxu FROM profiles WHERE id = v_user_id;
  IF v_current_fxu < v_fxu_cost THEN
    RETURN jsonb_build_object('success', false, 'error', 'Insufficient FXU balance', 'required', v_fxu_cost, 'current', v_current_fxu);
  END IF;
  
  UPDATE profiles SET fxu_balance = fxu_balance - v_fxu_cost WHERE id = v_user_id;
  
  IF v_queue_item.item_type = 'ship' THEN
    INSERT INTO planet_ships (planet_id, ship_type_id, quantity)
    VALUES (v_queue_item.planet_id, v_queue_item.ship_type_id, v_units_remaining)
    ON CONFLICT (planet_id, ship_type_id)
    DO UPDATE SET quantity = planet_ships.quantity + v_units_remaining;
  ELSE
    INSERT INTO planet_defenses (planet_id, defense_type_id, quantity)
    VALUES (v_queue_item.planet_id, v_queue_item.defense_type_id, v_units_remaining)
    ON CONFLICT (planet_id, defense_type_id)
    DO UPDATE SET quantity = planet_defenses.quantity + v_units_remaining;
  END IF;
  
  DELETE FROM shipyard_queue WHERE id = p_queue_id;
  
  UPDATE shipyard_queue
  SET queue_position = queue_position - 1,
      start_time = CASE WHEN queue_position = 2 THEN now() ELSE start_time END,
      current_unit_end_time = CASE WHEN queue_position = 2 THEN now() + (build_time_per_unit || ' seconds')::interval ELSE current_unit_end_time END
  WHERE planet_id = v_queue_item.planet_id AND queue_position > v_queue_item.queue_position;
  
  PERFORM calculate_user_points(v_user_id);
  
  RETURN jsonb_build_object('success', true, 'fxu_spent', v_fxu_cost, 'units_completed', v_units_remaining);
END;
$$;

-- Permisos
GRANT EXECUTE ON FUNCTION calculate_fxu_cost_building(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION calculate_fxu_cost_research(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION calculate_fxu_cost_shipyard(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION instant_complete_building(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION instant_complete_research(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION instant_complete_shipyard_item(uuid) TO authenticated;