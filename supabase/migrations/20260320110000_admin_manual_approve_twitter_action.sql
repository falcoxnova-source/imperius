/*
  # Admin Manual Approve Twitter Action (without API verification)

  Creates a function for admins to manually approve Twitter actions
  without calling the Twitter API. This is useful when:
  - Twitter API is down or rate limited
  - Admin has manually verified the tweet exists
  - Quick approval needed

  The function:
  1. Marks the action as validated
  2. Awards points to the user
  3. Updates social_statistics
  4. Does NOT call Twitter API
*/

CREATE OR REPLACE FUNCTION admin_manual_approve_twitter_action(
  p_action_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin_id uuid;
  v_action record;
  v_user_id uuid;
  v_points int;
BEGIN
  -- Check admin
  v_admin_id := auth.uid();
  IF NOT EXISTS (SELECT 1 FROM admin_users WHERE user_id = v_admin_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'No autorizado');
  END IF;

  -- Get action
  SELECT * INTO v_action
  FROM twitter_user_actions
  WHERE id = p_action_id;

  IF v_action IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Accion no encontrada');
  END IF;

  IF v_action.is_validated THEN
    RETURN jsonb_build_object('success', false, 'error', 'Ya estaba aprobada', 'already_validated', true);
  END IF;

  v_user_id := v_action.user_id;
  v_points := v_action.points_awarded;

  -- Mark as validated
  UPDATE twitter_user_actions
  SET is_validated = true,
      validated_at = now()
  WHERE id = p_action_id;

  -- Award points to social_statistics
  INSERT INTO social_statistics (user_id, twitter_points, total_actions, validated_actions)
  VALUES (v_user_id, v_points, 0, 1)
  ON CONFLICT (user_id) DO UPDATE
  SET twitter_points = social_statistics.twitter_points + v_points,
      validated_actions = social_statistics.validated_actions + 1,
      updated_at = now();

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Aprobado manualmente',
    'username', (SELECT username FROM profiles WHERE id = v_user_id),
    'points', v_points
  );
END;
$$;

GRANT EXECUTE ON FUNCTION admin_manual_approve_twitter_action(uuid) TO authenticated;
