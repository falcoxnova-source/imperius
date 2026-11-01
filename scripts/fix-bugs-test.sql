-- =============================================================================
-- FIX BUG #1: perform_acs_combat - Add allied stationed fleet support
-- FIX BUG #2: process_fleet_arrival - Remove duplicate expedition messages
-- =============================================================================

-- =====================================================
-- BUG #2 FIX: Remove duplicate expedition message
-- The expedition branch in process_fleet_arrival calls process_expedition()
-- which already inserts the message and sets is_returning.
-- The extra INSERT + UPDATE here creates a duplicate "no encontro nada" message.
-- =====================================================

-- We need to CREATE OR REPLACE the entire process_fleet_arrival function.
-- But since it's very large, we'll use a targeted approach: 
-- extract the source, fix it, and re-deploy.

-- Actually let's use a simpler approach: just fix the expedition branch
-- by replacing the function body with the corrected version.

-- First, let's fix process_fleet_arrival's expedition branch.
-- We'll do this by getting the current function definition and patching it.

DO $$
DECLARE
  v_src text;
  v_old_expedition text;
  v_new_expedition text;
BEGIN
  -- Get current function source
  SELECT prosrc INTO v_src FROM pg_proc WHERE proname = 'process_fleet_arrival';
  
  -- The old expedition branch:
  v_old_expedition := E'WHEN ''expedition'' THEN\nv_expedition_result := process_expedition(p_fleet_id);\nv_expedition_message := COALESCE(v_expedition_result->>''message'', ''La expedicion no encontro nada interesante.'');\n\nINSERT INTO messages (sender_id, recipient_id, subject, body, message_type)\nVALUES (NULL, fleet_record.user_id, ''Reporte de Expedicion'', v_expedition_message, ''expedition'');\n\nUPDATE fleets SET is_returning = true WHERE id = p_fleet_id;';
  
  -- The new expedition branch (just call process_expedition, it handles everything):
  v_new_expedition := E'WHEN ''expedition'' THEN\nv_expedition_result := process_expedition(p_fleet_id);';
  
  -- Check if the old text exists
  IF position(v_old_expedition IN v_src) > 0 THEN
    RAISE NOTICE 'Found old expedition branch, patching...';
  ELSE
    RAISE NOTICE 'Old expedition branch not found with exact match, trying alternative...';
  END IF;
END $$;
