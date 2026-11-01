/*
  # Twitter/X Social Tasks System

  1. New Tables
    - `twitter_links` - Links Twitter/X accounts to game accounts
      - `id` (uuid, primary key)
      - `user_id` (uuid, references profiles, unique)
      - `twitter_username` (text) - Twitter/X username (without @)
      - `linked_at` (timestamptz) - When the link was established
      - `link_reward_claimed` (boolean) - Whether +20 FXU reward was given
      - `created_at` (timestamptz)

    - `twitter_missions` - Auto-created missions for each official tweet
      - `id` (uuid, primary key)
      - `tweet_id` (text, unique) - The official tweet ID
      - `tweet_url` (text) - Full URL to the tweet
      - `description` (text) - Short description of the tweet/mission
      - `hashtag` (text) - Required hashtag for this mission
      - `is_active` (boolean) - Whether this mission is still accepting actions
      - `created_at` (timestamptz)

    - `twitter_actions` - User actions (quote tweets / comments)
      - `id` (uuid, primary key)
      - `user_id` (uuid, references profiles)
      - `mission_id` (uuid, references twitter_missions)
      - `user_tweet_url` (text) - URL of the user's tweet/comment
      - `action_type` (text) - 'quote_tweet' or 'comment'
      - `points_awarded` (integer) - Points given for this action
      - `validated` (boolean) - Whether the action was validated via API
      - `created_at` (timestamptz)

    - `twitter_social_config` - System configuration
      - `id` (uuid, primary key)
      - `official_account` (text) - Official Twitter handle
      - `default_hashtag` (text) - Default hashtag to use
      - `quote_tweet_points` (integer) - Points per quote tweet (default 10)
      - `comment_points` (integer) - Points per comment (default 5)
      - `link_reward_fxu` (integer) - FXU reward for linking account (default 20)

  2. Security
    - Enable RLS on all tables
    - Users can only see their own actions/links
    - Everyone can see missions (read-only)
    - Everyone can see the ranking (via function)

  3. Functions
    - `link_twitter_account` - Link Twitter account & claim +20 FXU
    - `submit_twitter_action` - Submit a quote tweet or comment for validation
    - `get_twitter_task_status` - Get current user's Twitter task status
    - `get_twitter_social_ranking` - Get social points ranking
    - `get_active_twitter_missions` - Get active missions list
*/

-- ============================================================
-- TABLE: twitter_links
-- ============================================================
CREATE TABLE IF NOT EXISTS twitter_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  twitter_username text NOT NULL,
  linked_at timestamptz DEFAULT now(),
  link_reward_claimed boolean NOT NULL DEFAULT false,
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_id),
  UNIQUE(twitter_username)
);

ALTER TABLE twitter_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own twitter link"
  ON twitter_links FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own twitter link"
  ON twitter_links FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- ============================================================
-- TABLE: twitter_missions
-- ============================================================
CREATE TABLE IF NOT EXISTS twitter_missions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tweet_id text NOT NULL UNIQUE,
  tweet_url text NOT NULL,
  description text NOT NULL DEFAULT '',
  hashtag text NOT NULL DEFAULT '#FalcoXUniverse',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE twitter_missions ENABLE ROW LEVEL SECURITY;

-- Everyone can see missions (they are public)
CREATE POLICY "Anyone can view twitter missions"
  ON twitter_missions FOR SELECT
  TO authenticated
  USING (true);

-- ============================================================
-- TABLE: twitter_actions
-- ============================================================
CREATE TABLE IF NOT EXISTS twitter_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  mission_id uuid NOT NULL REFERENCES twitter_missions(id) ON DELETE CASCADE,
  user_tweet_url text NOT NULL,
  action_type text NOT NULL CHECK (action_type IN ('quote_tweet', 'comment')),
  points_awarded integer NOT NULL DEFAULT 0,
  validated boolean NOT NULL DEFAULT false,
  created_at timestamptz DEFAULT now(),
  -- One action per user per mission per type
  UNIQUE(user_id, mission_id, action_type)
);

ALTER TABLE twitter_actions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own twitter actions"
  ON twitter_actions FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own twitter actions"
  ON twitter_actions FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- ============================================================
-- TABLE: twitter_social_config
-- ============================================================
CREATE TABLE IF NOT EXISTS twitter_social_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  official_account text NOT NULL DEFAULT 'FalcoXUniverse',
  default_hashtag text NOT NULL DEFAULT '#FalcoXUniverse',
  quote_tweet_points integer NOT NULL DEFAULT 10,
  comment_points integer NOT NULL DEFAULT 5,
  link_reward_fxu integer NOT NULL DEFAULT 20,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE twitter_social_config ENABLE ROW LEVEL SECURITY;

-- Everyone can read config
CREATE POLICY "Anyone can view twitter config"
  ON twitter_social_config FOR SELECT
  TO authenticated
  USING (true);

-- Insert default config
INSERT INTO twitter_social_config (official_account, default_hashtag, quote_tweet_points, comment_points, link_reward_fxu)
VALUES ('FalcoXUniverse', '#FalcoXUniverse', 10, 5, 20)
ON CONFLICT DO NOTHING;

-- ============================================================
-- INDEXES
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_twitter_actions_user_id ON twitter_actions(user_id);
CREATE INDEX IF NOT EXISTS idx_twitter_actions_mission_id ON twitter_actions(mission_id);
CREATE INDEX IF NOT EXISTS idx_twitter_missions_active ON twitter_missions(is_active) WHERE is_active = true;

-- ============================================================
-- FUNCTION: link_twitter_account
-- Links a Twitter/X account and gives +20 FXU reward
-- ============================================================
CREATE OR REPLACE FUNCTION link_twitter_account(p_twitter_username text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_existing twitter_links%ROWTYPE;
  v_username text;
  v_config twitter_social_config%ROWTYPE;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  -- Clean username (remove @ if present)
  v_username := trim(both ' ' from p_twitter_username);
  IF left(v_username, 1) = '@' THEN
    v_username := substring(v_username from 2);
  END IF;

  IF length(v_username) < 1 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid username');
  END IF;

  -- Check if user already has a linked account
  SELECT * INTO v_existing FROM twitter_links WHERE user_id = v_user_id;
  IF v_existing IS NOT NULL THEN
    RETURN jsonb_build_object(
      'success', true,
      'already_linked', true,
      'twitter_username', v_existing.twitter_username
    );
  END IF;

  -- Check if this twitter username is already linked to another account
  SELECT * INTO v_existing FROM twitter_links WHERE lower(twitter_username) = lower(v_username);
  IF v_existing IS NOT NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'This Twitter/X account is already linked to another game account'
    );
  END IF;

  -- Get config
  SELECT * INTO v_config FROM twitter_social_config LIMIT 1;

  -- Insert the link
  INSERT INTO twitter_links (user_id, twitter_username, linked_at, link_reward_claimed)
  VALUES (v_user_id, v_username, now(), true);

  -- Give FXU reward
  PERFORM set_config('fxu.allow_update_9x7k2m', 'true', true);
  UPDATE profiles SET fxu_balance = fxu_balance + COALESCE(v_config.link_reward_fxu, 20) WHERE id = v_user_id;
  PERFORM set_config('fxu.allow_update_9x7k2m', 'false', true);

  RETURN jsonb_build_object(
    'success', true,
    'twitter_username', v_username,
    'reward_given', true,
    'reward_amount', COALESCE(v_config.link_reward_fxu, 20),
    'message', 'Twitter/X account linked! +' || COALESCE(v_config.link_reward_fxu, 20) || ' FXU!'
  );
END;
$$;

-- ============================================================
-- FUNCTION: submit_twitter_action
-- Submit a quote tweet or comment for a mission
-- ============================================================
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

  -- Get config for points
  SELECT * INTO v_config FROM twitter_social_config LIMIT 1;
  
  IF p_action_type = 'quote_tweet' THEN
    v_points := COALESCE(v_config.quote_tweet_points, 10);
  ELSE
    v_points := COALESCE(v_config.comment_points, 5);
  END IF;

  -- Insert the action (pending validation via edge function)
  INSERT INTO twitter_actions (user_id, mission_id, user_tweet_url, action_type, points_awarded, validated)
  VALUES (v_user_id, p_mission_id, p_user_tweet_url, p_action_type, v_points, false);

  RETURN jsonb_build_object(
    'success', true,
    'points', v_points,
    'action_type', p_action_type,
    'message', 'Action submitted! Pending validation.'
  );
END;
$$;

-- ============================================================
-- FUNCTION: get_twitter_task_status
-- Get current user's Twitter task status
-- ============================================================
CREATE OR REPLACE FUNCTION get_twitter_task_status()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_link twitter_links%ROWTYPE;
  v_total_points bigint;
  v_total_actions bigint;
  v_config twitter_social_config%ROWTYPE;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  SELECT * INTO v_config FROM twitter_social_config LIMIT 1;
  SELECT * INTO v_link FROM twitter_links WHERE user_id = v_user_id;

  IF v_link IS NULL THEN
    RETURN jsonb_build_object(
      'success', true,
      'twitter_linked', false,
      'total_points', 0,
      'total_actions', 0,
      'link_reward_fxu', COALESCE(v_config.link_reward_fxu, 20)
    );
  END IF;

  SELECT COALESCE(SUM(points_awarded), 0), COUNT(*)
  INTO v_total_points, v_total_actions
  FROM twitter_actions
  WHERE user_id = v_user_id AND validated = true;

  RETURN jsonb_build_object(
    'success', true,
    'twitter_linked', true,
    'twitter_username', v_link.twitter_username,
    'link_reward_claimed', v_link.link_reward_claimed,
    'link_reward_fxu', COALESCE(v_config.link_reward_fxu, 20),
    'total_points', v_total_points,
    'total_actions', v_total_actions,
    'quote_tweet_points', COALESCE(v_config.quote_tweet_points, 10),
    'comment_points', COALESCE(v_config.comment_points, 5)
  );
END;
$$;

-- ============================================================
-- FUNCTION: get_twitter_social_ranking
-- Get social points ranking (top players)
-- ============================================================
CREATE OR REPLACE FUNCTION get_twitter_social_ranking(p_limit integer DEFAULT 50)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ranking jsonb;
BEGIN
  SELECT jsonb_agg(row_data ORDER BY total_points DESC)
  INTO v_ranking
  FROM (
    SELECT jsonb_build_object(
      'user_id', tl.user_id,
      'twitter_username', tl.twitter_username,
      'username', p.username,
      'total_points', COALESCE(SUM(ta.points_awarded), 0),
      'total_actions', COUNT(ta.id),
      'quote_tweets', COUNT(ta.id) FILTER (WHERE ta.action_type = 'quote_tweet'),
      'comments', COUNT(ta.id) FILTER (WHERE ta.action_type = 'comment')
    ) as row_data,
    COALESCE(SUM(ta.points_awarded), 0) as total_points
    FROM twitter_links tl
    INNER JOIN profiles p ON p.id = tl.user_id
    LEFT JOIN twitter_actions ta ON ta.user_id = tl.user_id AND ta.validated = true
    GROUP BY tl.user_id, tl.twitter_username, p.username
    HAVING COALESCE(SUM(ta.points_awarded), 0) > 0
    ORDER BY total_points DESC
    LIMIT p_limit
  ) sub;

  RETURN jsonb_build_object(
    'success', true,
    'ranking', COALESCE(v_ranking, '[]'::jsonb)
  );
END;
$$;

-- ============================================================
-- FUNCTION: get_active_twitter_missions
-- Get active missions with user's completion status
-- ============================================================
CREATE OR REPLACE FUNCTION get_active_twitter_missions()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_missions jsonb;
BEGIN
  v_user_id := auth.uid();

  SELECT jsonb_agg(
    jsonb_build_object(
      'id', m.id,
      'tweet_id', m.tweet_id,
      'tweet_url', m.tweet_url,
      'description', m.description,
      'hashtag', m.hashtag,
      'created_at', m.created_at,
      'user_quote_tweet', (
        SELECT jsonb_build_object('validated', ta.validated, 'user_tweet_url', ta.user_tweet_url, 'points', ta.points_awarded)
        FROM twitter_actions ta
        WHERE ta.mission_id = m.id AND ta.user_id = v_user_id AND ta.action_type = 'quote_tweet'
      ),
      'user_comment', (
        SELECT jsonb_build_object('validated', ta.validated, 'user_tweet_url', ta.user_tweet_url, 'points', ta.points_awarded)
        FROM twitter_actions ta
        WHERE ta.mission_id = m.id AND ta.user_id = v_user_id AND ta.action_type = 'comment'
      )
    ) ORDER BY m.created_at DESC
  )
  INTO v_missions
  FROM twitter_missions m
  WHERE m.is_active = true;

  RETURN jsonb_build_object(
    'success', true,
    'missions', COALESCE(v_missions, '[]'::jsonb)
  );
END;
$$;
