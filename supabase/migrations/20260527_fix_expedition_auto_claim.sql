-- Fix: get_hero_active_expedition must NOT delete ready-to-claim expeditions
-- Previously it deleted rows where returns_at had passed, preventing claim + XP

CREATE OR REPLACE FUNCTION get_hero_active_expedition(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_active record;
BEGIN
  SELECT a.*, e.name, e.duration_minutes, e.xp_reward, e.hp_damage
  INTO v_active
  FROM hero_ship_active_expedition a
  JOIN hero_ship_expeditions e ON e.id = a.expedition_id
  WHERE a.user_id = p_user_id AND a.claimed = false;

  IF NOT FOUND THEN
    RETURN 'null'::jsonb;
  END IF;

  -- If expedition is ready, return it as claimable — do NOT delete it
  IF now() >= v_active.returns_at THEN
    RETURN jsonb_build_object(
      'id', v_active.id,
      'expedition_name', v_active.name,
      'duration_minutes', v_active.duration_minutes,
      'xp_reward', v_active.xp_reward,
      'hp_damage', v_active.hp_damage,
      'started_at', v_active.started_at::text,
      'returns_at', v_active.returns_at::text,
      'can_claim', true,
      'remaining_seconds', 0
    );
  END IF;

  RETURN jsonb_build_object(
    'id', v_active.id,
    'expedition_name', v_active.name,
    'duration_minutes', v_active.duration_minutes,
    'xp_reward', v_active.xp_reward,
    'hp_damage', v_active.hp_damage,
    'started_at', v_active.started_at::text,
    'returns_at', v_active.returns_at::text,
    'can_claim', false,
    'remaining_seconds', EXTRACT(EPOCH FROM (v_active.returns_at - now()))
  );
END;
$$;

GRANT EXECUTE ON FUNCTION get_hero_active_expedition(uuid) TO authenticated;
