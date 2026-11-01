-- =====================================================================
-- COLAS PARALELAS REALES: NAVES vs DEFENSAS
-- =====================================================================
-- PROBLEMA
--   queue_position es global por planeta (1..N mezclando naves y defensas).
--   Solo la posicion 1 tiene timer => si tienes 3 naves en cola, la defensa
--   que encolas queda en posicion 4 y NO empieza hasta que terminen las naves.
--
-- SOLUCION
--   queue_position pasa a ser POR (planet_id, item_type).
--   Habra una posicion 1 de 'ship' y una posicion 1 de 'defense', cada una
--   con su propio start_time/current_unit_end_time => construyen en paralelo.
--
-- COMO
--   Parches textuales quirurgicos (regex con asercion de nº de coincidencias).
--   Si un patron no aparece EXACTAMENTE las veces esperadas, la migracion
--   aborta y no cambia nada. NO se reescribe ninguna logica de negocio:
--   costes, planos, VIP, cupulas, reembolsos, FXU, etc. quedan intactos.
--
-- NO SE TOCA
--   * bot_ai_tick(): solo encola si la cola esta vacia (v_shipyard_busy) e
--     inserta siempre en posicion 1 => sigue funcionando igual.
--   * ensure_all_queue_timers(): ya opera por conjunto sobre queue_position=1,
--     con la numeracion por tipo arrancara ambos cabezas automaticamente.
--   * secure_add_to_shipyard_queue(uuid,integer,integer): overload muerto
--     (referencia p_item_type/p_type_id que no son parametros suyos).
--   * Fix del bug 3 (construccion instantanea): intacto, solo cambia el
--     ambito del renumerado.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- Helper temporal: parche con asercion
-- ---------------------------------------------------------------------
-- Aplica TODOS los parches de una funcion de golpe y solo entonces la recrea.
-- (aplicarlos de uno en uno dejaria la funcion sintacticamente invalida a medias)
CREATE OR REPLACE FUNCTION pg_temp._patch_fn(
  p_sig text, p_patterns text[], p_replacements text[], p_expected integer[]
) RETURNS void AS $$
DECLARE
  v_def   text;
  v_count integer;
  v_prev  text;
  i       integer;
BEGIN
  IF array_length(p_patterns,1) <> array_length(p_replacements,1)
     OR array_length(p_patterns,1) <> array_length(p_expected,1) THEN
    RAISE EXCEPTION 'PATCH ABORTADO en % : arrays de distinto tamano', p_sig;
  END IF;

  SELECT replace(pg_get_functiondef(p_sig::regprocedure), E'\r', '') INTO v_def;

  FOR i IN 1 .. array_length(p_patterns,1) LOOP
    SELECT count(*) INTO v_count FROM regexp_matches(v_def, p_patterns[i], 'g');

    IF v_count <> p_expected[i] THEN
      RAISE EXCEPTION 'PATCH ABORTADO en % : patron [%] << % >> encontrado % veces, esperadas %',
        p_sig, i, p_patterns[i], v_count, p_expected[i];
    END IF;

    v_prev := v_def;
    v_def  := regexp_replace(v_def, p_patterns[i], p_replacements[i], 'g');

    IF v_def = v_prev THEN
      RAISE EXCEPTION 'PATCH ABORTADO en % : el parche [%] no cambio nada', p_sig, i;
    END IF;

    RAISE NOTICE '  parche % OK  <-  %', i, left(p_patterns[i], 70);
  END LOOP;

  EXECUTE v_def;
  RAISE NOTICE 'FUNCION ACTUALIZADA: %', p_sig;
END;
$$ LANGUAGE plpgsql;


-- =====================================================================
-- 1) secure_add_to_shipyard_queue(uuid,text,integer,integer)
--    La posicion se calcula dentro del MISMO item_type.
--    Con ello, el CASE WHEN v_queue_position = 0 arranca el timer cuando
--    la cola DE ESE TIPO esta vacia (aunque la del otro tipo tenga items).
-- =====================================================================
SELECT pg_temp._patch_fn(
  'public.secure_add_to_shipyard_queue(uuid,text,integer,integer)',
  ARRAY[
    $p$SELECT COALESCE\(MAX\(queue_position\), 0\) INTO v_queue_position\s+FROM shipyard_queue WHERE planet_id = p_planet_id;$p$
  ],
  ARRAY[
    E'SELECT COALESCE(MAX(queue_position), 0) INTO v_queue_position\nFROM shipyard_queue WHERE planet_id = p_planet_id AND item_type = p_item_type;'
  ],
  ARRAY[1]
);


-- =====================================================================
-- 2) process_completed_shipyard_queue(uuid)   <-- ruta principal del juego
--    Ya recorre en bucle todas las filas con queue_position = 1, asi que
--    con la numeracion por tipo procesara la nave Y la defensa activas.
--    Solo hay que acotar los renumerados al mismo item_type.
-- =====================================================================
SELECT pg_temp._patch_fn(
  'public.process_completed_shipyard_queue(uuid)',
  ARRAY[
    $p$WHERE planet_id = p_planet_id\s+AND queue_position > v_queue_item\.queue_position;$p$,
    $p$WHERE planet_id = p_planet_id AND queue_position > 1;$p$
  ],
  ARRAY[
    E'WHERE planet_id = p_planet_id\n      AND item_type = v_queue_item.item_type\n      AND queue_position > v_queue_item.queue_position;',
    E'WHERE planet_id = p_planet_id AND item_type = v_queue_item.item_type AND queue_position > 1;'
  ],
  ARRAY[1, 1]
);


-- =====================================================================
-- 3) process_shipyard_queue_internal(uuid,uuid)
--    Usado por full_reconnect_sync() y full_reconnect_sync_all_planets().
--    Su bucle coge "LIMIT 1 ORDER BY queue_position": con dos cabezas
--    elegiria una al azar. Se envuelve en un bucle por tipo.
-- =====================================================================
SELECT pg_temp._patch_fn(
  'public.process_shipyard_queue_internal(uuid,uuid)',
  ARRAY[
    $p$v_iteration integer := 0;$p$,
    $p$END IF;\s+LOOP\s+v_iteration := v_iteration \+ 1;$p$,
    $p$FROM shipyard_queue\s+WHERE planet_id = p_planet_id\s+ORDER BY queue_position\s+LIMIT 1\s+FOR UPDATE SKIP LOCKED;$p$,
    $p$WHERE planet_id = p_planet_id\s+AND queue_position > 1;$p$,
    $p$WHERE planet_id = p_planet_id\s+AND queue_position = 1\s+AND start_time IS NULL;$p$,
    $p$END LOOP;\s+RETURN jsonb_build_object\(\s*'success', true,\s*'completed_units', v_total_units_completed$p$
  ],
  ARRAY[
    E'v_iteration integer := 0;\n  v_item_type_cur text;',
    E'END IF;\n\n  FOREACH v_item_type_cur IN ARRAY ARRAY[''ship'',''defense'']::text[] LOOP\n  v_iteration := 0;\n  LOOP\n    v_iteration := v_iteration + 1;',
    E'FROM shipyard_queue\n    WHERE planet_id = p_planet_id\n      AND item_type = v_item_type_cur\n    ORDER BY queue_position\n    LIMIT 1\n    FOR UPDATE SKIP LOCKED;',
    E'WHERE planet_id = p_planet_id\n        AND item_type = v_item_type_cur\n        AND queue_position > 1;',
    E'WHERE planet_id = p_planet_id\n        AND item_type = v_item_type_cur\n        AND queue_position = 1\n        AND start_time IS NULL;',
    E'END LOOP;\n  END LOOP;\n\n  RETURN jsonb_build_object(\n    ''success'', true,\n    ''completed_units'', v_total_units_completed'
  ],
  ARRAY[1, 1, 1, 1, 1, 1]
);


-- =====================================================================
-- 4) secure_cancel_shipyard_queue_item(uuid)
--    Cancelar una nave no debe reordenar ni arrancar defensas (y viceversa).
-- =====================================================================
SELECT pg_temp._patch_fn(
  'public.secure_cancel_shipyard_queue_item(uuid)',
  ARRAY[
    $p$WHERE planet_id = v_queue_item\.planet_id AND queue_position = 2$p$,
    $p$ROW_NUMBER\(\) OVER \(ORDER BY queue_position\)$p$
  ],
  ARRAY[
    E'WHERE planet_id = v_queue_item.planet_id AND item_type = v_queue_item.item_type AND queue_position = 2',
    E'ROW_NUMBER() OVER (PARTITION BY item_type ORDER BY queue_position)'
  ],
  ARRAY[1, 1]
);


-- =====================================================================
-- 5) instant_complete_shipyard_item(uuid)   (acelerar con FXU)
-- =====================================================================
SELECT pg_temp._patch_fn(
  'public.instant_complete_shipyard_item(uuid)',
  ARRAY[ $p$ROW_NUMBER\(\) OVER \(ORDER BY queue_position\)$p$ ],
  ARRAY[ E'ROW_NUMBER() OVER (PARTITION BY item_type ORDER BY queue_position)' ],
  ARRAY[1]
);


-- =====================================================================
-- 6) admin_process_stuck_shipyard_queues()
-- =====================================================================
SELECT pg_temp._patch_fn(
  'public.admin_process_stuck_shipyard_queues()',
  ARRAY[ $p$WHERE planet_id = v_queue_item\.planet_id\s+AND queue_position > v_queue_item\.queue_position;$p$ ],
  ARRAY[ E'WHERE planet_id = v_queue_item.planet_id\n        AND item_type = v_queue_item.item_type\n        AND queue_position > v_queue_item.queue_position;' ],
  ARRAY[1]
);


-- =====================================================================
-- 7) global_process_all_expired_queues()   (sin llamadores, se parchea igual)
-- =====================================================================
-- OJO: esta funcion tiene el MISMO renumerado para building_queue; el patron
-- se ancla en "ELSE current_unit_end_time END" para tocar solo shipyard_queue.
SELECT pg_temp._patch_fn(
  'public.global_process_all_expired_queues()',
  ARRAY[ $p$ELSE current_unit_end_time END\s+WHERE planet_id = v_queue_item\.planet_id AND queue_position > v_queue_item\.queue_position;$p$ ],
  ARRAY[ E'ELSE current_unit_end_time END\nWHERE planet_id = v_queue_item.planet_id AND item_type = v_queue_item.item_type AND queue_position > v_queue_item.queue_position;' ],
  ARRAY[1]
);


-- =====================================================================
-- 8) optimized_global_queue_processor()   (sin llamadores, se parchea igual)
-- =====================================================================
SELECT pg_temp._patch_fn(
  'public.optimized_global_queue_processor()',
  ARRAY[
    $p$SELECT sq\.id, sq\.planet_id, sq\.queue_position, p\.user_id$p$,
    $p$WHERE planet_id = v_stuck\.planet_id\s+AND queue_position > v_stuck\.queue_position;$p$,
    $p$WHERE planet_id = v_queue_item\.planet_id AND queue_position = 2$p$,
    $p$WHERE planet_id = v_queue_item\.planet_id AND queue_position > 2;$p$
  ],
  ARRAY[
    E'SELECT sq.id, sq.planet_id, sq.queue_position, sq.item_type, p.user_id',
    E'WHERE planet_id = v_stuck.planet_id AND item_type = v_stuck.item_type AND queue_position > v_stuck.queue_position;',
    E'WHERE planet_id = v_queue_item.planet_id AND item_type = v_queue_item.item_type AND queue_position = 2',
    E'WHERE planet_id = v_queue_item.planet_id AND item_type = v_queue_item.item_type AND queue_position > 2;'
  ],
  ARRAY[1, 1, 1, 1]
);


-- =====================================================================
-- 9) toggle_vacation_mode(boolean)
--    Al volver de vacaciones hay que reanudar la cabeza de CADA tipo.
-- =====================================================================
SELECT pg_temp._patch_fn(
  'public.toggle_vacation_mode(boolean)',
  ARRAY[ $p$SELECT MIN\(sq2\.queue_position\) FROM shipyard_queue sq2 WHERE sq2\.planet_id = sq\.planet_id$p$ ],
  ARRAY[ E'SELECT MIN(sq2.queue_position) FROM shipyard_queue sq2 WHERE sq2.planet_id = sq.planet_id AND sq2.item_type = sq.item_type' ],
  ARRAY[1]
);


-- =====================================================================
-- 10) MIGRACION DE DATOS: renumerar las filas existentes por tipo
-- =====================================================================
WITH reordered AS (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY planet_id, item_type
           ORDER BY queue_position, created_at NULLS LAST, id
         ) AS new_pos
  FROM public.shipyard_queue
)
UPDATE public.shipyard_queue sq
SET queue_position = r.new_pos
FROM reordered r
WHERE sq.id = r.id
  AND sq.queue_position IS DISTINCT FROM r.new_pos;

-- Arrancar el timer de las nuevas cabezas que quedaron sin timer.
-- Se excluyen los jugadores en modo vacaciones (ahi el timer es NULL a proposito).
UPDATE public.shipyard_queue sq
SET start_time            = now(),
    current_unit_end_time = now() + (sq.build_time_per_unit || ' seconds')::interval
WHERE sq.queue_position = 1
  AND (sq.start_time IS NULL OR sq.current_unit_end_time IS NULL)
  AND NOT EXISTS (
    SELECT 1
    FROM public.planets p
    JOIN public.profiles pr ON pr.id = p.user_id
    WHERE p.id = sq.planet_id
      AND pr.vacation_mode = true
  );


-- =====================================================================
-- 11) VERIFICACION: ninguna cola puede tener posiciones duplicadas por tipo
-- =====================================================================
DO $$
DECLARE
  v_dup integer;
  v_sin_uno integer;
BEGIN
  SELECT count(*) INTO v_dup FROM (
    SELECT planet_id, item_type, queue_position
    FROM public.shipyard_queue
    GROUP BY 1,2,3 HAVING count(*) > 1
  ) t;
  IF v_dup > 0 THEN
    RAISE EXCEPTION 'VERIFICACION FALLIDA: % posiciones duplicadas por (planeta,tipo)', v_dup;
  END IF;

  SELECT count(*) INTO v_sin_uno FROM (
    SELECT planet_id, item_type
    FROM public.shipyard_queue
    GROUP BY 1,2 HAVING min(queue_position) <> 1
  ) t;
  IF v_sin_uno > 0 THEN
    RAISE EXCEPTION 'VERIFICACION FALLIDA: % colas sin posicion 1', v_sin_uno;
  END IF;

  RAISE NOTICE 'VERIFICACION OK: numeracion por (planeta, tipo) consistente';
END;
$$;

COMMIT;
