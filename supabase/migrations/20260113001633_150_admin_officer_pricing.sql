/*
  # Admin Officer Pricing Management

  1. New Functions
    - `admin_get_officer_pricing()` - Get all officer prices (DM and FXU)
    - `admin_update_officer_pricing()` - Update officer prices (admin only)

  2. Security
    - Functions are SECURITY DEFINER with admin check
    - Only admins can update pricing
*/

-- Function to get all officer pricing
CREATE OR REPLACE FUNCTION admin_get_officer_pricing()
RETURNS TABLE (
  id uuid,
  code text,
  name text,
  dark_matter_cost_7d integer,
  dark_matter_cost_30d integer,
  dark_matter_cost_90d integer,
  fxu_cost_7d integer,
  fxu_cost_30d integer,
  fxu_cost_90d integer,
  sort_order integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_is_admin boolean;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT is_admin INTO v_is_admin FROM profiles WHERE id = v_user_id;
  IF NOT COALESCE(v_is_admin, false) THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;

  RETURN QUERY
  SELECT 
    ot.id,
    ot.code,
    ot.name,
    ot.dark_matter_cost_7d,
    ot.dark_matter_cost_30d,
    ot.dark_matter_cost_90d,
    ot.fxu_cost_7d,
    ot.fxu_cost_30d,
    ot.fxu_cost_90d,
    ot.sort_order
  FROM officer_types ot
  ORDER BY ot.sort_order;
END;
$$;

-- Function to update officer pricing
CREATE OR REPLACE FUNCTION admin_update_officer_pricing(
  p_officer_id uuid,
  p_dark_matter_7d integer,
  p_dark_matter_30d integer,
  p_dark_matter_90d integer,
  p_fxu_7d integer,
  p_fxu_30d integer,
  p_fxu_90d integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_is_admin boolean;
  v_officer_name text;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  SELECT is_admin INTO v_is_admin FROM profiles WHERE id = v_user_id;
  IF NOT COALESCE(v_is_admin, false) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Admin access required');
  END IF;

  -- Validate input
  IF p_dark_matter_7d < 0 OR p_dark_matter_30d < 0 OR p_dark_matter_90d < 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Dark Matter costs cannot be negative');
  END IF;

  IF p_fxu_7d < 0 OR p_fxu_30d < 0 OR p_fxu_90d < 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'FXU costs cannot be negative');
  END IF;

  -- Check officer exists
  SELECT name INTO v_officer_name FROM officer_types WHERE id = p_officer_id;
  IF v_officer_name IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Officer not found');
  END IF;

  -- Update pricing
  UPDATE officer_types
  SET
    dark_matter_cost_7d = p_dark_matter_7d,
    dark_matter_cost_30d = p_dark_matter_30d,
    dark_matter_cost_90d = p_dark_matter_90d,
    fxu_cost_7d = p_fxu_7d,
    fxu_cost_30d = p_fxu_30d,
    fxu_cost_90d = p_fxu_90d
  WHERE id = p_officer_id;

  RETURN jsonb_build_object(
    'success', true,
    'officer_name', v_officer_name
  );
END;
$$;

-- Function to bulk update all officer pricing at once
CREATE OR REPLACE FUNCTION admin_bulk_update_officer_pricing(
  p_pricing jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_is_admin boolean;
  v_item jsonb;
  v_updated_count integer := 0;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  SELECT is_admin INTO v_is_admin FROM profiles WHERE id = v_user_id;
  IF NOT COALESCE(v_is_admin, false) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Admin access required');
  END IF;

  -- Loop through each pricing update
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_pricing)
  LOOP
    UPDATE officer_types
    SET
      dark_matter_cost_7d = (v_item->>'dark_matter_cost_7d')::integer,
      dark_matter_cost_30d = (v_item->>'dark_matter_cost_30d')::integer,
      dark_matter_cost_90d = (v_item->>'dark_matter_cost_90d')::integer,
      fxu_cost_7d = (v_item->>'fxu_cost_7d')::integer,
      fxu_cost_30d = (v_item->>'fxu_cost_30d')::integer,
      fxu_cost_90d = (v_item->>'fxu_cost_90d')::integer
    WHERE id = (v_item->>'id')::uuid;

    v_updated_count := v_updated_count + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'updated_count', v_updated_count
  );
END;
$$;
