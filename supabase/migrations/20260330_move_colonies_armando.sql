-- =====================================================
-- MOVER 2 COLONIAS de armandobejarano20@gmail.com
-- =====================================================
-- Colonia 1: [3:162:7]  → [2:265:15]
-- Colonia 2: [3:162:11] → [4:214:15]
-- =====================================================

DO $$
DECLARE
  v_user_id uuid;
  v_planet1_id uuid;
  v_planet2_id uuid;
  v_conflict1 int;
  v_conflict2 int;
  v_active_fleets1 int;
  v_active_fleets2 int;
BEGIN

  -- 1. Buscar usuario
  SELECT id INTO v_user_id FROM profiles WHERE email = 'armandobejarano20@gmail.com';
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION '❌ Usuario armandobejarano20@gmail.com NO encontrado';
  END IF;
  RAISE NOTICE '✅ Usuario encontrado: %', v_user_id;

  -- 2. Verificar que los planetas origen pertenecen al usuario
  SELECT id INTO v_planet1_id FROM planets WHERE galaxy=3 AND solar_system=162 AND position=7 AND user_id = v_user_id;
  IF v_planet1_id IS NULL THEN
    RAISE EXCEPTION '❌ No se encontró planeta en [3:162:7] para este usuario';
  END IF;
  RAISE NOTICE '✅ Planeta 1 [3:162:7] encontrado: %', v_planet1_id;

  SELECT id INTO v_planet2_id FROM planets WHERE galaxy=3 AND solar_system=162 AND position=11 AND user_id = v_user_id;
  IF v_planet2_id IS NULL THEN
    RAISE EXCEPTION '❌ No se encontró planeta en [3:162:11] para este usuario';
  END IF;
  RAISE NOTICE '✅ Planeta 2 [3:162:11] encontrado: %', v_planet2_id;

  -- 3. Verificar que las coordenadas destino estén LIBRES
  SELECT COUNT(*) INTO v_conflict1 FROM planets WHERE galaxy=2 AND solar_system=265 AND position=15;
  IF v_conflict1 > 0 THEN
    RAISE EXCEPTION '❌ Destino [2:265:15] ya está OCUPADO';
  END IF;
  RAISE NOTICE '✅ Destino [2:265:15] está libre';

  SELECT COUNT(*) INTO v_conflict2 FROM planets WHERE galaxy=4 AND solar_system=214 AND position=15;
  IF v_conflict2 > 0 THEN
    RAISE EXCEPTION '❌ Destino [4:214:15] ya está OCUPADO';
  END IF;
  RAISE NOTICE '✅ Destino [4:214:15] está libre';

  -- 4. Verificar que NO haya flotas activas desde/hacia estos planetas
  SELECT COUNT(*) INTO v_active_fleets1
  FROM fleets
  WHERE is_completed = false
    AND (
      origin_planet_id = v_planet1_id OR
      (target_galaxy=3 AND target_system=162 AND target_position=7)
    );
  IF v_active_fleets1 > 0 THEN
    RAISE EXCEPTION '❌ Hay % flota(s) activa(s) en [3:162:7]. Espera a que terminen.', v_active_fleets1;
  END IF;
  RAISE NOTICE '✅ Sin flotas activas en [3:162:7]';

  SELECT COUNT(*) INTO v_active_fleets2
  FROM fleets
  WHERE is_completed = false
    AND (
      origin_planet_id = v_planet2_id OR
      (target_galaxy=3 AND target_system=162 AND target_position=11)
    );
  IF v_active_fleets2 > 0 THEN
    RAISE EXCEPTION '❌ Hay % flota(s) activa(s) en [3:162:11]. Espera a que terminen.', v_active_fleets2;
  END IF;
  RAISE NOTICE '✅ Sin flotas activas en [3:162:11]';

  -- =====================================================
  -- 5. MOVER LAS COLONIAS
  -- =====================================================
  
  -- Mover [3:162:7] → [2:265:15]
  UPDATE planets 
  SET galaxy = 2, solar_system = 265, position = 15, last_update = NOW()
  WHERE id = v_planet1_id;
  RAISE NOTICE '🚀 Planeta 1 movido: [3:162:7] → [2:265:15]';

  -- Mover [3:162:11] → [4:214:15]
  UPDATE planets 
  SET galaxy = 4, solar_system = 214, position = 15, last_update = NOW()
  WHERE id = v_planet2_id;
  RAISE NOTICE '🚀 Planeta 2 movido: [3:162:11] → [4:214:15]';

  RAISE NOTICE '========================================';
  RAISE NOTICE '✅ ¡COMPLETADO! 2 colonias movidas exitosamente';
  RAISE NOTICE '========================================';

END $$;
