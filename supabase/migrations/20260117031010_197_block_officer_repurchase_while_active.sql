/*
  # Block Officer Repurchase While Active

  1. Changes
    - Modify purchase_officer_with_fxu to reject purchase if officer is already active
    - Modify purchase_officer_with_dark_matter to reject purchase if officer is already active
    - Reset all existing officers with more than 7 days to exactly 7 days from now

  2. Business Logic
    - Players can only purchase an officer when they don't have it active
    - No more extending/stacking officer durations
    - Existing officers with extended time are reset to 7 days

  3. Notes
    - This prevents players from buying the same officer multiple times
    - Players must wait for their officer to expire before purchasing again
*/

-- Reset all existing officers to 7 days from now (for users who bought multiple times)
UPDATE user_officers
SET expires_at = NOW() + INTERVAL '7 days'
WHERE expires_at > NOW() + INTERVAL '7 days';

-- Update purchase_officer_with_fxu to block purchase if already active
CREATE OR REPLACE FUNCTION purchase_officer_with_fxu(
  p_officer_type_id uuid,
  p_duration text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_officer officer_types%ROWTYPE;
  v_fxu_cost integer;
  v_current_fxu numeric;
  v_days_to_add integer;
  v_existing_officer user_officers%ROWTYPE;
  v_new_expiry timestamptz;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  -- Check for existing ACTIVE officer - block purchase if active
  SELECT * INTO v_existing_officer
  FROM user_officers
  WHERE user_id = v_user_id 
    AND officer_type_id = p_officer_type_id
    AND expires_at > NOW();

  IF v_existing_officer IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Officer is still active. Wait until it expires to purchase again.');
  END IF;

  -- Get officer type
  SELECT * INTO v_officer FROM officer_types WHERE id = p_officer_type_id;
  IF v_officer IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Officer type not found');
  END IF;

  -- Get FXU cost based on duration
  CASE p_duration
    WHEN '7d' THEN 
      v_fxu_cost := v_officer.fxu_cost_7d;
      v_days_to_add := 7;
    WHEN '30d' THEN 
      v_fxu_cost := v_officer.fxu_cost_30d;
      v_days_to_add := 30;
    WHEN '90d' THEN 
      v_fxu_cost := v_officer.fxu_cost_90d;
      v_days_to_add := 90;
    ELSE
      RETURN jsonb_build_object('success', false, 'error', 'Invalid duration');
  END CASE;

  -- Get current FXU balance
  SELECT fxu_balance INTO v_current_fxu FROM profiles WHERE id = v_user_id;
  
  IF v_current_fxu < v_fxu_cost THEN
    RETURN jsonb_build_object('success', false, 'error', 'Insufficient FXU balance');
  END IF;

  -- Deduct FXU
  UPDATE profiles 
  SET fxu_balance = fxu_balance - v_fxu_cost 
  WHERE id = v_user_id;

  -- Track revenue
  INSERT INTO admin_revenue (source, amount, user_id, details)
  VALUES ('officer_fxu', v_fxu_cost, v_user_id, jsonb_build_object(
    'officer_type_id', p_officer_type_id,
    'officer_name', v_officer.name,
    'duration', p_duration,
    'fxu_cost', v_fxu_cost
  ));

  -- Create new officer assignment
  v_new_expiry := NOW() + (v_days_to_add || ' days')::interval;
  
  -- Delete any expired officer record first
  DELETE FROM user_officers 
  WHERE user_id = v_user_id 
    AND officer_type_id = p_officer_type_id;
  
  -- Insert new officer
  INSERT INTO user_officers (user_id, officer_type_id, expires_at)
  VALUES (v_user_id, p_officer_type_id, v_new_expiry);

  RETURN jsonb_build_object(
    'success', true,
    'expires_at', v_new_expiry,
    'fxu_spent', v_fxu_cost
  );
END;
$$;

-- Update purchase_officer_with_dark_matter to block purchase if already active
CREATE OR REPLACE FUNCTION purchase_officer_with_dark_matter(
  p_officer_type_id uuid,
  p_duration text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_officer officer_types%ROWTYPE;
  v_dm_cost integer;
  v_current_dm integer;
  v_days_to_add integer;
  v_existing_officer user_officers%ROWTYPE;
  v_new_expiry timestamptz;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  -- Check for existing ACTIVE officer - block purchase if active
  SELECT * INTO v_existing_officer
  FROM user_officers
  WHERE user_id = v_user_id 
    AND officer_type_id = p_officer_type_id
    AND expires_at > NOW();

  IF v_existing_officer IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Officer is still active. Wait until it expires to purchase again.');
  END IF;

  -- Get officer type
  SELECT * INTO v_officer FROM officer_types WHERE id = p_officer_type_id;
  IF v_officer IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Officer type not found');
  END IF;

  -- Get Dark Matter cost based on duration
  CASE p_duration
    WHEN '7d' THEN 
      v_dm_cost := v_officer.dark_matter_cost_7d;
      v_days_to_add := 7;
    WHEN '30d' THEN 
      v_dm_cost := v_officer.dark_matter_cost_30d;
      v_days_to_add := 30;
    WHEN '90d' THEN 
      v_dm_cost := v_officer.dark_matter_cost_90d;
      v_days_to_add := 90;
    ELSE
      RETURN jsonb_build_object('success', false, 'error', 'Invalid duration');
  END CASE;

  -- Get current Dark Matter balance
  SELECT dark_matter INTO v_current_dm FROM profiles WHERE id = v_user_id;
  
  IF v_current_dm < v_dm_cost THEN
    RETURN jsonb_build_object('success', false, 'error', 'Insufficient Dark Matter');
  END IF;

  -- Deduct Dark Matter
  UPDATE profiles 
  SET dark_matter = dark_matter - v_dm_cost 
  WHERE id = v_user_id;

  -- Create new officer assignment
  v_new_expiry := NOW() + (v_days_to_add || ' days')::interval;
  
  -- Delete any expired officer record first
  DELETE FROM user_officers 
  WHERE user_id = v_user_id 
    AND officer_type_id = p_officer_type_id;
  
  -- Insert new officer
  INSERT INTO user_officers (user_id, officer_type_id, expires_at)
  VALUES (v_user_id, p_officer_type_id, v_new_expiry);

  RETURN jsonb_build_object(
    'success', true,
    'expires_at', v_new_expiry,
    'dark_matter_spent', v_dm_cost
  );
END;
$$;
