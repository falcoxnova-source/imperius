CREATE OR REPLACE FUNCTION public.deploy_to_fortress(p_galaxy integer, p_planet_id uuid, p_ships jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid;
  v_alliance_id uuid;
  v_fortress record;
  v_ship record;
  v_existing integer;
  v_total bigint := 0;
BEGIN
  -- [COLMKT5] colonia en venta: bloqueada hasta cancelar la venta
  IF public._colony_listed_since(p_planet_id) IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Esta colonia esta en venta en el mercado. Cancela la venta para poder usarla.');
  END IF;
  -- Usuario autenticado
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

  -- SEGURIDAD: el planeta de origen DEBE pertenecer al usuario.
  -- Sin esta comprobación un jugador podría drenar naves de un planeta ajeno.
  IF NOT EXISTS (
    SELECT 1 FROM planets WHERE id = p_planet_id AND user_id = v_user_id
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'El planeta de origen no te pertenece');
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
    -- Ignorar cantidades no válidas
    IF v_ship.quantity IS NULL OR v_ship.quantity <= 0 THEN
      CONTINUE;
    END IF;

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

    -- Eliminar fila si la cantidad llega a cero
    DELETE FROM planet_ships
    WHERE planet_id = p_planet_id AND ship_type_id = v_ship.ship_type_id AND quantity <= 0;

    -- Sumar a fortress_ships (una fila nueva por despliegue; get_fortress_info agrega por SUM)
    -- [FTORIG1] Se guarda el planeta de origen para que el retiro vuelva alli.
    INSERT INTO fortress_ships (fortress_id, user_id, alliance_id, ship_type_id, quantity, origin_planet_id)
    VALUES (v_fortress.id, v_user_id, v_alliance_id, v_ship.ship_type_id, v_ship.quantity, p_planet_id);
  END LOOP;

  -- Total de naves en la fortaleza (informativo)
  SELECT COALESCE(SUM(quantity), 0) INTO v_total
  FROM fortress_ships
  WHERE fortress_id = v_fortress.id;

  RETURN jsonb_build_object(
    'success', true,
    'total_ships', v_total,
    'message', 'Naves desplegadas exitosamente'
  );
END;
$function$

