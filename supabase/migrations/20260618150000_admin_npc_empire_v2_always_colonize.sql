-- Empire distribution v2: priorize expansion on small NPCs
-- Rules per NPC (based on planet count):
--   1 planeta:       colonizer (nada más)
--   2 planetas:      colonizer (main) + miner
--   3 planetas:      military (main) + colonizer + miner
--   4 planetas:      military (main) + research + colonizer + miner
--   5+ planetas:     military (main) + research + colonizer + miner (resto)
-- Así SIEMPRE hay un colonizer activo hasta llegar a 5+ planetas.

CREATE OR REPLACE FUNCTION public.admin_distribute_npc_roles_smart()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_admin boolean;
  v_npc RECORD;
  v_planet RECORD;
  v_planet_count integer;
  v_idx integer;
  v_role text;
  v_total integer := 0;
  v_counts jsonb;
  v_npcs_processed integer := 0;
BEGIN
  SELECT is_admin INTO v_is_admin FROM profiles WHERE id = auth.uid();
  IF v_is_admin IS NOT TRUE THEN
    RAISE EXCEPTION 'Access denied: admin only';
  END IF;

  -- Loop each NPC
  FOR v_npc IN
    SELECT id, username FROM profiles WHERE is_bot = true
  LOOP
    SELECT COUNT(*) INTO v_planet_count FROM planets WHERE user_id = v_npc.id;
    IF v_planet_count = 0 THEN
      CONTINUE;
    END IF;

    v_idx := 0;
    v_npcs_processed := v_npcs_processed + 1;

    -- Walk planets ordered: main first, then by created_at
    FOR v_planet IN
      SELECT id, is_main_planet
      FROM planets
      WHERE user_id = v_npc.id
      ORDER BY is_main_planet DESC NULLS LAST, created_at ASC, id
    LOOP
      v_idx := v_idx + 1;

      -- ==========================================================
      -- DECISION TREE BY NPC PLANET COUNT
      -- ==========================================================
      IF v_planet_count <= 2 THEN
        -- Small empire: priorize expansion
        -- Slot 1 (main) = colonizer, Slot 2 = miner
        IF v_idx = 1 THEN
          v_role := 'colonizer';
        ELSE
          v_role := 'miner';
        END IF;

      ELSIF v_planet_count = 3 THEN
        -- Medium empire: main military + one colonizer + one miner
        IF v_idx = 1 THEN
          v_role := 'military';
        ELSIF v_idx = 2 THEN
          v_role := 'colonizer';
        ELSE
          v_role := 'miner';
        END IF;

      ELSE
        -- Large empire (4+): main military + research + colonizer + miners
        IF v_idx = 1 THEN
          v_role := 'military';
        ELSIF v_idx = 2 THEN
          v_role := 'research';
        ELSIF v_idx = 3 THEN
          v_role := 'colonizer';
        ELSE
          v_role := 'miner';
        END IF;
      END IF;

      UPDATE planets
      SET autopilot_role = v_role,
          last_update = now()
      WHERE id = v_planet.id;

      v_total := v_total + 1;
    END LOOP;
  END LOOP;

  -- Final distribution summary
  SELECT jsonb_object_agg(autopilot_role, cnt) INTO v_counts
  FROM (
    SELECT pl.autopilot_role, COUNT(*) AS cnt
    FROM planets pl
    JOIN profiles p ON p.id = pl.user_id
    WHERE p.is_bot = true
    GROUP BY pl.autopilot_role
  ) t;

  RETURN jsonb_build_object(
    'success', true,
    'strategy', 'empire_v2',
    'npcs_processed', v_npcs_processed,
    'planets_updated', v_total,
    'distribution', v_counts,
    'rules', jsonb_build_object(
      'size_1',  'colonizer',
      'size_2',  'colonizer + miner',
      'size_3',  'military + colonizer + miner',
      'size_4',  'military + research + colonizer + miner',
      'size_5+', 'military + research + colonizer + miner(rest)'
    )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_distribute_npc_roles_smart() TO authenticated;
