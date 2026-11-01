/*
  # Fix ACS (Ataque Coordinado) creation error + full combat flow

  ## Problem (reported: "Error al crear el ataque ACS" -> HTTP 400 on create_acs_from_fleet)
  Root cause: the `acs_fleets` table is MISSING the columns that the whole ACS
  system references: `creator_id`, `status`, `current_participants`, `invited_users`.
  - `create_acs_from_fleet` INSERTs into these columns -> "column ... does not exist"
    -> unhandled SQL error -> PostgREST returns 400 (this is the user-visible error).
  - `check_and_process_acs`, `check_pending_acs_attacks`, `process_acs_fleet_arrival`
    and `get_available_acs_attacks` all read `status` / `current_participants` /
    `creator_id`, so even after creation the battle would never resolve.

  Additionally:
  - The ACS arrival processor (`check_pending_acs_attacks`) was ORPHANED: nothing
    ever called it, so ACS combat + battle reports never happened.
  - `process_all_pending_fleets` processed ACS attack fleets individually
    (via `process_fleet_arrival` -> `perform_combat`), which is wrong for a
    combined attack and would double-process them.

  ## Fixes (all idempotent / non-destructive)
  1. Add the missing columns to `acs_fleets` (ADD COLUMN IF NOT EXISTS + defaults).
  2. Backfill `creator_id` / `current_participants` for any pre-existing rows.
  3. Seed the `alliance_depot` building (needed by the slot formula) if absent.
  4. Recreate `create_acs_from_fleet` with a clear, intuitive message when the
     origin planet has NO Alliance Depot (instead of silently creating a useless
     1-slot ACS or crashing).
  5. Wire ACS arrival processing into `process_all_pending_fleets` (skip outgoing
     ACS fleets from individual combat, then resolve pending ACS attacks).

  ## Safety
  - No tables/columns dropped or renamed. No game logic removed.
  - CREATE OR REPLACE on existing functions (same signatures).
  - Re-runnable: IF NOT EXISTS / ON CONFLICT DO NOTHING everywhere.
*/

-- ============================================================
-- 0. ADD MISSING ACS COLUMNS TO fleets
--    The whole ACS system (create_acs_from_fleet, join_acs_attack,
--    process_fleet_arrival, process_all_pending_fleets) references
--    fleets.is_acs / fleets.acs_id, but they were missing on production.
--    Safe defaults: existing fleets are not part of any ACS.
-- ============================================================
ALTER TABLE public.fleets ADD COLUMN IF NOT EXISTS acs_id uuid;
ALTER TABLE public.fleets ADD COLUMN IF NOT EXISTS is_acs boolean NOT NULL DEFAULT false;

-- ============================================================
-- 1. ADD MISSING COLUMNS TO acs_fleets
-- ============================================================
ALTER TABLE public.acs_fleets ADD COLUMN IF NOT EXISTS creator_id uuid;
ALTER TABLE public.acs_fleets ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'waiting';
ALTER TABLE public.acs_fleets ADD COLUMN IF NOT EXISTS current_participants integer NOT NULL DEFAULT 1;
ALTER TABLE public.acs_fleets ADD COLUMN IF NOT EXISTS invited_users uuid[] NOT NULL DEFAULT ARRAY[]::uuid[];

-- ============================================================
-- 2. BACKFILL EXISTING ROWS (safety for any legacy data)
-- ============================================================
-- creator_id: derive from the main fleet's owner when possible
UPDATE public.acs_fleets af
SET creator_id = f.user_id
FROM public.fleets f
WHERE af.creator_id IS NULL
  AND af.main_fleet_id = f.id;

-- current_participants: real count from acs_participants (min 1)
UPDATE public.acs_fleets af
SET current_participants = GREATEST(1, (
  SELECT COUNT(*) FROM public.acs_participants ap WHERE ap.acs_id = af.id
))
WHERE af.current_participants IS NULL OR af.current_participants < 1;

-- ============================================================
-- 3. SEED alliance_depot BUILDING (idempotent) - required by slot formula
-- ============================================================
INSERT INTO public.building_types (code, name, description, category, base_metal, base_crystal, base_deuterium, base_energy, cost_factor, base_time_seconds, max_level)
VALUES (
  'alliance_depot',
  'Deposito de la Alianza',
  'Permite que flotas aliadas puedan estacionar en tu planeta para ataques coordinados (ACS). Cada nivel aumenta los slots disponibles para flotas aliadas.',
  'facilities',
  20000, 40000, 0, 0,
  2.0, 180, 10
)
ON CONFLICT (code) DO NOTHING;

-- ============================================================
-- 4. RECREATE create_acs_from_fleet (robust + intuitive depot message)
-- ============================================================
CREATE OR REPLACE FUNCTION public.create_acs_from_fleet(p_fleet_id uuid, p_acs_name text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_fleet record;
  v_alliance_id uuid;
  v_acs_id uuid;
  v_acs_name text;
  v_user_id uuid;
  v_depot_level integer;
  v_max_fleets integer;
  v_depot_type_id integer;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Usuario no autenticado');
  END IF;

  SELECT * INTO v_fleet FROM fleets
  WHERE id = p_fleet_id
  AND user_id = v_user_id
  AND mission_type = 'attack'
  AND is_returning = false
  AND is_completed = false;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Flota no encontrada o no es una mision de ataque valida');
  END IF;

  IF v_fleet.acs_id IS NOT NULL OR v_fleet.is_acs = true THEN
    RETURN jsonb_build_object('success', false, 'error', 'Esta flota ya forma parte de un ataque ACS');
  END IF;

  SELECT alliance_id INTO v_alliance_id FROM alliance_members WHERE user_id = v_user_id;
  IF v_alliance_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Debes ser miembro de una alianza para crear un ataque ACS');
  END IF;

  -- Alliance Depot level on the ORIGIN planet drives the ACS slot count.
  -- Formula (XNova classic): slots = min(5, 1 + floor(depot_level / 2))
  SELECT id INTO v_depot_type_id FROM building_types WHERE code = 'alliance_depot';

  IF v_depot_type_id IS NOT NULL AND v_fleet.origin_planet_id IS NOT NULL THEN
    SELECT COALESCE(pb.level, 0) INTO v_depot_level
    FROM planet_buildings pb
    WHERE pb.planet_id = v_fleet.origin_planet_id
      AND pb.building_type_id = v_depot_type_id;
  END IF;

  v_depot_level := COALESCE(v_depot_level, 0);

  -- Intuitive message instead of a raw error when there is no Alliance Depot:
  -- without it there are no slots for allied fleets, so an ACS makes no sense.
  IF v_depot_level < 1 THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Necesitas un Deposito de la Alianza (nivel 1 o superior) en el planeta de origen para coordinar un ataque ACS. Construyelo en la seccion de Instalaciones.'
    );
  END IF;

  v_max_fleets := LEAST(5, 1 + FLOOR(v_depot_level / 2)::integer);

  v_acs_name := COALESCE(NULLIF(TRIM(p_acs_name), ''), 'ACS-' || substr(p_fleet_id::text, 1, 8));

  INSERT INTO acs_fleets (
    main_fleet_id, alliance_id, name, creator_id,
    target_galaxy, target_system, target_position,
    arrival_time, max_fleets, is_active, status,
    current_participants, invited_users
  ) VALUES (
    p_fleet_id, v_alliance_id, v_acs_name, v_user_id,
    v_fleet.target_galaxy, v_fleet.target_system, v_fleet.target_position,
    v_fleet.arrival_time, v_max_fleets, true, 'waiting',
    1, ARRAY[]::uuid[]
  ) RETURNING id INTO v_acs_id;

  UPDATE fleets SET acs_id = v_acs_id, is_acs = true WHERE id = p_fleet_id;

  INSERT INTO acs_participants (acs_id, fleet_id, user_id)
  VALUES (v_acs_id, p_fleet_id, v_user_id);

  RETURN jsonb_build_object(
    'success', true,
    'acs_id', v_acs_id,
    'max_fleets', v_max_fleets,
    'message', format('Ataque ACS "%s" creado exitosamente. Slots disponibles: %s.', v_acs_name, v_max_fleets)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_acs_from_fleet(uuid, text) TO authenticated;

-- ============================================================
-- 5. WIRE ACS ARRIVAL PROCESSING INTO THE FLEET TICK
--    - Skip outgoing ACS fleets from individual combat.
--    - Resolve pending ACS attacks (generates the ACS battle reports).
--    Preserves existing deploy-skip + fortress (250:8) exemption.
-- ============================================================
CREATE OR REPLACE FUNCTION public.process_all_pending_fleets()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_fleet record;
  v_processed_count integer := 0;
  v_error_count integer := 0;
BEGIN
  -- Outgoing fleets that have arrived at their target
  FOR v_fleet IN
    SELECT id
    FROM fleets
    WHERE is_completed = false
    AND NOT is_returning
    AND arrival_time <= NOW()
    AND mission_type != 'hold'
    -- ACS attack fleets are resolved as a group by the ACS processor below,
    -- never individually.
    AND COALESCE(is_acs, false) = false
    AND NOT (
      mission_type = 'deploy'
      AND cargo_metal = 0 AND cargo_crystal = 0 AND cargo_deuterium = 0
      -- fortress deploys (system 250, position 8) must still be processed
      AND NOT (fleets.target_system = 250 AND fleets.target_position = 8)
      AND NOT EXISTS (
        SELECT 1 FROM planets p
        WHERE p.user_id = fleets.user_id
        AND p.galaxy = fleets.target_galaxy
        AND p.solar_system = fleets.target_system
        AND p.position = fleets.target_position
      )
    )
    ORDER BY arrival_time ASC
    LIMIT 100
  LOOP
    BEGIN
      PERFORM process_fleet_arrival(v_fleet.id);
      v_processed_count := v_processed_count + 1;
    EXCEPTION WHEN OTHERS THEN
      v_error_count := v_error_count + 1;
      RAISE WARNING 'Error processing fleet %: %', v_fleet.id, SQLERRM;
    END;
  END LOOP;

  -- Resolve any coordinated (ACS) attacks whose arrival time has passed.
  -- This runs the combined combat and sends the ACS battle reports.
  BEGIN
    PERFORM check_pending_acs_attacks();
  EXCEPTION WHEN OTHERS THEN
    v_error_count := v_error_count + 1;
    RAISE WARNING 'Error processing pending ACS attacks: %', SQLERRM;
  END;

  -- Returning fleets (including ACS survivors returning home)
  FOR v_fleet IN
    SELECT id
    FROM fleets
    WHERE is_completed = false
    AND is_returning
    AND return_time <= NOW()
    ORDER BY return_time ASC
    LIMIT 100
  LOOP
    BEGIN
      PERFORM process_fleet_arrival(v_fleet.id);
      v_processed_count := v_processed_count + 1;
    EXCEPTION WHEN OTHERS THEN
      v_error_count := v_error_count + 1;
      RAISE WARNING 'Error processing returning fleet %: %', v_fleet.id, SQLERRM;
    END;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'processed_count', v_processed_count,
    'error_count', v_error_count
  );
END;
$$;
