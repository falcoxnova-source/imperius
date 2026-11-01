-- Smart per-NPC empire distribution:
--   Planeta principal (is_main_planet): military
--   1 planeta: research (si el NPC tiene >= 3 planetas)
--   1 planeta: colonizer (si el NPC tiene >= 4 planetas)
--   Resto: miner
-- Cada NPC se distribuye INDEPENDIENTEMENTE, como un imperio realista.

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
    -- Count planets for this NPC
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

      -- Decide role for this slot
      IF v_idx = 1 THEN
        -- Main planet → military
        v_role := 'military';
      ELSIF v_idx = 2 AND v_planet_count >= 3 THEN
        -- Second planet → research (only if NPC has 3+ planets)
        v_role := 'research';
      ELSIF v_idx = 3 AND v_planet_count >= 4 THEN
        -- Third planet → colonizer (only if NPC has 4+ planets)
        v_role := 'colonizer';
      ELSE
        -- Everyone else → miner
        v_role := 'miner';
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
    'strategy', 'empire',
    'npcs_processed', v_npcs_processed,
    'planets_updated', v_total,
    'distribution', v_counts,
    'rules', jsonb_build_object(
      'main_planet', 'military',
      'slot_2_if_3plus', 'research',
      'slot_3_if_4plus', 'colonizer',
      'rest', 'miner'
    )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_distribute_npc_roles_smart() TO authenticated;
