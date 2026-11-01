-- ============================================================================
-- Twitter API validation from SQL (NO edge functions needed)
-- Uses PostgreSQL http extension to call Twitter API v2 directly
-- ============================================================================

-- 1. Enable HTTP extension for making API calls from SQL
CREATE EXTENSION IF NOT EXISTS http WITH SCHEMA extensions;

-- 2. Create admin_config table for storing API keys securely
CREATE TABLE IF NOT EXISTS admin_config (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE admin_config ENABLE ROW LEVEL SECURITY;

-- Only admins can access this table
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'admin_config' AND policyname = 'Only admins can access admin_config'
  ) THEN
    CREATE POLICY "Only admins can access admin_config"
      ON admin_config FOR ALL
      USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true));
  END IF;
END $$;

-- ============================================================================
-- IMPORTANT: After running this migration, you MUST insert your Twitter token:
--
--   INSERT INTO admin_config (key, value) 
--   VALUES ('twitter_bearer_token', 'AAAAAAAAAAAAAAAAAAAAAxxxxxxx')
--   ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;
--
-- (Use the same token you have in TWITTER_BEARER_TOKEN env var)
-- ============================================================================

-- 3. Main function: Validate a twitter action against Twitter API v2
CREATE OR REPLACE FUNCTION admin_validate_twitter_action_api(p_action_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = extensions, public
AS $$
DECLARE
  v_action RECORD;
  v_mission RECORD;
  v_twitter_link RECORD;
  v_bearer_token TEXT;
  v_tweet_id TEXT;
  v_response RECORD;
  v_json JSONB;
  v_tweet_text TEXT;
  v_tweet_author TEXT;
  v_referenced JSONB;
  v_hashtags TEXT[];
  v_missing TEXT[];
  v_tag TEXT;
  v_api_url TEXT;
BEGIN
  -- Check if caller is admin
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authorized');
  END IF;

  -- Get Twitter Bearer Token from admin_config
  SELECT value INTO v_bearer_token FROM admin_config WHERE key = 'twitter_bearer_token';
  IF v_bearer_token IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 
      'Twitter Bearer Token not configured. Execute in SQL Editor: INSERT INTO admin_config (key, value) VALUES (''twitter_bearer_token'', ''YOUR_TOKEN_HERE'')');
  END IF;

  -- Get the action with username
  SELECT ta.id, ta.user_id, ta.mission_id, ta.user_tweet_url, ta.action_type, 
         ta.points_awarded, ta.validated, p.username
  INTO v_action
  FROM twitter_actions ta
  JOIN profiles p ON p.id = ta.user_id
  WHERE ta.id = p_action_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Action not found');
  END IF;

  IF v_action.validated THEN
    RETURN jsonb_build_object('success', true, 'already_validated', true, 'message', 'Already validated');
  END IF;

  -- Get the mission
  SELECT * INTO v_mission FROM twitter_missions WHERE id = v_action.mission_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Mission not found');
  END IF;

  -- Get user's twitter link
  SELECT * INTO v_twitter_link FROM twitter_links WHERE user_id = v_action.user_id;

  -- Extract tweet ID from URL (e.g., https://x.com/user/status/1234567890)
  v_tweet_id := (regexp_match(v_action.user_tweet_url, '/status/(\d+)'))[1];
  IF v_tweet_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid tweet URL: cannot extract tweet ID');
  END IF;

  -- Build Twitter API v2 URL
  v_api_url := 'https://api.twitter.com/2/tweets/' || v_tweet_id 
    || '?tweet.fields=author_id,referenced_tweets,text&expansions=author_id&user.fields=username';

  -- Call Twitter API v2 via HTTP extension
  BEGIN
    SELECT status, content 
    INTO v_response
    FROM http((
      'GET',
      v_api_url,
      ARRAY[http_header('Authorization', 'Bearer ' || v_bearer_token)],
      NULL,
      NULL
    )::http_request);
  EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', 'Failed to connect to Twitter API: ' || SQLERRM);
  END;

  -- Check HTTP status
  IF v_response.status = 429 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Twitter API rate limit. Try again in a few minutes.', 'rate_limited', true);
  END IF;

  IF v_response.status != 200 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Twitter API error (HTTP ' || v_response.status || ')');
  END IF;

  -- Parse JSON response
  BEGIN
    v_json := v_response.content::jsonb;
  EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid response from Twitter API');
  END;

  -- CHECK 1: Tweet exists
  IF v_json->'data' IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Tweet not found or has been deleted');
  END IF;

  v_tweet_text := lower(v_json->'data'->>'text');

  -- CHECK 2: Author matches linked Twitter account
  IF v_json->'includes'->'users' IS NOT NULL AND jsonb_array_length(v_json->'includes'->'users') > 0 AND v_twitter_link.twitter_username IS NOT NULL THEN
    v_tweet_author := lower(v_json->'includes'->'users'->0->>'username');
    IF v_tweet_author != lower(v_twitter_link.twitter_username) THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'Tweet author (@' || v_tweet_author || ') does not match linked account (@' || v_twitter_link.twitter_username || ')'
      );
    END IF;
  END IF;

  -- CHECK 3: Required hashtags
  v_hashtags := ARRAY['#falcox', '#xnova', '#ogames'];
  v_missing := ARRAY[]::TEXT[];
  FOREACH v_tag IN ARRAY v_hashtags LOOP
    IF position(v_tag in v_tweet_text) = 0 THEN
      v_missing := array_append(v_missing, v_tag);
    END IF;
  END LOOP;

  IF array_length(v_missing, 1) > 0 THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Missing hashtags: ' || array_to_string(v_missing, ', ')
    );
  END IF;

  -- CHECK 4: For quote tweets, verify it references the mission tweet
  IF v_action.action_type = 'quote_tweet' THEN
    v_referenced := v_json->'data'->'referenced_tweets';
    IF v_referenced IS NULL OR NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(v_referenced) elem
      WHERE elem->>'type' = 'quoted' AND elem->>'id' = v_mission.tweet_id
    ) THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'This tweet does NOT quote the mission tweet (expected quote of tweet ' || v_mission.tweet_id || ')'
      );
    END IF;
  END IF;

  -- CHECK 5: For comments, verify it's a reply to the mission tweet
  IF v_action.action_type = 'comment' THEN
    v_referenced := v_json->'data'->'referenced_tweets';
    IF v_referenced IS NULL OR NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(v_referenced) elem
      WHERE elem->>'type' = 'replied_to' AND elem->>'id' = v_mission.tweet_id
    ) THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'This tweet is NOT a reply to the mission tweet (expected reply to tweet ' || v_mission.tweet_id || ')'
      );
    END IF;
  END IF;

  -- ALL CHECKS PASSED → Approve the action
  UPDATE twitter_actions SET validated = true WHERE id = p_action_id;

  RETURN jsonb_build_object(
    'success', true,
    'validated', true,
    'username', v_action.username,
    'action_type', v_action.action_type,
    'points', v_action.points_awarded,
    'tweet_author', COALESCE(v_tweet_author, 'unknown'),
    'message', '✅ Verified via Twitter API | @' || COALESCE(v_tweet_author, '?') || ' | ' 
      || CASE WHEN v_action.action_type = 'quote_tweet' THEN 'Quote Tweet' ELSE 'Comment' END 
      || ' | +' || v_action.points_awarded || ' pts'
  );
END;
$$;
