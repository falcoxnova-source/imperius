/*
  # Telegram Tasks System

  1. New Tables
    - `telegram_links` - Links Telegram accounts to game accounts
      - `id` (uuid, primary key)
      - `user_id` (uuid, references profiles)
      - `telegram_id` (bigint, unique) - Telegram user ID
      - `telegram_username` (text) - Telegram username
      - `link_code` (text, unique) - One-time code for linking
      - `linked_at` (timestamptz) - When the link was established
      - `created_at` (timestamptz)
    
    - `telegram_task_rewards` - Tracks task completion and rewards
      - `id` (uuid, primary key)
      - `user_id` (uuid, references profiles)
      - `telegram_id` (bigint)
      - `task_type` (text) - 'join_group', etc.
      - `reward_amount` (integer) - FXU reward amount
      - `reward_claimed` (boolean) - Whether reward was given
      - `reward_revoked` (boolean) - Whether reward was taken back
      - `first_join_at` (timestamptz) - First time user joined
      - `last_leave_at` (timestamptz) - Last time user left
      - `is_member` (boolean) - Current membership status
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)

  2. Security
    - Enable RLS on all tables
    - Users can only see their own data
    - Only server functions can modify reward status

  3. Functions
    - `generate_telegram_link_code` - Generate a unique linking code
    - `complete_telegram_link` - Link Telegram to game account
    - `process_telegram_join` - Handle user joining group
    - `process_telegram_leave` - Handle user leaving group
*/

-- Create telegram_links table
CREATE TABLE IF NOT EXISTS telegram_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  telegram_id bigint UNIQUE,
  telegram_username text,
  link_code text UNIQUE,
  linked_at timestamptz,
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_id)
);

-- Create telegram_task_rewards table
CREATE TABLE IF NOT EXISTS telegram_task_rewards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  telegram_id bigint NOT NULL,
  task_type text NOT NULL DEFAULT 'join_group',
  reward_amount integer NOT NULL DEFAULT 50,
  reward_claimed boolean NOT NULL DEFAULT false,
  reward_revoked boolean NOT NULL DEFAULT false,
  first_join_at timestamptz,
  last_leave_at timestamptz,
  is_member boolean NOT NULL DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id, task_type),
  UNIQUE(telegram_id, task_type)
);

-- Enable RLS
ALTER TABLE telegram_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE telegram_task_rewards ENABLE ROW LEVEL SECURITY;

-- RLS Policies for telegram_links
CREATE POLICY "Users can view own telegram link"
  ON telegram_links FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own telegram link"
  ON telegram_links FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own telegram link"
  ON telegram_links FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- RLS Policies for telegram_task_rewards
CREATE POLICY "Users can view own task rewards"
  ON telegram_task_rewards FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Function to generate a unique link code
CREATE OR REPLACE FUNCTION generate_telegram_link_code()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_code text;
  v_existing telegram_links%ROWTYPE;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  -- Check if already linked
  SELECT * INTO v_existing FROM telegram_links WHERE user_id = v_user_id;
  
  IF v_existing IS NOT NULL AND v_existing.telegram_id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'success', true,
      'already_linked', true,
      'telegram_username', v_existing.telegram_username
    );
  END IF;

  -- Generate unique 8-character code
  v_code := upper(substring(md5(random()::text || clock_timestamp()::text) from 1 for 8));

  -- Upsert the link record
  INSERT INTO telegram_links (user_id, link_code, created_at)
  VALUES (v_user_id, v_code, now())
  ON CONFLICT (user_id) DO UPDATE
  SET link_code = v_code, created_at = now();

  RETURN jsonb_build_object(
    'success', true,
    'code', v_code,
    'expires_in_minutes', 10
  );
END;
$$;

-- Function to complete Telegram link (called by bot)
CREATE OR REPLACE FUNCTION complete_telegram_link(
  p_link_code text,
  p_telegram_id bigint,
  p_telegram_username text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_link telegram_links%ROWTYPE;
  v_existing_telegram telegram_links%ROWTYPE;
BEGIN
  -- Check if this Telegram ID is already linked to another account
  SELECT * INTO v_existing_telegram 
  FROM telegram_links 
  WHERE telegram_id = p_telegram_id;
  
  IF v_existing_telegram IS NOT NULL THEN
    RETURN jsonb_build_object(
      'success', false, 
      'error', 'This Telegram account is already linked to another game account'
    );
  END IF;

  -- Find the link code
  SELECT * INTO v_link 
  FROM telegram_links 
  WHERE link_code = upper(p_link_code)
    AND telegram_id IS NULL
    AND created_at > now() - interval '10 minutes';

  IF v_link IS NULL THEN
    RETURN jsonb_build_object(
      'success', false, 
      'error', 'Invalid or expired link code'
    );
  END IF;

  -- Update the link
  UPDATE telegram_links
  SET telegram_id = p_telegram_id,
      telegram_username = p_telegram_username,
      linked_at = now(),
      link_code = NULL
  WHERE id = v_link.id;

  RETURN jsonb_build_object(
    'success', true,
    'user_id', v_link.user_id,
    'message', 'Account linked successfully'
  );
END;
$$;

-- Function to process user joining the Telegram group
CREATE OR REPLACE FUNCTION process_telegram_join(p_telegram_id bigint)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_link telegram_links%ROWTYPE;
  v_reward telegram_task_rewards%ROWTYPE;
  v_reward_amount integer := 50;
BEGIN
  -- Find the linked game account
  SELECT * INTO v_link FROM telegram_links WHERE telegram_id = p_telegram_id;
  
  IF v_link IS NULL OR v_link.user_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false, 
      'error', 'Telegram account not linked to any game account'
    );
  END IF;

  -- Check existing reward record
  SELECT * INTO v_reward 
  FROM telegram_task_rewards 
  WHERE telegram_id = p_telegram_id AND task_type = 'join_group';

  IF v_reward IS NULL THEN
    -- First time joining - give reward
    INSERT INTO telegram_task_rewards (
      user_id, telegram_id, task_type, reward_amount, 
      reward_claimed, first_join_at, is_member, updated_at
    )
    VALUES (
      v_link.user_id, p_telegram_id, 'join_group', v_reward_amount,
      true, now(), true, now()
    );

    -- Give FXU reward
    PERFORM set_config('fxu.allow_update_9x7k2m', 'true', true);
    UPDATE profiles SET fxu_balance = fxu_balance + v_reward_amount WHERE id = v_link.user_id;
    PERFORM set_config('fxu.allow_update_9x7k2m', 'false', true);

    RETURN jsonb_build_object(
      'success', true,
      'reward_given', true,
      'amount', v_reward_amount,
      'message', 'Welcome! You received ' || v_reward_amount || ' FXU!'
    );

  ELSE
    -- User has joined before
    UPDATE telegram_task_rewards
    SET is_member = true,
        updated_at = now()
    WHERE id = v_reward.id;

    IF v_reward.reward_claimed AND v_reward.reward_revoked THEN
      -- User left before and lost reward, rejoining but NO new reward
      RETURN jsonb_build_object(
        'success', true,
        'reward_given', false,
        'message', 'Welcome back! Note: You already claimed the join reward previously.'
      );
    ELSE
      RETURN jsonb_build_object(
        'success', true,
        'reward_given', false,
        'message', 'Welcome back!'
      );
    END IF;
  END IF;
END;
$$;

-- Function to process user leaving the Telegram group
CREATE OR REPLACE FUNCTION process_telegram_leave(p_telegram_id bigint)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_reward telegram_task_rewards%ROWTYPE;
  v_link telegram_links%ROWTYPE;
BEGIN
  -- Get the reward record
  SELECT * INTO v_reward 
  FROM telegram_task_rewards 
  WHERE telegram_id = p_telegram_id AND task_type = 'join_group';

  IF v_reward IS NULL THEN
    RETURN jsonb_build_object('success', true, 'message', 'No reward record found');
  END IF;

  -- Get the link to find user_id
  SELECT * INTO v_link FROM telegram_links WHERE telegram_id = p_telegram_id;

  -- Update membership status
  UPDATE telegram_task_rewards
  SET is_member = false,
      last_leave_at = now(),
      updated_at = now(),
      reward_revoked = CASE WHEN reward_claimed AND NOT reward_revoked THEN true ELSE reward_revoked END
  WHERE id = v_reward.id;

  -- If reward was claimed and not yet revoked, take it back
  IF v_reward.reward_claimed AND NOT v_reward.reward_revoked AND v_link IS NOT NULL THEN
    PERFORM set_config('fxu.allow_update_9x7k2m', 'true', true);
    UPDATE profiles 
    SET fxu_balance = GREATEST(0, fxu_balance - v_reward.reward_amount) 
    WHERE id = v_link.user_id;
    PERFORM set_config('fxu.allow_update_9x7k2m', 'false', true);

    RETURN jsonb_build_object(
      'success', true,
      'reward_revoked', true,
      'amount', v_reward.reward_amount,
      'message', 'User left group, reward revoked'
    );
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'reward_revoked', false,
    'message', 'User left group'
  );
END;
$$;

-- Function to get user's task status
CREATE OR REPLACE FUNCTION get_telegram_task_status()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_link telegram_links%ROWTYPE;
  v_reward telegram_task_rewards%ROWTYPE;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  SELECT * INTO v_link FROM telegram_links WHERE user_id = v_user_id;
  
  IF v_link IS NULL OR v_link.telegram_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', true,
      'telegram_linked', false,
      'task_completed', false,
      'is_member', false
    );
  END IF;

  SELECT * INTO v_reward 
  FROM telegram_task_rewards 
  WHERE user_id = v_user_id AND task_type = 'join_group';

  RETURN jsonb_build_object(
    'success', true,
    'telegram_linked', true,
    'telegram_username', v_link.telegram_username,
    'task_completed', COALESCE(v_reward.reward_claimed, false),
    'is_member', COALESCE(v_reward.is_member, false),
    'reward_amount', COALESCE(v_reward.reward_amount, 50),
    'reward_revoked', COALESCE(v_reward.reward_revoked, false)
  );
END;
$$;
