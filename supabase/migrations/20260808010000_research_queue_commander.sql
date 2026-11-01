-- ============================================================
-- COLA DE INVESTIGACION CON COMANDANTE
-- ============================================================
-- Problema: el frontend ya permite encolar hasta 2 investigaciones
-- adicionales cuando el jugador tiene el oficial Comandante activo,
-- pero el backend rechazaba siempre con 'Research already in progress'
-- y la funcion secure_cancel_queued_research no existia.
--
-- Esta migracion:
--   1. Crea promote_next_queued_research(uuid): arranca la siguiente
--      investigacion en cola cuando no hay ninguna activa.
--   2. secure_start_research: si ya hay investigacion en curso y el
--      jugador tiene Comandante con menos de 2 entradas en cola,
--      cobra los recursos y encola en lugar de rechazar.
--   3. Crea secure_cancel_queued_research(uuid): cancela una entrada
--      en cola y devuelve el 100% de los recursos (no ha empezado).
--   4. complete_research e instant_complete_research promueven la
--      siguiente entrada de la cola al terminar.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Promotor de la cola
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.promote_next_queued_research(p_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_next RECORD;
  v_now timestamptz;
  v_end timestamptz;
BEGIN
  IF p_user_id IS NULL THEN
    RETURN false;
  END IF;

  -- Solo puede haber UNA investigacion activa a la vez
  IF EXISTS (
    SELECT 1 FROM user_technologies
    WHERE user_id = p_user_id AND is_researching = true
  ) THEN
    RETURN false;
  END IF;

  SELECT * INTO v_next
  FROM research_queue
  WHERE user_id = p_user_id
    AND status IN ('queued', 'pending')
  ORDER BY queue_position ASC, created_at ASC
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  v_now := now();
  v_end := v_now + (GREATEST(1, v_next.research_time) || ' seconds')::interval;

  INSERT INTO user_technologies (
    user_id, technology_type_id, level, is_researching,
    research_start_time, research_end_time, research_planet_id
  ) VALUES (
    p_user_id, v_next.technology_type_id, GREATEST(0, v_next.target_level - 1), true,
    v_now, v_end, v_next.planet_id
  )
  ON CONFLICT (user_id, technology_type_id) DO UPDATE SET
    is_researching = true,
    research_start_time = v_now,
    research_end_time = v_end,
    research_planet_id = v_next.planet_id;

  DELETE FROM research_queue WHERE id = v_next.id;

  WITH ranked AS (
    SELECT id, ROW_NUMBER() OVER (ORDER BY queue_position ASC, created_at ASC) AS new_pos
    FROM research_queue
    WHERE user_id = p_user_id AND status IN ('queued', 'pending')
  )
  UPDATE research_queue rq
  SET queue_position = ranked.new_pos
  FROM ranked
  WHERE rq.id = ranked.id;

  RETURN true;
END;
$fn$;

REVOKE ALL ON FUNCTION public.promote_next_queued_research(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.promote_next_queued_research(uuid) TO authenticated;

-- ------------------------------------------------------------
-- 2. secure_start_research: encolar si hay Comandante
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.secure_start_research(p_planet_id uuid, p_tech_type_id integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
SET statement_timeout TO '60s'
SET lock_timeout TO '30s'
AS $fn$
DECLARE
  v_validation jsonb;
  v_planet RECORD;
  v_tech_type RECORD;
  v_current_level integer;
  v_resources RECORD;
  v_cost_metal bigint;
  v_cost_crystal bigint;
  v_cost_deuterium bigint;
  v_effective_lab_level integer;
  v_research_time integer;
  v_start_time timestamptz;
  v_end_time timestamptz;
  v_existing_research boolean;
  v_game_speed integer;
  v_has_technocrat boolean;
  v_lab_in_queue boolean;
  v_research_lab_type_id integer;
  v_total_energy integer;
  v_scaled_energy bigint;
  v_university_level integer;
  v_has_commander boolean;
  v_queue_count integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  IF is_user_in_vacation_mode(auth.uid()) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cannot research while in vacation mode');
  END IF;

  SELECT * INTO v_planet FROM planets WHERE id = p_planet_id AND user_id = auth.uid();
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Planet not found or not owned');
  END IF;

  SELECT EXISTS(
    SELECT 1 FROM user_technologies
    WHERE user_id = auth.uid() AND is_researching = true
  ) INTO v_existing_research;

  SELECT COUNT(*)::integer INTO v_queue_count
  FROM research_queue
  WHERE user_id = auth.uid() AND status IN ('queued', 'pending');

  -- Con investigacion en curso solo se puede ENCOLAR y solo con Comandante
  IF v_existing_research THEN
    v_has_commander := has_active_officer(auth.uid(), 'commander');

    IF NOT v_has_commander THEN
      RETURN jsonb_build_object('success', false, 'error', 'Research already in progress');
    END IF;

    IF v_queue_count >= 2 THEN
      RETURN jsonb_build_object('success', false, 'error', 'Research queue is full');
    END IF;

    IF EXISTS (
      SELECT 1 FROM user_technologies
      WHERE user_id = auth.uid()
        AND technology_type_id = p_tech_type_id
        AND is_researching = true
    ) THEN
      RETURN jsonb_build_object('success', false, 'error', 'Technology already being researched');
    END IF;

    IF EXISTS (
      SELECT 1 FROM research_queue
      WHERE user_id = auth.uid()
        AND technology_type_id = p_tech_type_id
        AND status IN ('queued', 'pending')
    ) THEN
      RETURN jsonb_build_object('success', false, 'error', 'Technology already in queue');
    END IF;
  END IF;

  SELECT id INTO v_research_lab_type_id FROM building_types WHERE code = 'research_lab';
  IF v_research_lab_type_id IS NOT NULL THEN
    SELECT EXISTS(
      SELECT 1 FROM building_queue
      WHERE planet_id = p_planet_id AND building_type_id = v_research_lab_type_id
    ) INTO v_lab_in_queue;

    IF v_lab_in_queue THEN
      RETURN jsonb_build_object('success', false, 'error', 'Cannot research while Research Lab is being upgraded');
    END IF;
  END IF;

  v_validation := validate_research_requirements(auth.uid(), p_planet_id, p_tech_type_id);
  IF NOT (v_validation->>'valid')::boolean THEN
    RETURN jsonb_build_object('success', false, 'error', 'Requirements not met', 'details', v_validation);
  END IF;

  SELECT * INTO v_tech_type FROM technology_types WHERE id = p_tech_type_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Technology type not found');
  END IF;

  SELECT COALESCE(ut.level, 0) INTO v_current_level
  FROM user_technologies ut
  WHERE ut.user_id = auth.uid() AND ut.technology_type_id = p_tech_type_id;
  IF v_current_level IS NULL THEN v_current_level := 0; END IF;

  IF v_current_level >= v_tech_type.max_level THEN
    RETURN jsonb_build_object('success', false, 'error', 'Max level reached');
  END IF;

  -- Check energy requirement scaled by level (e.g. Graviton Technology)
  IF v_tech_type.energy_required > 0 THEN
    SELECT COALESCE((calculate_planet_resources(p_planet_id)->>'energy_max')::integer, 0)
    INTO v_total_energy;

    v_scaled_energy := CEIL(v_tech_type.energy_required * POWER(v_tech_type.cost_factor, v_current_level));

    IF COALESCE(v_total_energy, 0) < v_scaled_energy THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'Insufficient energy production. Required: ' || v_scaled_energy || ', Available: ' || COALESCE(v_total_energy, 0)
      );
    END IF;
  END IF;

  v_cost_metal := FLOOR(v_tech_type.base_metal * POWER(v_tech_type.cost_factor, v_current_level));
  v_cost_crystal := FLOOR(v_tech_type.base_crystal * POWER(v_tech_type.cost_factor, v_current_level));
  v_cost_deuterium := FLOOR(v_tech_type.base_deuterium * POWER(v_tech_type.cost_factor, v_current_level));

  SELECT * INTO v_resources FROM planet_resources WHERE planet_id = p_planet_id FOR UPDATE;
  IF v_resources.metal < v_cost_metal OR v_resources.crystal < v_cost_crystal OR v_resources.deuterium < v_cost_deuterium THEN
    RETURN jsonb_build_object('success', false, 'error', 'Insufficient resources');
  END IF;

  v_effective_lab_level := calculate_irn_lab_level(auth.uid(), p_planet_id);
  IF v_effective_lab_level IS NULL OR v_effective_lab_level < 1 THEN
    v_effective_lab_level := 1;
  END IF;

  v_game_speed := get_game_speed();
  v_has_technocrat := has_active_officer(auth.uid(), 'technocrat');

  v_research_time := GREATEST(1, FLOOR((v_cost_metal + v_cost_crystal) / (1000.0 * (1 + v_effective_lab_level)) * 3600 / v_game_speed));

  IF v_has_technocrat THEN
    v_research_time := GREATEST(1, FLOOR(v_research_time * 0.75));
  END IF;

  -- VIP Plus: -10% research time (stacks with Technocrat)
  IF is_user_plus(auth.uid()) THEN
    v_research_time := GREATEST(1, FLOOR(v_research_time * 0.90));
  END IF;

  SELECT COALESCE(pb.level, 0) INTO v_university_level
  FROM planet_buildings pb
  JOIN building_types bt ON pb.building_type_id = bt.id
  WHERE pb.planet_id = p_planet_id AND bt.code = 'university';

  IF COALESCE(v_university_level, 0) > 0 THEN
    v_research_time := GREATEST(1, FLOOR(v_research_time * POWER(0.92, v_university_level)));
  END IF;

  UPDATE planet_resources
  SET metal = metal - v_cost_metal,
      crystal = crystal - v_cost_crystal,
      deuterium = deuterium - v_cost_deuterium,
      last_update = now()
  WHERE planet_id = p_planet_id;

  -- Hay investigacion en curso -> va a la cola del Comandante
  IF v_existing_research THEN
    INSERT INTO research_queue (
      user_id, technology_type_id, target_level,
      metal_cost, crystal_cost, deuterium_cost,
      research_time, queue_position, status, planet_id
    ) VALUES (
      auth.uid(), p_tech_type_id, v_current_level + 1,
      v_cost_metal, v_cost_crystal, v_cost_deuterium,
      v_research_time, v_queue_count + 1, 'queued', p_planet_id
    );

    RETURN jsonb_build_object(
      'success', true,
      'queued', true,
      'queue_position', v_queue_count + 1,
      'target_level', v_current_level + 1,
      'research_time_seconds', v_research_time,
      'technocrat_bonus', v_has_technocrat
    );
  END IF;

  v_start_time := now();
  v_end_time := v_start_time + (v_research_time || ' seconds')::interval;

  INSERT INTO user_technologies (
    user_id, technology_type_id, level, is_researching,
    research_start_time, research_end_time, research_planet_id
  ) VALUES (
    auth.uid(), p_tech_type_id, v_current_level, true,
    v_start_time, v_end_time, p_planet_id
  )
  ON CONFLICT (user_id, technology_type_id) DO UPDATE SET
    is_researching = true,
    research_start_time = v_start_time,
    research_end_time = v_end_time,
    research_planet_id = p_planet_id;

  RETURN jsonb_build_object(
    'success', true,
    'queued', false,
    'target_level', v_current_level + 1,
    'start_time', v_start_time,
    'end_time', v_end_time,
    'research_time_seconds', v_research_time,
    'technocrat_bonus', v_has_technocrat
  );
END;
$fn$;

-- ------------------------------------------------------------
-- 3. Cancelar una investigacion en cola (reembolso 100%)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.secure_cancel_queued_research(p_queue_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_user_id uuid;
  v_item RECORD;
  v_refund_planet_id uuid;
BEGIN
  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  SELECT * INTO v_item
  FROM research_queue
  WHERE id = p_queue_id AND user_id = v_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Queued research not found');
  END IF;

  IF v_item.status NOT IN ('queued', 'pending') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Research is not queued');
  END IF;

  -- Devolver los recursos al planeta que los pago (o al principal si ya no existe)
  SELECT p.id INTO v_refund_planet_id
  FROM planets p
  WHERE p.id = v_item.planet_id AND p.user_id = v_user_id;

  IF v_refund_planet_id IS NULL THEN
    SELECT p.id INTO v_refund_planet_id
    FROM planets p
    WHERE p.user_id = v_user_id
    ORDER BY p.created_at ASC
    LIMIT 1;
  END IF;

  IF v_refund_planet_id IS NOT NULL THEN
    UPDATE planet_resources
    SET metal = metal + v_item.metal_cost,
        crystal = crystal + v_item.crystal_cost,
        deuterium = deuterium + v_item.deuterium_cost,
        last_update = now()
    WHERE planet_id = v_refund_planet_id;
  END IF;

  DELETE FROM research_queue WHERE id = p_queue_id;

  WITH ranked AS (
    SELECT id, ROW_NUMBER() OVER (ORDER BY queue_position ASC, created_at ASC) AS new_pos
    FROM research_queue
    WHERE user_id = v_user_id AND status IN ('queued', 'pending')
  )
  UPDATE research_queue rq
  SET queue_position = ranked.new_pos
  FROM ranked
  WHERE rq.id = ranked.id;

  RETURN jsonb_build_object(
    'success', true,
    'refund_metal', v_item.metal_cost,
    'refund_crystal', v_item.crystal_cost,
    'refund_deuterium', v_item.deuterium_cost,
    'refund_planet_id', v_refund_planet_id
  );
END;
$fn$;

REVOKE ALL ON FUNCTION public.secure_cancel_queued_research(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.secure_cancel_queued_research(uuid) TO authenticated;

-- ------------------------------------------------------------
-- 4. Promover la cola al terminar una investigacion
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.complete_research(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  research_record RECORD;
  v_completed integer := 0;
BEGIN
  IF p_user_id != auth.uid() THEN
    RAISE EXCEPTION 'Unauthorized: can only complete own research';
  END IF;

  FOR research_record IN
    SELECT id, level
    FROM user_technologies
    WHERE user_id = p_user_id
    AND is_researching = true
    AND research_end_time <= NOW()
  LOOP
    UPDATE user_technologies
    SET
      level = level + 1,
      is_researching = false,
      research_end_time = NULL,
      research_planet_id = NULL
    WHERE id = research_record.id;

    v_completed := v_completed + 1;
  END LOOP;

  IF v_completed > 0 THEN
    PERFORM promote_next_queued_research(p_user_id);
  END IF;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.instant_complete_research(p_research_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_user_id uuid;
  v_research RECORD;
  v_fxu_cost integer;
  v_current_fxu numeric;
  v_remaining_seconds integer;
BEGIN
  v_user_id := auth.uid();
  IF is_user_in_vacation_mode(v_user_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cannot use instant complete while in vacation mode');
  END IF;
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  SELECT ur.*, rt.name as research_name
  INTO v_research
  FROM user_technologies ur
  JOIN technology_types rt ON ur.technology_type_id = rt.id
  WHERE ur.id = p_research_id AND ur.is_researching = true;

  IF v_research IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Research not found or not in progress');
  END IF;

  IF v_research.user_id != v_user_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not your research');
  END IF;

  v_remaining_seconds := GREATEST(0, EXTRACT(EPOCH FROM (v_research.research_end_time - now()))::integer);
  v_fxu_cost := calculate_fxu_cost_research(p_research_id);

  SELECT fxu_balance INTO v_current_fxu FROM profiles WHERE id = v_user_id;
  IF v_current_fxu < v_fxu_cost THEN
    RETURN jsonb_build_object('success', false, 'error', 'Insufficient FXU', 'required', v_fxu_cost, 'available', v_current_fxu);
  END IF;

  PERFORM set_config('app.fxu_update_allowed', 'instant_complete_research', true);

  UPDATE profiles SET fxu_balance = fxu_balance - v_fxu_cost WHERE id = v_user_id;

  -- Reparto empresa/pool/referido del costo
  PERFORM distribute_spend_fee(v_fxu_cost, 'instant_research', 'instant_research',
    v_user_id, 'Investigacion: ' || COALESCE(v_research.research_name, ''), p_research_id);

  UPDATE user_technologies
  SET level = level + 1,
      is_researching = false,
      research_end_time = NULL
  WHERE id = p_research_id;

  PERFORM update_user_points(v_user_id);

  -- Arrancar la siguiente investigacion en cola (Comandante)
  PERFORM promote_next_queued_research(v_user_id);

  RETURN jsonb_build_object('success', true, 'fxu_spent', v_fxu_cost);
END;
$fn$;

-- ------------------------------------------------------------
-- 5. Descripcion del Comandante
-- ------------------------------------------------------------
UPDATE public.officer_types
SET description = 'Expande la cola de construccion permitiendo 2 edificios adicionales en cola y 2 investigaciones adicionales en cola. Proporciona una vision general mejorada del imperio.'
WHERE code = 'commander';

NOTIFY pgrst, 'reload schema';
