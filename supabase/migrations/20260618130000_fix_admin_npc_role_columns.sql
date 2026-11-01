-- Fix: planets table uses `last_update`, not `updated_at`
-- Re-create NPC role admin RPCs with correct column name

CREATE OR REPLACE FUNCTION public.admin_set_npc_planet_role(
  p_planet_id uuid,
  p_role text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_admin boolean;
  v_is_bot boolean;
  v_planet_name text;
BEGIN
  SELECT is_admin INTO v_is_admin FROM profiles WHERE id = auth.uid();
  IF v_is_admin IS NOT TRUE THEN
    RAISE EXCEPTION 'Access denied: admin only';
  END IF;

  IF p_role NOT IN ('balanced','miner','military','research','colonizer') THEN
    RAISE EXCEPTION 'Invalid role: %', p_role;
  END IF;

  SELECT p.is_bot, pl.name
    INTO v_is_bot, v_planet_name
  FROM planets pl
  JOIN profiles p ON p.id = pl.user_id
  WHERE pl.id = p_planet_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Planet not found';
  END IF;

  IF v_is_bot IS NOT TRUE THEN
    RAISE EXCEPTION 'Planet does not belong to a bot/NPC';
  END IF;

  UPDATE planets
  SET autopilot_role = p_role,
      last_update = now()
  WHERE id = p_planet_id;

  RETURN jsonb_build_object(
    'success', true,
    'planet_id', p_planet_id,
    'planet_name', v_planet_name,
    'new_role', p_role
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_set_npc_planet_role(uuid, text) TO authenticated;


CREATE OR REPLACE FUNCTION public.admin_set_all_npc_planets_role(
  p_npc_id uuid,
  p_role text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_admin boolean;
  v_is_bot boolean;
  v_username text;
  v_count integer;
BEGIN
  SELECT is_admin INTO v_is_admin FROM profiles WHERE id = auth.uid();
  IF v_is_admin IS NOT TRUE THEN
    RAISE EXCEPTION 'Access denied: admin only';
  END IF;

  IF p_role NOT IN ('balanced','miner','military','research','colonizer') THEN
    RAISE EXCEPTION 'Invalid role: %', p_role;
  END IF;

  SELECT is_bot, username INTO v_is_bot, v_username FROM profiles WHERE id = p_npc_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'NPC not found';
  END IF;
  IF v_is_bot IS NOT TRUE THEN
    RAISE EXCEPTION 'Profile is not a bot/NPC';
  END IF;

  UPDATE planets
  SET autopilot_role = p_role,
      last_update = now()
  WHERE user_id = p_npc_id;

  GET DIAGNOSTICS v_count = ROW_COUNT;

  RETURN jsonb_build_object(
    'success', true,
    'npc_id', p_npc_id,
    'username', v_username,
    'planets_updated', v_count,
    'new_role', p_role
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_set_all_npc_planets_role(uuid, text) TO authenticated;


CREATE OR REPLACE FUNCTION public.admin_distribute_npc_roles(
  p_strategy text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_admin boolean;
  v_total integer;
  v_counts jsonb := '{}'::jsonb;
  v_role text;
  v_weights jsonb;
BEGIN
  SELECT is_admin INTO v_is_admin FROM profiles WHERE id = auth.uid();
  IF v_is_admin IS NOT TRUE THEN
    RAISE EXCEPTION 'Access denied: admin only';
  END IF;

  IF p_strategy LIKE 'all_%' THEN
    v_role := substring(p_strategy FROM 5);
    IF v_role NOT IN ('balanced','miner','military','research','colonizer') THEN
      RAISE EXCEPTION 'Invalid role in all_%% strategy: %', v_role;
    END IF;
    UPDATE planets pl
    SET autopilot_role = v_role,
        last_update = now()
    FROM profiles p
    WHERE p.id = pl.user_id AND p.is_bot = true;
    GET DIAGNOSTICS v_total = ROW_COUNT;
    RETURN jsonb_build_object(
      'success', true,
      'strategy', p_strategy,
      'planets_updated', v_total,
      'distribution', jsonb_build_object(v_role, v_total)
    );
  END IF;

  CASE p_strategy
    WHEN 'strategic' THEN
      v_weights := jsonb_build_object('military', 40, 'miner', 30, 'balanced', 15, 'research', 10, 'colonizer', 5);
    WHEN 'aggressive' THEN
      v_weights := jsonb_build_object('military', 60, 'miner', 20, 'balanced', 10, 'research', 5, 'colonizer', 5);
    WHEN 'economic' THEN
      v_weights := jsonb_build_object('military', 20, 'miner', 50, 'balanced', 15, 'research', 10, 'colonizer', 5);
    WHEN 'even' THEN
      v_weights := jsonb_build_object('military', 20, 'miner', 20, 'balanced', 20, 'research', 20, 'colonizer', 20);
    ELSE
      RAISE EXCEPTION 'Unknown strategy: %. Use strategic|aggressive|economic|even|all_<role>', p_strategy;
  END CASE;

  WITH npc_planets AS (
    SELECT pl.id, random()*100 AS roll
    FROM planets pl
    JOIN profiles p ON p.id = pl.user_id
    WHERE p.is_bot = true
  ),
  assigned AS (
    SELECT id,
      CASE
        WHEN roll <  (v_weights->>'military')::numeric THEN 'military'
        WHEN roll <  (v_weights->>'military')::numeric + (v_weights->>'miner')::numeric THEN 'miner'
        WHEN roll <  (v_weights->>'military')::numeric + (v_weights->>'miner')::numeric + (v_weights->>'balanced')::numeric THEN 'balanced'
        WHEN roll <  (v_weights->>'military')::numeric + (v_weights->>'miner')::numeric + (v_weights->>'balanced')::numeric + (v_weights->>'research')::numeric THEN 'research'
        ELSE 'colonizer'
      END AS new_role
    FROM npc_planets
  )
  UPDATE planets pl
  SET autopilot_role = a.new_role,
      last_update = now()
  FROM assigned a
  WHERE pl.id = a.id;

  GET DIAGNOSTICS v_total = ROW_COUNT;

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
    'strategy', p_strategy,
    'planets_updated', v_total,
    'weights', v_weights,
    'distribution', v_counts
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_distribute_npc_roles(text) TO authenticated;
