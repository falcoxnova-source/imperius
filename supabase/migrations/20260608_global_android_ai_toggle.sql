-- =====================================================================
-- Fix: Sincronizar Android AI global via cron (evita PostgREST cache)
-- =====================================================================

CREATE OR REPLACE FUNCTION sync_android_ai_global()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_enabled boolean;
  v_officer_id uuid := '527d674f-44d9-4c20-9efc-392968ac7457';
  v_count integer;
BEGIN
  SELECT COALESCE((value = 'true'), false) INTO v_enabled FROM game_settings WHERE key = 'global_android_ai_enabled';

  IF v_enabled THEN
    INSERT INTO user_officers (user_id, officer_type_id, is_active)
    SELECT p.id, v_officer_id, true
    FROM profiles p
    WHERE NOT EXISTS (
      SELECT 1 FROM user_officers uo WHERE uo.user_id = p.id AND uo.officer_type_id = v_officer_id
    )
    AND p.is_bot = false;
  ELSE
    DELETE FROM user_officers WHERE officer_type_id = v_officer_id;
  END IF;
END;
$$;

-- Frontend functions (simple, PostgREST should cache these small ones)
CREATE OR REPLACE FUNCTION admin_set_android_ai(p_enabled boolean)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin_id uuid;
BEGIN
  v_admin_id := auth.uid();
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = v_admin_id AND is_admin = true) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Solo administradores');
  END IF;

  UPDATE game_settings SET value = CASE WHEN p_enabled THEN 'true' ELSE 'false' END, updated_at = now() WHERE key = 'global_android_ai_enabled';
  PERFORM sync_android_ai_global();
  
  RETURN jsonb_build_object('success', true, 'enabled', p_enabled);
END;
$$;

DROP FUNCTION IF EXISTS toggle_global_android_ai(boolean);

-- Update existing game_setting
INSERT INTO game_settings (key, value, description) 
VALUES ('global_android_ai_enabled', 'false', 'Toggle global del oficial Androide IA')
ON CONFLICT (key) DO NOTHING;

-- Schedule cron (every 2 minutes, won't duplicate)
SELECT cron.schedule('sync-android-ai', '*/2 * * * *', 'SELECT sync_android_ai_global()');
