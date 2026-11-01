-- =============================================================================
-- Admin: Gestion de inventario de planetas (naves + edificios)
-- =============================================================================
-- Permite al admin:
--  - Listar planetas de cualquier usuario
--  - Ver naves y edificios de un planeta
--  - Setear cantidad absoluta de una nave en un planeta
--  - Setear nivel absoluto de un edificio en un planeta
-- =============================================================================

-- ---------- 1. Listar planetas de un usuario ----------
CREATE OR REPLACE FUNCTION public.admin_get_user_planets(p_user_id uuid)
RETURNS TABLE (
  planet_id uuid,
  planet_name text,
  galaxy integer,
  solar_system integer,
  planet_position integer,
  planet_type text,
  is_main_planet boolean,
  is_destroyed boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_admin boolean;
BEGIN
  SELECT is_admin INTO v_is_admin FROM profiles WHERE id = auth.uid();
  IF v_is_admin IS NOT TRUE THEN
    RAISE EXCEPTION 'Access denied: admin only';
  END IF;

  RETURN QUERY
  SELECT p.id, p.name, p.galaxy, p.solar_system, p."position",
         p.planet_type, p.is_main_planet, COALESCE(p.is_destroyed, false)
  FROM planets p
  WHERE p.user_id = p_user_id
  ORDER BY p.is_main_planet DESC, p.planet_type, p.galaxy, p.solar_system, p.position;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_get_user_planets(uuid) TO authenticated;


-- ---------- 2. Inventario completo de un planeta (naves + edificios) ----------
CREATE OR REPLACE FUNCTION public.admin_get_planet_inventory(p_planet_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_admin boolean;
  v_planet RECORD;
  v_ships jsonb;
  v_buildings jsonb;
BEGIN
  SELECT is_admin INTO v_is_admin FROM profiles WHERE id = auth.uid();
  IF v_is_admin IS NOT TRUE THEN
    RAISE EXCEPTION 'Access denied: admin only';
  END IF;

  SELECT p.id, p.name, p.user_id, p.galaxy, p.solar_system, p."position",
         p.planet_type, p.is_main_planet, pr.username
    INTO v_planet
  FROM planets p
  LEFT JOIN profiles pr ON pr.id = p.user_id
  WHERE p.id = p_planet_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Planet not found';
  END IF;

  -- Naves: TODOS los ship_types con la cantidad actual (0 si no existe)
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'ship_type_id', st.id,
    'code',         st.code,
    'name',         st.name,
    'quantity',     COALESCE(ps.quantity, 0)
  ) ORDER BY st.id), '[]'::jsonb)
  INTO v_ships
  FROM ship_types st
  LEFT JOIN planet_ships ps ON ps.ship_type_id = st.id AND ps.planet_id = p_planet_id;

  -- Edificios: TODOS los building_types con su nivel actual (0 si no existe)
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'building_type_id', bt.id,
    'code',             bt.code,
    'name',             bt.name,
    'level',            COALESCE(pb.level, 0),
    'is_upgrading',     COALESCE(pb.is_upgrading, false)
  ) ORDER BY bt.id), '[]'::jsonb)
  INTO v_buildings
  FROM building_types bt
  LEFT JOIN planet_buildings pb ON pb.building_type_id = bt.id AND pb.planet_id = p_planet_id;

  RETURN jsonb_build_object(
    'planet', jsonb_build_object(
      'id',             v_planet.id,
      'name',           v_planet.name,
      'user_id',        v_planet.user_id,
      'username',       v_planet.username,
      'coords',         format('[%s:%s:%s]', v_planet.galaxy, v_planet.solar_system, v_planet."position"),
      'planet_type',    v_planet.planet_type,
      'is_main_planet', v_planet.is_main_planet
    ),
    'ships',     v_ships,
    'buildings', v_buildings
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_get_planet_inventory(uuid) TO authenticated;


-- ---------- 3. Setear cantidad absoluta de una nave ----------
CREATE OR REPLACE FUNCTION public.admin_set_planet_ship(
  p_planet_id uuid,
  p_ship_type_id integer,
  p_quantity integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_admin boolean;
  v_old_qty integer;
  v_new_qty integer;
  v_ship_name text;
  v_planet_exists boolean;
BEGIN
  SELECT is_admin INTO v_is_admin FROM profiles WHERE id = auth.uid();
  IF v_is_admin IS NOT TRUE THEN
    RAISE EXCEPTION 'Access denied: admin only';
  END IF;

  IF p_quantity < 0 THEN
    RAISE EXCEPTION 'Quantity must be >= 0';
  END IF;

  SELECT EXISTS(SELECT 1 FROM planets WHERE id = p_planet_id) INTO v_planet_exists;
  IF NOT v_planet_exists THEN
    RAISE EXCEPTION 'Planet not found';
  END IF;

  SELECT name INTO v_ship_name FROM ship_types WHERE id = p_ship_type_id;
  IF v_ship_name IS NULL THEN
    RAISE EXCEPTION 'Ship type not found: %', p_ship_type_id;
  END IF;

  SELECT COALESCE(quantity, 0) INTO v_old_qty
  FROM planet_ships
  WHERE planet_id = p_planet_id AND ship_type_id = p_ship_type_id;
  v_old_qty := COALESCE(v_old_qty, 0);

  IF p_quantity = 0 THEN
    DELETE FROM planet_ships
    WHERE planet_id = p_planet_id AND ship_type_id = p_ship_type_id;
    v_new_qty := 0;
  ELSE
    INSERT INTO planet_ships (planet_id, ship_type_id, quantity)
    VALUES (p_planet_id, p_ship_type_id, p_quantity)
    ON CONFLICT (planet_id, ship_type_id)
      DO UPDATE SET quantity = EXCLUDED.quantity;
    v_new_qty := p_quantity;
  END IF;

  RETURN jsonb_build_object(
    'success',   true,
    'planet_id', p_planet_id,
    'ship_type_id', p_ship_type_id,
    'ship_name', v_ship_name,
    'old_quantity', v_old_qty,
    'new_quantity', v_new_qty
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_set_planet_ship(uuid, integer, integer) TO authenticated;


-- ---------- 4. Setear nivel absoluto de un edificio ----------
CREATE OR REPLACE FUNCTION public.admin_set_planet_building(
  p_planet_id uuid,
  p_building_type_id integer,
  p_level integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_admin boolean;
  v_old_level integer;
  v_new_level integer;
  v_bld_name text;
  v_planet_exists boolean;
BEGIN
  SELECT is_admin INTO v_is_admin FROM profiles WHERE id = auth.uid();
  IF v_is_admin IS NOT TRUE THEN
    RAISE EXCEPTION 'Access denied: admin only';
  END IF;

  IF p_level < 0 THEN
    RAISE EXCEPTION 'Level must be >= 0';
  END IF;
  IF p_level > 50 THEN
    RAISE EXCEPTION 'Level cannot exceed 50';
  END IF;

  SELECT EXISTS(SELECT 1 FROM planets WHERE id = p_planet_id) INTO v_planet_exists;
  IF NOT v_planet_exists THEN
    RAISE EXCEPTION 'Planet not found';
  END IF;

  SELECT name INTO v_bld_name FROM building_types WHERE id = p_building_type_id;
  IF v_bld_name IS NULL THEN
    RAISE EXCEPTION 'Building type not found: %', p_building_type_id;
  END IF;

  SELECT COALESCE(level, 0) INTO v_old_level
  FROM planet_buildings
  WHERE planet_id = p_planet_id AND building_type_id = p_building_type_id;
  v_old_level := COALESCE(v_old_level, 0);

  IF p_level = 0 THEN
    DELETE FROM planet_buildings
    WHERE planet_id = p_planet_id AND building_type_id = p_building_type_id;
    v_new_level := 0;
  ELSE
    INSERT INTO planet_buildings (planet_id, building_type_id, level, is_upgrading)
    VALUES (p_planet_id, p_building_type_id, p_level, false)
    ON CONFLICT (planet_id, building_type_id)
      DO UPDATE SET level = EXCLUDED.level,
                    is_upgrading = false,
                    upgrade_end_time = NULL;
    v_new_level := p_level;
  END IF;

  RETURN jsonb_build_object(
    'success',   true,
    'planet_id', p_planet_id,
    'building_type_id', p_building_type_id,
    'building_name', v_bld_name,
    'old_level', v_old_level,
    'new_level', v_new_level
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_set_planet_building(uuid, integer, integer) TO authenticated;
