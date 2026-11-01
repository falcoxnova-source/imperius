-- ============================================================================
-- Admin RPC functions for Twitter validation + anti-fraud protections
-- These run as SQL (no edge function deployment needed)
-- ============================================================================

-- 0. Clean up existing duplicate tweet URLs before adding unique constraint
-- Keep only the FIRST submission (oldest created_at) for each URL, delete the rest
DELETE FROM twitter_actions
WHERE id NOT IN (
  SELECT DISTINCT ON (user_tweet_url) id
  FROM twitter_actions
  ORDER BY user_tweet_url, created_at ASC
);

-- Now add unique index to prevent future duplicates
CREATE UNIQUE INDEX IF NOT EXISTS idx_twitter_actions_unique_tweet_url 
  ON twitter_actions(user_tweet_url);

-- 0b. Update submit_twitter_action to check for duplicate URLs and validate URL format
CREATE OR REPLACE FUNCTION submit_twitter_action(
  p_mission_id uuid,
  p_user_tweet_url text,
  p_action_type text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_link twitter_links%ROWTYPE;
  v_mission twitter_missions%ROWTYPE;
  v_config twitter_social_config%ROWTYPE;
  v_existing twitter_actions%ROWTYPE;
  v_points integer;
  v_url_duplicate twitter_actions%ROWTYPE;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  -- Check user has linked Twitter
  SELECT * INTO v_link FROM twitter_links WHERE user_id = v_user_id;
  IF v_link IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Twitter account not linked');
  END IF;

  -- Validate action type
  IF p_action_type NOT IN ('quote_tweet', 'comment') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid action type');
  END IF;

  -- Validate URL format (must be twitter.com or x.com status URL)
  IF p_user_tweet_url !~ 'https?://(twitter\.com|x\.com)/\w+/status/\d+' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid Twitter/X URL format');
  END IF;

  -- Check mission exists and is active
  SELECT * INTO v_mission FROM twitter_missions WHERE id = p_mission_id AND is_active = true;
  IF v_mission IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Mission not found or inactive');
  END IF;

  -- Check user hasn't already submitted this action type for this mission
  SELECT * INTO v_existing 
  FROM twitter_actions 
  WHERE user_id = v_user_id AND mission_id = p_mission_id AND action_type = p_action_type;
  IF v_existing IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Action already submitted for this mission');
  END IF;

  -- Check this tweet URL hasn't been used by anyone else (anti-fraud)
  SELECT * INTO v_url_duplicate
  FROM twitter_actions
  WHERE user_tweet_url = p_user_tweet_url;
  IF v_url_duplicate IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'This tweet URL has already been submitted');
  END IF;

  -- Get config for points
  SELECT * INTO v_config FROM twitter_social_config LIMIT 1;
  
  IF p_action_type = 'quote_tweet' THEN
    v_points := COALESCE(v_config.quote_tweet_points, 10);
  ELSE
    v_points := COALESCE(v_config.comment_points, 5);
  END IF;

  -- Insert the action (pending validation via admin)
  INSERT INTO twitter_actions (user_id, mission_id, user_tweet_url, action_type, points_awarded, validated)
  VALUES (v_user_id, p_mission_id, p_user_tweet_url, p_action_type, v_points, false);

  RETURN jsonb_build_object(
    'success', true,
    'points', v_points,
    'action_type', p_action_type,
    'message', 'Action submitted! Pending admin validation.'
  );
END;
$$;

-- 1. Function to get all pending twitter actions with user details
CREATE OR REPLACE FUNCTION admin_get_pending_twitter_actions()
RETURNS TABLE (
  action_id UUID,
  user_id UUID,
  username TEXT,
  twitter_username TEXT,
  mission_id UUID,
  mission_tweet_url TEXT,
  action_type TEXT,
  user_tweet_url TEXT,
  points_awarded INTEGER,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Check if caller is admin
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  RETURN QUERY
  SELECT 
    ta.id AS action_id,
    ta.user_id,
    p.username,
    tl.twitter_username,
    ta.mission_id,
    tm.tweet_url AS mission_tweet_url,
    ta.action_type,
    ta.user_tweet_url,
    ta.points_awarded,
    ta.created_at
  FROM twitter_actions ta
  JOIN profiles p ON p.id = ta.user_id
  LEFT JOIN twitter_links tl ON tl.user_id = ta.user_id
  JOIN twitter_missions tm ON tm.id = ta.mission_id
  WHERE ta.validated = false
  ORDER BY ta.created_at ASC;
END;
$$;

-- 2. Function to approve a single twitter action (admin only)
CREATE OR REPLACE FUNCTION admin_approve_twitter_action(p_action_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_action RECORD;
BEGIN
  -- Check if caller is admin
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authorized');
  END IF;

  -- Get the action
  SELECT ta.id, ta.user_id, ta.points_awarded, ta.validated, ta.action_type, p.username
  INTO v_action
  FROM twitter_actions ta
  JOIN profiles p ON p.id = ta.user_id
  WHERE ta.id = p_action_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Action not found');
  END IF;

  IF v_action.validated THEN
    RETURN jsonb_build_object('success', true, 'message', 'Already validated');
  END IF;

  -- Mark as validated
  UPDATE twitter_actions SET validated = true WHERE id = p_action_id;

  RETURN jsonb_build_object(
    'success', true,
    'validated', true,
    'username', v_action.username,
    'action_type', v_action.action_type,
    'points', v_action.points_awarded
  );
END;
$$;

-- 3. Function to reject a single twitter action (admin only) - deletes it so user can resubmit
CREATE OR REPLACE FUNCTION admin_reject_twitter_action(p_action_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_action RECORD;
BEGIN
  -- Check if caller is admin
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authorized');
  END IF;

  -- Get the action before deleting
  SELECT ta.id, ta.user_id, ta.action_type, p.username
  INTO v_action
  FROM twitter_actions ta
  JOIN profiles p ON p.id = ta.user_id
  WHERE ta.id = p_action_id AND ta.validated = false;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Pending action not found');
  END IF;

  -- Delete the action so user can resubmit
  DELETE FROM twitter_actions WHERE id = p_action_id;

  RETURN jsonb_build_object(
    'success', true,
    'rejected', true,
    'username', v_action.username,
    'action_type', v_action.action_type
  );
END;
$$;

-- 4. Function to batch approve ALL pending twitter actions (admin only)
CREATE OR REPLACE FUNCTION admin_batch_approve_twitter_actions()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  -- Check if caller is admin
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authorized');
  END IF;

  -- Approve all pending actions
  WITH updated AS (
    UPDATE twitter_actions 
    SET validated = true 
    WHERE validated = false
    RETURNING id
  )
  SELECT count(*) INTO v_count FROM updated;

  RETURN jsonb_build_object(
    'success', true,
    'validated_count', v_count,
    'message', v_count || ' acciones aprobadas'
  );
END;
$$;

-- 5. Ensure admin RLS policies exist (idempotent)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'twitter_actions' AND policyname = 'Admins can view all twitter actions'
  ) THEN
    CREATE POLICY "Admins can view all twitter actions"
      ON twitter_actions FOR SELECT
      USING (
        EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true)
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'twitter_actions' AND policyname = 'Admins can update twitter actions'
  ) THEN
    CREATE POLICY "Admins can update twitter actions"
      ON twitter_actions FOR UPDATE
      USING (
        EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true)
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'twitter_actions' AND policyname = 'Admins can delete twitter actions'
  ) THEN
    CREATE POLICY "Admins can delete twitter actions"
      ON twitter_actions FOR DELETE
      USING (
        EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true)
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'twitter_links' AND policyname = 'Admins can view all twitter links'
  ) THEN
    CREATE POLICY "Admins can view all twitter links"
      ON twitter_links FOR SELECT
      USING (
        EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true)
      );
  END IF;
END $$;
