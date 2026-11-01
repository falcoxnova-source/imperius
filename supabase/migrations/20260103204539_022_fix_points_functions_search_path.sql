/*
  # Fix Search Path Security for Points Calculation Functions

  1. Security Fixes
    - Set immutable search_path = '' on all points calculation functions
    - Prefix all table references with 'public.' schema
    - Functions affected:
      - calculate_building_total_cost
      - calculate_building_points
      - calculate_research_points
      - calculate_fleet_points
      - calculate_defense_points
      - update_player_points
      - trigger_update_building_points
      - trigger_update_research_points
      - trigger_update_fleet_points
      - trigger_update_defense_points
      - recalculate_all_player_points

  2. Notes
    - This migration fixes the "Function Search Path Mutable" warnings
    - All business logic remains unchanged
    - Only security hardening applied
*/

-- Fix calculate_building_total_cost
CREATE OR REPLACE FUNCTION calculate_building_total_cost(
  p_base_metal integer,
  p_base_crystal integer,
  p_base_deuterium integer,
  p_cost_factor numeric,
  p_level integer
)
RETURNS bigint
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $$
DECLARE
  v_total_metal bigint := 0;
  v_total_crystal bigint := 0;
  v_total_deuterium bigint := 0;
  i integer;
BEGIN
  IF p_level <= 0 THEN
    RETURN 0;
  END IF;
  
  FOR i IN 0..(p_level - 1) LOOP
    v_total_metal := v_total_metal + floor(p_base_metal * power(p_cost_factor, i));
    v_total_crystal := v_total_crystal + floor(p_base_crystal * power(p_cost_factor, i));
    v_total_deuterium := v_total_deuterium + floor(p_base_deuterium * power(p_cost_factor, i));
  END LOOP;
  
  RETURN v_total_metal + v_total_crystal + v_total_deuterium;
END;
$$;

-- Fix calculate_building_points
CREATE OR REPLACE FUNCTION calculate_building_points(p_user_id uuid)
RETURNS integer
LANGUAGE plpgsql
STABLE
SET search_path = ''
AS $$
DECLARE
  v_total_cost bigint := 0;
  v_record record;
BEGIN
  FOR v_record IN
    SELECT 
      bt.base_metal,
      bt.base_crystal,
      bt.base_deuterium,
      bt.cost_factor,
      pb.level
    FROM public.planet_buildings pb
    JOIN public.planets p ON pb.planet_id = p.id
    JOIN public.building_types bt ON pb.building_type_id = bt.id
    WHERE p.user_id = p_user_id AND pb.level > 0
  LOOP
    v_total_cost := v_total_cost + public.calculate_building_total_cost(
      v_record.base_metal,
      v_record.base_crystal,
      v_record.base_deuterium,
      v_record.cost_factor::numeric,
      v_record.level
    );
  END LOOP;
  
  RETURN floor(v_total_cost / 1000)::integer;
END;
$$;

-- Fix calculate_research_points
CREATE OR REPLACE FUNCTION calculate_research_points(p_user_id uuid)
RETURNS integer
LANGUAGE plpgsql
STABLE
SET search_path = ''
AS $$
DECLARE
  v_total_cost bigint := 0;
  v_record record;
BEGIN
  FOR v_record IN
    SELECT 
      tt.base_metal,
      tt.base_crystal,
      tt.base_deuterium,
      tt.cost_factor,
      ut.level
    FROM public.user_technologies ut
    JOIN public.technology_types tt ON ut.technology_type_id = tt.id
    WHERE ut.user_id = p_user_id AND ut.level > 0
  LOOP
    v_total_cost := v_total_cost + public.calculate_building_total_cost(
      v_record.base_metal,
      v_record.base_crystal,
      v_record.base_deuterium,
      v_record.cost_factor::numeric,
      v_record.level
    );
  END LOOP;
  
  RETURN floor(v_total_cost / 1000)::integer;
END;
$$;

-- Fix calculate_fleet_points
CREATE OR REPLACE FUNCTION calculate_fleet_points(p_user_id uuid)
RETURNS integer
LANGUAGE plpgsql
STABLE
SET search_path = ''
AS $$
DECLARE
  v_total_cost bigint := 0;
BEGIN
  SELECT COALESCE(SUM(
    (st.metal_cost + st.crystal_cost + st.deuterium_cost)::bigint * ps.quantity
  ), 0) INTO v_total_cost
  FROM public.planet_ships ps
  JOIN public.planets p ON ps.planet_id = p.id
  JOIN public.ship_types st ON ps.ship_type_id = st.id
  WHERE p.user_id = p_user_id AND ps.quantity > 0;
  
  RETURN floor(v_total_cost / 1000)::integer;
END;
$$;

-- Fix calculate_defense_points
CREATE OR REPLACE FUNCTION calculate_defense_points(p_user_id uuid)
RETURNS integer
LANGUAGE plpgsql
STABLE
SET search_path = ''
AS $$
DECLARE
  v_total_cost bigint := 0;
BEGIN
  SELECT COALESCE(SUM(
    (dt.metal_cost + dt.crystal_cost + dt.deuterium_cost)::bigint * pd.quantity
  ), 0) INTO v_total_cost
  FROM public.planet_defenses pd
  JOIN public.planets p ON pd.planet_id = p.id
  JOIN public.defense_types dt ON pd.defense_type_id = dt.id
  WHERE p.user_id = p_user_id AND pd.quantity > 0;
  
  RETURN floor(v_total_cost / 1000)::integer;
END;
$$;

-- Fix update_player_points
CREATE OR REPLACE FUNCTION update_player_points(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_buildings integer;
  v_research integer;
  v_fleet integer;
  v_defense integer;
BEGIN
  v_buildings := public.calculate_building_points(p_user_id);
  v_research := public.calculate_research_points(p_user_id);
  v_fleet := public.calculate_fleet_points(p_user_id);
  v_defense := public.calculate_defense_points(p_user_id);
  
  UPDATE public.profiles SET
    points_buildings = v_buildings,
    points_research = v_research,
    points_fleet = v_fleet,
    points_defense = v_defense,
    points_total = v_buildings + v_research + v_fleet + v_defense,
    updated_at = now()
  WHERE id = p_user_id;
END;
$$;

-- Fix trigger_update_building_points
CREATE OR REPLACE FUNCTION trigger_update_building_points()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    SELECT user_id INTO v_user_id FROM public.planets WHERE id = OLD.planet_id;
  ELSE
    SELECT user_id INTO v_user_id FROM public.planets WHERE id = NEW.planet_id;
  END IF;
  
  IF v_user_id IS NOT NULL THEN
    PERFORM public.update_player_points(v_user_id);
  END IF;
  
  RETURN NULL;
END;
$$;

-- Fix trigger_update_research_points
CREATE OR REPLACE FUNCTION trigger_update_research_points()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.update_player_points(OLD.user_id);
  ELSE
    PERFORM public.update_player_points(NEW.user_id);
  END IF;
  
  RETURN NULL;
END;
$$;

-- Fix trigger_update_fleet_points
CREATE OR REPLACE FUNCTION trigger_update_fleet_points()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    SELECT user_id INTO v_user_id FROM public.planets WHERE id = OLD.planet_id;
  ELSE
    SELECT user_id INTO v_user_id FROM public.planets WHERE id = NEW.planet_id;
  END IF;
  
  IF v_user_id IS NOT NULL THEN
    PERFORM public.update_player_points(v_user_id);
  END IF;
  
  RETURN NULL;
END;
$$;

-- Fix trigger_update_defense_points
CREATE OR REPLACE FUNCTION trigger_update_defense_points()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    SELECT user_id INTO v_user_id FROM public.planets WHERE id = OLD.planet_id;
  ELSE
    SELECT user_id INTO v_user_id FROM public.planets WHERE id = NEW.planet_id;
  END IF;
  
  IF v_user_id IS NOT NULL THEN
    PERFORM public.update_player_points(v_user_id);
  END IF;
  
  RETURN NULL;
END;
$$;

-- Fix recalculate_all_player_points
CREATE OR REPLACE FUNCTION recalculate_all_player_points()
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_user record;
BEGIN
  FOR v_user IN SELECT id FROM public.profiles LOOP
    PERFORM public.update_player_points(v_user.id);
  END LOOP;
END;
$$;
