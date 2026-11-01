/*
  # Limpieza de Naves Duplicadas por Bug de Aceleración

  ## Descripción
  Este script identifica a los jugadores del top 14 del ranking que usaron
  la función de aceleración de flota (pagaron FXU para retorno rápido) y
  elimina TODAS sus naves para revertir el efecto del bug de duplicación.

  ## Alcance
  - Solo afecta a los top 14 jugadores del ranking
  - Solo a aquellos que tienen registros de pago por fleet_acceleration
  - Elimina todas las naves de todos sus planetas
  - NO afecta edificios, recursos, tecnologías, defensas u otros elementos

  ## Justificación
  El bug de duplicación de naves permitió que jugadores obtuvieran el doble
  de las naves al usar la aceleración de flota. Esta limpieza revierte ese
  beneficio injusto.
*/

-- ============================================================================
-- PASO 1: Identificar jugadores afectados (top 14 + usaron aceleración)
-- ============================================================================

DO $$
DECLARE
  v_user RECORD;
  v_used_acceleration BOOLEAN;
  v_total_ships_removed INTEGER;
  v_ships_removed INTEGER;
  v_affected_count INTEGER := 0;
BEGIN
  RAISE NOTICE '========================================';
  RAISE NOTICE 'INICIANDO LIMPIEZA DE NAVES DUPLICADAS';
  RAISE NOTICE '========================================';
  RAISE NOTICE '';

  -- Recorrer los top 14 jugadores del ranking
  FOR v_user IN
    SELECT
      p.id,
      p.username,
      p.points_total
    FROM profiles p
    WHERE p.is_admin = false
    ORDER BY p.points_total DESC
    LIMIT 14
  LOOP
    -- Verificar si este usuario pagó por aceleración de flota
    SELECT EXISTS(
      SELECT 1
      FROM admin_revenue
      WHERE related_user_id = v_user.id
        AND revenue_type = 'fleet_acceleration'
    ) INTO v_used_acceleration;

    IF v_used_acceleration THEN
      -- Calcular total de naves antes de eliminar
      SELECT COALESCE(SUM(quantity), 0) INTO v_total_ships_removed
      FROM planet_ships ps
      JOIN planets pl ON ps.planet_id = pl.id
      WHERE pl.user_id = v_user.id;

      IF v_total_ships_removed > 0 THEN
        RAISE NOTICE 'Usuario: % (ID: %) - Puntos: % - Naves a eliminar: %',
          v_user.username, v_user.id, v_user.points_total, v_total_ships_removed;

        -- ELIMINAR TODAS LAS NAVES DE TODOS LOS PLANETAS DEL USUARIO
        DELETE FROM planet_ships ps
        USING planets pl
        WHERE ps.planet_id = pl.id
          AND pl.user_id = v_user.id;

        GET DIAGNOSTICS v_ships_removed = ROW_COUNT;

        RAISE NOTICE '  ✓ Eliminadas % entradas de naves', v_ships_removed;

        v_affected_count := v_affected_count + 1;
      ELSE
        RAISE NOTICE 'Usuario: % (ID: %) - No tenía naves en stock',
          v_user.username, v_user.id;
      END IF;
    END IF;
  END LOOP;

  RAISE NOTICE '';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'RESUMEN DE LIMPIEZA';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Total de usuarios afectados: %', v_affected_count;
  RAISE NOTICE '';
  RAISE NOTICE 'Las naves en vuelo NO fueron afectadas.';
  RAISE NOTICE 'Los usuarios deberán reconstruir su flota desde cero.';
  RAISE NOTICE '========================================';
END $$;

-- ============================================================================
-- PASO 2: Recalcular puntos de flota para los usuarios afectados
-- ============================================================================

DO $$
DECLARE
  v_user RECORD;
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE 'Recalculando puntos de flota...';

  FOR v_user IN
    SELECT p.id, p.points_total
    FROM profiles p
    WHERE p.is_admin = false
      AND EXISTS(
        SELECT 1
        FROM admin_revenue ar
        WHERE ar.related_user_id = p.id
          AND ar.revenue_type = 'fleet_acceleration'
      )
    ORDER BY p.points_total DESC
    LIMIT 14
  LOOP
    PERFORM update_user_points(v_user.id);
  END LOOP;

  RAISE NOTICE '✓ Puntos actualizados';
END $$;

-- ============================================================================
-- PASO 3: Crear registro de auditoría
-- ============================================================================

DO $$
BEGIN
  -- Insertar mensaje en la tabla de mensajes del sistema para los afectados
  INSERT INTO messages (sender_id, recipient_id, subject, body, message_type)
  SELECT
    NULL,
    p.id,
    'Limpieza de Bug: Duplicación de Naves',
    E'Debido al bug de duplicación de naves al usar la aceleración de flota, todas tus naves han sido eliminadas.\n\n' ||
    'Este fue un bug que permitía duplicar naves de forma injusta. Todos los jugadores afectados por este bug han recibido el mismo tratamiento.\n\n' ||
    'Tus edificios, recursos, tecnologías y defensas permanecen intactos. Solo necesitas reconstruir tu flota.\n\n' ||
    'Disculpa las molestias.',
    'system'
  FROM profiles p
  WHERE p.is_admin = false
    AND EXISTS(
      SELECT 1
      FROM admin_revenue ar
      WHERE ar.related_user_id = p.id
        AND ar.revenue_type = 'fleet_acceleration'
    )
  ORDER BY p.points_total DESC
  LIMIT 14;

  RAISE NOTICE '';
  RAISE NOTICE '✓ Mensajes de notificación enviados a usuarios afectados';
END $$;

-- ============================================================================
-- NOTAS FINALES
-- ============================================================================
--
-- Esta migración es IRREVERSIBLE. Las naves eliminadas no pueden recuperarse.
--
-- Elementos NO afectados:
-- - Edificios (planet_buildings)
-- - Recursos (planet_resources)
-- - Tecnologías (user_technologies)
-- - Defensas (planet_defenses)
-- - Flotas en vuelo (fleets)
-- - Oficiales activos
-- - Balance de FXU
--
-- Elementos afectados:
-- - Naves en stock de todos los planetas (planet_ships)
-- - Puntos de flota (recalculados automáticamente)
--
-- ============================================================================
