-- Migration: Add Autopilot (Piloto Automatico) feature
-- Allows admin to enable autopilot eligibility for specific accounts
-- Players can then toggle it on/off in their settings

-- 1. Add columns to profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS autopilot_eligible BOOLEAN DEFAULT false;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS autopilot_active BOOLEAN DEFAULT false;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS last_manual_action TIMESTAMPTZ DEFAULT NULL;

-- 2. Index for bot_ai_tick performance
CREATE INDEX IF NOT EXISTS idx_profiles_autopilot_active ON profiles (autopilot_active) WHERE autopilot_active = true;

-- 3. RPC for admin to toggle autopilot eligibility
CREATE OR REPLACE FUNCTION admin_toggle_autopilot_eligible(p_user_id UUID, p_eligible BOOLEAN)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_admin BOOLEAN;
BEGIN
  SELECT is_admin INTO v_admin FROM profiles WHERE id = auth.uid();
  IF NOT COALESCE(v_admin, false) THEN
    RETURN json_build_object('success', false, 'error', 'No autorizado');
  END IF;

  UPDATE profiles 
  SET autopilot_eligible = p_eligible,
      -- If disabling eligibility, also disable active
      autopilot_active = CASE WHEN p_eligible = false THEN false ELSE autopilot_active END
  WHERE id = p_user_id;

  RETURN json_build_object('success', true);
END;
$$;

-- 4. RPC for player to toggle autopilot on/off (only if eligible)
CREATE OR REPLACE FUNCTION toggle_autopilot(p_enable BOOLEAN)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_eligible BOOLEAN;
BEGIN
  SELECT autopilot_eligible INTO v_eligible FROM profiles WHERE id = auth.uid();
  
  IF NOT COALESCE(v_eligible, false) THEN
    RETURN json_build_object('success', false, 'error', 'Piloto automatico no habilitado para esta cuenta');
  END IF;

  UPDATE profiles SET autopilot_active = p_enable WHERE id = auth.uid();
  
  RETURN json_build_object('success', true, 'active', p_enable);
END;
$$;

-- 5. Function to track manual actions (call from key game actions)
CREATE OR REPLACE FUNCTION update_last_manual_action()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE profiles SET last_manual_action = NOW() WHERE id = auth.uid();
END;
$$;

-- 6. bot_ai_tick() patched via scripts/apply-autopilot-migration.cjs
-- Cursor WHERE changed from: WHERE is_bot = true
-- To: WHERE (is_bot = true OR (autopilot_active = true AND autopilot_eligible = true 
--      AND (last_manual_action IS NULL OR last_manual_action < NOW() - INTERVAL '5 minutes')))

-- 7. Grant execute permissions
GRANT EXECUTE ON FUNCTION admin_toggle_autopilot_eligible(UUID, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION toggle_autopilot(BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION update_last_manual_action() TO authenticated;
