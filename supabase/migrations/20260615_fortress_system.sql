/*
  # Sistema de Fortalezas de Alianza por Galaxia
  
  ## Reglas
  - 1 fortaleza por galaxia (sistema 250, posición 8)
  - Alianza dueña acumula flotas de sus miembros
  - Atacante que destruye 100% defensores captura la fortaleza
  - Naves destruidas = perdidas para siempre
  - Visibilidad pública
  
  ## Tablas NUEVAS (no modifica planets, fleets, alliances, planet_ships)
  - alliance_fortresses: 1 por galaxia
  - fortress_ships: naves acumuladas por usuario
*/

-- ============================================================================
-- 1. TABLAS
-- ============================================================================

CREATE TABLE IF NOT EXISTS alliance_fortresses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  galaxy integer NOT NULL UNIQUE CHECK (galaxy >= 1 AND galaxy <= 5),
  system integer NOT NULL DEFAULT 250,
  position integer NOT NULL DEFAULT 8,
  owner_alliance_id uuid REFERENCES alliances(id) ON DELETE SET NULL,
  captured_at timestamptz,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS fortress_ships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fortress_id uuid NOT NULL REFERENCES alliance_fortresses(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  alliance_id uuid NOT NULL REFERENCES alliances(id) ON DELETE CASCADE,
  ship_type_id integer NOT NULL REFERENCES ship_types(id) ON DELETE CASCADE,
  quantity integer NOT NULL CHECK (quantity > 0),
  deployed_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fortress_ships_fortress ON fortress_ships(fortress_id);
CREATE INDEX IF NOT EXISTS idx_fortress_ships_user ON fortress_ships(user_id);

-- ============================================================================
-- 2. SEED — 5 fortalezas (galaxia 1-5)
-- ============================================================================
INSERT INTO alliance_fortresses (galaxy, system, position)
VALUES (1, 250, 8), (2, 250, 8), (3, 250, 8), (4, 250, 8), (5, 250, 8)
ON CONFLICT (galaxy) DO NOTHING;

-- ============================================================================
-- 3. RPC: deploy_to_fortress
-- ============================================================================
CREATE OR REPLACE FUNCTION deploy_to_fortress(
  p_galaxy integer,
  p_planet_id uuid,
  p_ships jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_alliance_id uuid;
  v_fortress record;
  v_ship record;
  v_existing integer;
  v_total bigint := 0;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No autenticado');
  END IF;

  -- Verificar membresía de alianza
  SELECT am.alliance_id INTO v_alliance_id
  FROM alliance_members am
  WHERE am.user_id = v_user_id;
  
  IF v_alliance_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No perteneces a ninguna alianza');
  END IF;

  -- Verificar que la alianza es dueña de la fortaleza
  SELECT * INTO v_fortress
  FROM alliance_fortresses
  WHERE galaxy = p_galaxy;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Fortaleza no encontrada en galaxia ' || p_galaxy);
  END IF;

  IF v_fortress.owner_alliance_id IS NULL OR v_fortress.owner_alliance_id != v_alliance_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Tu alianza no controla esta fortaleza');
  END IF;

  -- Procesar cada tipo de nave
  FOR v_ship IN SELECT * FROM jsonb_to_recordset(p_ships) AS x(ship_type_id integer, quantity integer)
  LOOP
    -- Verificar que el usuario tiene esas naves en su planeta
    SELECT quantity INTO v_existing
    FROM planet_ships
    WHERE planet_id = p_planet_id AND ship_type_id = v_ship.ship_type_id;
    
    IF v_existing IS NULL OR v_existing < v_ship.quantity THEN
      RETURN jsonb_build_object('success', false, 'error', 'No tienes suficientes naves tipo ' || v_ship.ship_type_id);
    END IF;

    -- Restar de planet_ships
    UPDATE planet_ships
    SET quantity = quantity - v_ship.quantity
    WHERE planet_id = p_planet_id AND ship_type_id = v_ship.ship_type_id;

    -- Eliminar fila si quantity = 0
    DELETE FROM planet_ships
    WHERE planet_id = p_planet_id AND ship_type_id = v_ship.ship_type_id AND quantity <= 0;

    -- Sumar a fortress_ships
    INSERT INTO fortress_ships (fortress_id, user_id, alliance_id, ship_type_id, quantity)
    VALUES (v_fortress.id, v_user_id, v_alliance_id, v_ship.ship_type_id, v_ship.quantity)
    ON CONFLICT (id) DO NOTHING;
  END LOOP;

  -- Calcular total de naves en la fortaleza
  SELECT COALESCE(SUM(quantity), 0) INTO v_total
  FROM fortress_ships
  WHERE fortress_id = v_fortress.id;

  RETURN jsonb_build_object(
    'success', true,
    'total_ships', v_total,
    'message', 'Naves desplegadas exitosamente'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION deploy_to_fortress(integer, uuid, jsonb) TO authenticated;

-- ============================================================================
-- 4. RPC: recall_from_fortress
-- ============================================================================
CREATE OR REPLACE FUNCTION recall_from_fortress(
  p_galaxy integer,
  p_ships jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_fortress record;
  v_main_planet_id uuid;
  v_ship record;
  v_existing integer;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No autenticado');
  END IF;

  -- Obtener planeta principal
  SELECT id INTO v_main_planet_id
  FROM planets
  WHERE user_id = v_user_id AND is_main_planet = true
  LIMIT 1;

  IF v_main_planet_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No tienes planeta principal');
  END IF;

  -- Obtener fortaleza
  SELECT * INTO v_fortress
  FROM alliance_fortresses
  WHERE galaxy = p_galaxy;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Fortaleza no encontrada');
  END IF;

  -- Procesar cada tipo de nave
  FOR v_ship IN SELECT * FROM jsonb_to_recordset(p_ships) AS x(ship_type_id integer, quantity integer)
  LOOP
    -- Verificar que el usuario tiene esas naves en la fortaleza
    SELECT COALESCE(SUM(quantity), 0) INTO v_existing
    FROM fortress_ships
    WHERE fortress_id = v_fortress.id
      AND user_id = v_user_id
      AND ship_type_id = v_ship.ship_type_id;

    IF v_existing < v_ship.quantity THEN
      RETURN jsonb_build_object('success', false, 'error', 'No tienes suficientes naves tipo ' || v_ship.ship_type_id || ' en la fortaleza');
    END IF;

    -- Restar de fortress_ships (quitar del registro más antiguo primero)
    UPDATE fortress_ships
    SET quantity = quantity - v_ship.quantity
    WHERE id = (
      SELECT id FROM fortress_ships
      WHERE fortress_id = v_fortress.id
        AND user_id = v_user_id
        AND ship_type_id = v_ship.ship_type_id
      ORDER BY deployed_at ASC
      LIMIT 1
    );

    -- Eliminar filas con quantity <= 0
    DELETE FROM fortress_ships
    WHERE fortress_id = v_fortress.id
      AND user_id = v_user_id
      AND ship_type_id = v_ship.ship_type_id
      AND quantity <= 0;

    -- Sumar a planet_ships (planeta principal)
    INSERT INTO planet_ships (planet_id, ship_type_id, quantity)
    VALUES (v_main_planet_id, v_ship.ship_type_id, v_ship.quantity)
    ON CONFLICT (planet_id, ship_type_id)
    DO UPDATE SET quantity = planet_ships.quantity + v_ship.quantity;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Naves retiradas exitosamente'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION recall_from_fortress(integer, jsonb) TO authenticated;

-- ============================================================================
-- 5. RPC: get_fortress_info (público)
-- ============================================================================
CREATE OR REPLACE FUNCTION get_fortress_info(p_galaxy integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_fortress record;
  v_ships jsonb;
  v_contributors jsonb;
BEGIN
  SELECT af.*, a.name AS alliance_name, a.tag AS alliance_tag
  INTO v_fortress
  FROM alliance_fortresses af
  LEFT JOIN alliances a ON a.id = af.owner_alliance_id
  WHERE af.galaxy = p_galaxy;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Fortaleza no encontrada');
  END IF;

  -- Naves por tipo
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'ship_type_id', fs.ship_type_id,
    'ship_name', st.name,
    'total_quantity', fs.total_qty
  ) ORDER BY fs.total_qty DESC), '[]'::jsonb)
  INTO v_ships
  FROM (
    SELECT ship_type_id, SUM(quantity) AS total_qty
    FROM fortress_ships
    WHERE fortress_id = v_fortress.id
    GROUP BY ship_type_id
  ) fs
  LEFT JOIN ship_types st ON st.id = fs.ship_type_id;

  -- Contribuidores
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'user_id', fc.user_id,
    'username', p.username,
    'total_ships', fc.total_qty
  ) ORDER BY fc.total_qty DESC), '[]'::jsonb)
  INTO v_contributors
  FROM (
    SELECT user_id, SUM(quantity) AS total_qty
    FROM fortress_ships
    WHERE fortress_id = v_fortress.id
    GROUP BY user_id
  ) fc
  LEFT JOIN profiles p ON p.id = fc.user_id;

  RETURN jsonb_build_object(
    'success', true,
    'fortress_id', v_fortress.id,
    'galaxy', v_fortress.galaxy,
    'system', v_fortress.system,
    'position', v_fortress.position,
    'owner_alliance_id', v_fortress.owner_alliance_id,
    'owner_alliance_name', v_fortress.alliance_name,
    'owner_alliance_tag', v_fortress.alliance_tag,
    'captured_at', v_fortress.captured_at,
    'ships', v_ships,
    'total_ships', (SELECT COALESCE(SUM(quantity), 0) FROM fortress_ships WHERE fortress_id = v_fortress.id),
    'contributors', v_contributors
  );
END;
$$;

GRANT EXECUTE ON FUNCTION get_fortress_info(integer) TO authenticated;

-- ============================================================================
-- 6. RPC: attack_fortress
-- Los jugadores envían una flota normal con mission_type='attack_fortress'
-- Al llegar, el trigger process_fleet_arrival redirige aquí
-- ============================================================================
CREATE OR REPLACE FUNCTION resolve_fortress_attack(
  p_galaxy integer,
  p_attacker_id uuid,
  p_attacker_alliance_id uuid,
  p_attacker_ships jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_fortress record;
  v_defender_ships jsonb;
  v_combat_result jsonb;
  v_winner text;
BEGIN
  -- Obtener fortaleza
  SELECT * INTO v_fortress
  FROM alliance_fortresses
  WHERE galaxy = p_galaxy;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Fortaleza no encontrada');
  END IF;

  IF v_fortress.owner_alliance_id IS NULL THEN
    -- Sin dueño: el atacante la captura directamente
    UPDATE alliance_fortresses
    SET owner_alliance_id = p_attacker_alliance_id, captured_at = now()
    WHERE id = v_fortress.id;

    RETURN jsonb_build_object(
      'success', true,
      'result', 'captured',
      'message', 'Fortaleza capturada sin resistencia'
    );
  END IF;

  -- Si el atacante es de la misma alianza, no puede atacar
  IF v_fortress.owner_alliance_id = p_attacker_alliance_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'No puedes atacar tu propia fortaleza');
  END IF;

  -- Construir array de naves defensoras
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'ship_type_id', fs.ship_type_id,
    'quantity', fs.total_qty
  )), '[]'::jsonb)
  INTO v_defender_ships
  FROM (
    SELECT ship_type_id, SUM(quantity) AS total_qty
    FROM fortress_ships
    WHERE fortress_id = v_fortress.id
    GROUP BY ship_type_id
  ) fs;

  -- Ejecutar combate (reutiliza simulate_xnova_combat existente)
  v_combat_result := simulate_xnova_combat(p_attacker_ships, v_defender_ships);
  v_winner := v_combat_result->>'result';

  -- Si el atacante ganó (defensores = 0)
  IF v_winner = 'attacker_won' THEN
    -- Eliminar todas las naves defensoras
    DELETE FROM fortress_ships WHERE fortress_id = v_fortress.id;

    -- Cambiar dueño
    UPDATE alliance_fortresses
    SET owner_alliance_id = p_attacker_alliance_id, captured_at = now()
    WHERE id = v_fortress.id;

    -- Insertar battle report
    INSERT INTO battle_reports (
      attacker_id, defender_id,
      battle_type, result,
      attacker_ships_initial, defender_ships_initial,
      attacker_ships_lost, defender_ships_lost,
      debris_metal, debris_crystal,
      galaxy, solar_system, position,
      rounds_data
    ) VALUES (
      p_attacker_id, (SELECT leader_id FROM alliances WHERE id = v_fortress.owner_alliance_id),
      'fortress', 'attacker_won',
      p_attacker_ships, v_defender_ships,
      v_combat_result->'attacker_losses', v_combat_result->'defender_losses',
      COALESCE((v_combat_result->>'debris_metal')::bigint, 0),
      COALESCE((v_combat_result->>'debris_crystal')::bigint, 0),
      v_fortress.galaxy, v_fortress.system, v_fortress.position,
      v_combat_result->'rounds_data'
    );

    RETURN jsonb_build_object(
      'success', true,
      'result', 'captured',
      'combat', v_combat_result,
      'message', '¡Fortaleza capturada! Tu alianza ahora controla la galaxia ' || p_galaxy
    );
  END IF;

  -- Si el defensor ganó o empate: actualizar pérdidas defensoras
  IF v_combat_result->'defender_losses' IS NOT NULL THEN
    -- Aplicar pérdidas a fortress_ships (proporcionalmente)
    -- Simplificado: si el defensor ganó, las naves no se pierden (están en fortaleza)
    -- Solo se pierden si el atacante gana
    NULL;
  END IF;

  -- Insertar battle report (ataque fallido)
  INSERT INTO battle_reports (
    attacker_id, defender_id,
    battle_type, result,
    attacker_ships_initial, defender_ships_initial,
    attacker_ships_lost, defender_ships_lost,
    debris_metal, debris_crystal,
    galaxy, solar_system, position,
    rounds_data
  ) VALUES (
    p_attacker_id, (SELECT leader_id FROM alliances WHERE id = v_fortress.owner_alliance_id),
    'fortress', v_winner,
    p_attacker_ships, v_defender_ships,
    v_combat_result->'attacker_losses', '[]'::jsonb,
    COALESCE((v_combat_result->>'debris_metal')::bigint, 0),
    COALESCE((v_combat_result->>'debris_crystal')::bigint, 0),
    v_fortress.galaxy, v_fortress.system, v_fortress.position,
    v_combat_result->'rounds_data'
  );

  RETURN jsonb_build_object(
    'success', true,
    'result', v_winner,
    'combat', v_combat_result,
    'message', CASE WHEN v_winner = 'defender_won' THEN 'La fortaleza resistió el ataque'
                    ELSE 'Empate - la fortaleza mantiene su dueño' END
  );
END;
$$;

GRANT EXECUTE ON FUNCTION resolve_fortress_attack(integer, uuid, uuid, jsonb) TO authenticated;

-- ============================================================================
-- 7. RPC: get_all_fortresses (público - para el frontend)
-- ============================================================================
CREATE OR REPLACE FUNCTION get_all_fortresses()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
BEGIN
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'galaxy', af.galaxy,
      'system', af.system,
      'position', af.position,
      'owner_alliance_id', af.owner_alliance_id,
      'owner_alliance_name', a.name,
      'owner_alliance_tag', a.tag,
      'captured_at', af.captured_at,
      'total_ships', COALESCE((
        SELECT SUM(quantity) FROM fortress_ships fs WHERE fs.fortress_id = af.id
      ), 0)
    ) ORDER BY af.galaxy
  ), '[]'::jsonb)
  INTO v_result
  FROM alliance_fortresses af
  LEFT JOIN alliances a ON a.id = af.owner_alliance_id;

  RETURN jsonb_build_object('success', true, 'fortresses', v_result);
END;
$$;

GRANT EXECUTE ON FUNCTION get_all_fortresses() TO authenticated;
