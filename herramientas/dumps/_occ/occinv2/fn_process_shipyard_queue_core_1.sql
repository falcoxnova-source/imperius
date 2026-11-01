CREATE OR REPLACE FUNCTION public.process_shipyard_queue_core(p_planet_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_owner uuid;
  v_item_type text;
  v_row shipyard_queue%ROWTYPE;
  v_build integer;
  v_remaining integer;
  v_units integer;
  v_total integer := 0;
  v_guard integer;
  v_ref_m numeric;    -- [SHYFIX1] reembolso de lote descartado
  v_ref_c numeric;
  v_ref_d numeric;
  v_ref_bp integer;
  v_bp_id bigint;
BEGIN
  SELECT user_id INTO v_owner FROM planets WHERE id = p_planet_id;
  IF v_owner IS NULL THEN
    RETURN 0;
  END IF;

  -- Serializa las llamadas concurrentes sobre el mismo planeta.
  -- Sin esto, dos RPC simultaneas podrian acreditar las mismas unidades.
  PERFORM 1 FROM shipyard_queue WHERE planet_id = p_planet_id FOR UPDATE;

  FOREACH v_item_type IN ARRAY ARRAY['ship','defense']::text[] LOOP

    -- (a) Retirar lotes ya agotados
    DELETE FROM shipyard_queue
    WHERE planet_id = p_planet_id
      AND item_type = v_item_type
      AND quantity_completed >= quantity;

    -- (b) Renumerar y (c) restaurar invariante del reloj
    WITH r AS (
      SELECT id, ROW_NUMBER() OVER (ORDER BY queue_position, created_at, id) AS np
      FROM shipyard_queue
      WHERE planet_id = p_planet_id AND item_type = v_item_type
    )
    UPDATE shipyard_queue sq
    SET queue_position = r.np
    FROM r
    WHERE sq.id = r.id AND sq.queue_position IS DISTINCT FROM r.np;

    UPDATE shipyard_queue
    SET start_time = NULL, current_unit_end_time = NULL
    WHERE planet_id = p_planet_id
      AND item_type = v_item_type
      AND queue_position > 1
      AND (start_time IS NOT NULL OR current_unit_end_time IS NOT NULL);

    -- (d) El activo siempre tiene reloj. Si le faltaba, arranca ahora.
    UPDATE shipyard_queue
    SET start_time = now(),
        current_unit_end_time = now()
          + (GREATEST(1, build_time_per_unit) || ' seconds')::interval
    WHERE planet_id = p_planet_id
      AND item_type = v_item_type
      AND queue_position = 1
      AND current_unit_end_time IS NULL;

    -- (e) Producir unidades vencidas
    v_guard := 0;
    LOOP
      v_guard := v_guard + 1;
      EXIT WHEN v_guard > 200;

      SELECT * INTO v_row
      FROM shipyard_queue
      WHERE planet_id = p_planet_id
        AND item_type = v_item_type
        AND queue_position = 1
        AND current_unit_end_time IS NOT NULL
        AND current_unit_end_time <= now()
        AND quantity > quantity_completed
      LIMIT 1;

      EXIT WHEN NOT FOUND;

      v_build := GREATEST(1, v_row.build_time_per_unit);
      v_remaining := v_row.quantity - v_row.quantity_completed;

      -- Unidades realmente cumplidas por tiempo transcurrido.
      -- La primera ya vencio; las demas exigen v_build segundos cada una.
      v_units := LEAST(
        1 + FLOOR(
          EXTRACT(EPOCH FROM (now() - v_row.current_unit_end_time)) / v_build
        )::integer,
        v_remaining
      );

      EXIT WHEN v_units <= 0;

      -- Cupula planetaria/gigante: una sola por cuenta
      IF v_item_type = 'defense' AND v_row.defense_type_id IN (7, 8) THEN
        IF EXISTS (
          SELECT 1 FROM planet_defenses pd
          JOIN planets pl ON pl.id = pd.planet_id
          WHERE pl.user_id = v_owner
            AND pd.defense_type_id = v_row.defense_type_id
            AND pd.quantity > 0
            AND pd.planet_id IS DISTINCT FROM p_planet_id
        ) THEN
          -- [SHYFIX1] Antes se BORRABA el lote sin devolver nada: el jugador
          -- pagaba la cupula y se quedaba sin cupula Y sin recursos.
          -- Ahora se reembolsa la parte NO construida (recursos + planos).
          v_ref_m := FLOOR(COALESCE(v_row.metal_cost,0)::numeric     * v_remaining / GREATEST(v_row.quantity,1));
          v_ref_c := FLOOR(COALESCE(v_row.crystal_cost,0)::numeric   * v_remaining / GREATEST(v_row.quantity,1));
          v_ref_d := FLOOR(COALESCE(v_row.deuterium_cost,0)::numeric * v_remaining / GREATEST(v_row.quantity,1));

          UPDATE planet_resources
          SET metal     = metal     + v_ref_m,
              crystal   = crystal   + v_ref_c,
              deuterium = deuterium + v_ref_d
          WHERE planet_id = p_planet_id;

          v_ref_bp := LEAST(COALESCE(v_row.blueprints_used, 0), v_remaining);
          IF v_ref_bp > 0 THEN
            v_bp_id := NULL;
            SELECT sb.id INTO v_bp_id FROM ship_blueprints sb
            WHERE sb.defense_type_id = v_row.defense_type_id AND sb.is_active = true LIMIT 1;
            IF v_bp_id IS NOT NULL THEN
              INSERT INTO user_ship_blueprints (user_id, blueprint_id, source, metadata)
              SELECT v_owner, v_bp_id, 'shop', jsonb_build_object('refunded_from_dome_limit', true)
              FROM generate_series(1, v_ref_bp);
            END IF;
          END IF;

          INSERT INTO messages (recipient_id, sender_id, subject, body, message_type)
          VALUES (v_owner, NULL, 'Construccion cancelada: cupula ya existente',
            'Ya posees esta cupula en otro planeta (solo se permite una por cuenta). '
            || 'Se te han devuelto los recursos: ' || v_ref_m::bigint || ' metal, '
            || v_ref_c::bigint || ' cristal, ' || v_ref_d::bigint || ' deuterio.',
            'system');

          DELETE FROM shipyard_queue WHERE id = v_row.id;
          PERFORM public._shipyard_promote_next(p_planet_id, v_item_type);
          CONTINUE;
        END IF;
      END IF;

      -- Acreditar la produccion
      IF v_item_type = 'ship' AND v_row.ship_type_id IS NOT NULL THEN
        INSERT INTO planet_ships (planet_id, ship_type_id, quantity)
        VALUES (p_planet_id, v_row.ship_type_id, v_units)
        ON CONFLICT (planet_id, ship_type_id)
        DO UPDATE SET quantity = planet_ships.quantity + EXCLUDED.quantity;
      ELSIF v_item_type = 'defense' AND v_row.defense_type_id IS NOT NULL THEN
        INSERT INTO planet_defenses (planet_id, defense_type_id, quantity)
        VALUES (p_planet_id, v_row.defense_type_id, v_units)
        ON CONFLICT (planet_id, defense_type_id)
        DO UPDATE SET quantity = planet_defenses.quantity + EXCLUDED.quantity;
      END IF;

      v_total := v_total + v_units;

      IF v_row.quantity_completed + v_units >= v_row.quantity THEN
        -- Lote terminado: se retira y el siguiente empieza de cero.
        DELETE FROM shipyard_queue WHERE id = v_row.id;
        PERFORM public._shipyard_promote_next(p_planet_id, v_item_type);
        EXIT;
      ELSE
        -- Avance parcial: el reloj se ENCADENA desde el vencimiento real,
        -- no desde now(). Asi no se regala ni se roba tiempo aunque el
        -- jugador refresque muchas veces.
        UPDATE shipyard_queue
        SET quantity_completed = v_row.quantity_completed + v_units,
            start_time = v_row.current_unit_end_time
              + ((v_units - 1) * v_build || ' seconds')::interval,
            current_unit_end_time = v_row.current_unit_end_time
              + (v_units * v_build || ' seconds')::interval
        WHERE id = v_row.id;
      END IF;
    END LOOP;

  END LOOP;

  RETURN v_total;
END;
$function$

