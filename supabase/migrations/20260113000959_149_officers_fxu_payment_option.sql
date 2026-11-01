/*
  # Add FXU Payment Option for Officers

  1. Changes
    - Add FXU cost columns to officer_types table (fxu_cost_7d, fxu_cost_30d, fxu_cost_90d)
    - Set initial FXU prices based on Dark Matter costs (roughly 1:10 ratio DM:FXU)
    - Create secure function for purchasing officers with FXU

  2. Notes
    - Players can now choose to pay with either Dark Matter OR FXU
    - FXU prices are set at approximately 1/10 of Dark Matter costs
*/

-- Add FXU cost columns to officer_types
ALTER TABLE officer_types
ADD COLUMN IF NOT EXISTS fxu_cost_7d integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS fxu_cost_30d integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS fxu_cost_90d integer DEFAULT 0;

-- Set FXU prices (approximately 1:10 ratio with Dark Matter)
UPDATE officer_types SET
  fxu_cost_7d = CEIL(dark_matter_cost_7d / 10.0),
  fxu_cost_30d = CEIL(dark_matter_cost_30d / 10.0),
  fxu_cost_90d = CEIL(dark_matter_cost_90d / 10.0);

-- Create function to purchase officer with FXU
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

  -- Check for existing active officer
  SELECT * INTO v_existing_officer
  FROM user_officers
  WHERE user_id = v_user_id 
    AND officer_type_id = p_officer_type_id
    AND expires_at > NOW();

  IF v_existing_officer IS NOT NULL THEN
    -- Extend existing officer
    v_new_expiry := v_existing_officer.expires_at + (v_days_to_add || ' days')::interval;
    
    UPDATE user_officers
    SET expires_at = v_new_expiry
    WHERE id = v_existing_officer.id;
  ELSE
    -- Create new officer assignment
    v_new_expiry := NOW() + (v_days_to_add || ' days')::interval;
    
    INSERT INTO user_officers (user_id, officer_type_id, expires_at)
    VALUES (v_user_id, p_officer_type_id, v_new_expiry);
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'expires_at', v_new_expiry,
    'fxu_spent', v_fxu_cost
  );
END;
$$;

-- Create function to purchase officer with Dark Matter (secured version)
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

  -- Check for existing active officer
  SELECT * INTO v_existing_officer
  FROM user_officers
  WHERE user_id = v_user_id 
    AND officer_type_id = p_officer_type_id
    AND expires_at > NOW();

  IF v_existing_officer IS NOT NULL THEN
    -- Extend existing officer
    v_new_expiry := v_existing_officer.expires_at + (v_days_to_add || ' days')::interval;
    
    UPDATE user_officers
    SET expires_at = v_new_expiry
    WHERE id = v_existing_officer.id;
  ELSE
    -- Create new officer assignment
    v_new_expiry := NOW() + (v_days_to_add || ' days')::interval;
    
    INSERT INTO user_officers (user_id, officer_type_id, expires_at)
    VALUES (v_user_id, p_officer_type_id, v_new_expiry);
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'expires_at', v_new_expiry,
    'dark_matter_spent', v_dm_cost
  );
END;
$$;
