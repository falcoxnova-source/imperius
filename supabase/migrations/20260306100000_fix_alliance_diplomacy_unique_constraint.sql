/*
  Fix: Alliance diplomacy UNIQUE constraint blocks cancellation of wars/pacts
  
  Problem: The UNIQUE(alliance_id, target_alliance_id, diplomacy_type, status) constraint
  prevents cancelling a war/pact if a previous one between the same alliances was already 
  cancelled, because two rows with status='cancelled' would violate the constraint.
  
  Solution: 
  1. Drop the existing UNIQUE constraint
  2. Create a partial unique index that only enforces uniqueness on active states (pending/active)
  3. Update cancel_diplomacy to delete old historical rows before updating
*/

-- Step 1: Drop the existing UNIQUE constraint
ALTER TABLE alliance_diplomacy DROP CONSTRAINT IF EXISTS alliance_diplomacy_alliance_id_target_alliance_id_diplomacy_key;

-- Also try the default naming pattern
ALTER TABLE alliance_diplomacy DROP CONSTRAINT IF EXISTS alliance_diplomacy_alliance_id_target_alliance_id_diploma_key;

-- Step 2: Create partial unique index only for active states
CREATE UNIQUE INDEX IF NOT EXISTS idx_alliance_diplomacy_active_unique
ON alliance_diplomacy (alliance_id, target_alliance_id, diplomacy_type)
WHERE status IN ('pending', 'active');

-- Step 3: Update cancel_diplomacy function to clean up old rows first
CREATE OR REPLACE FUNCTION cancel_diplomacy(p_diplomacy_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_user_alliance_id uuid;
  v_can_edit boolean;
  v_diplomacy record;
  v_other_alliance_id uuid;
BEGIN
  v_user_id := auth.uid();
  
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No autenticado');
  END IF;
  
  -- Get user's alliance and permissions
  SELECT alliance_id, can_edit INTO v_user_alliance_id, v_can_edit
  FROM alliance_members
  WHERE user_id = v_user_id;
  
  IF NOT COALESCE(v_can_edit, false) THEN
    RETURN jsonb_build_object('success', false, 'error', 'No tienes permiso para gestionar diplomacia');
  END IF;
  
  -- Get diplomacy record
  SELECT * INTO v_diplomacy
  FROM alliance_diplomacy
  WHERE id = p_diplomacy_id AND status = 'active';
  
  IF v_diplomacy IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Relacion no encontrada o no activa');
  END IF;
  
  -- Check user is part of this diplomacy
  IF v_diplomacy.alliance_id != v_user_alliance_id AND v_diplomacy.target_alliance_id != v_user_alliance_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'No tienes acceso a esta relacion');
  END IF;
  
  -- Determine other alliance
  v_other_alliance_id := CASE 
    WHEN v_diplomacy.alliance_id = v_user_alliance_id THEN v_diplomacy.target_alliance_id
    ELSE v_diplomacy.alliance_id
  END;

  -- Delete old cancelled/rejected rows for same pair and type to avoid any constraint issues
  DELETE FROM alliance_diplomacy
  WHERE alliance_id = v_diplomacy.alliance_id
    AND target_alliance_id = v_diplomacy.target_alliance_id
    AND diplomacy_type = v_diplomacy.diplomacy_type
    AND status IN ('cancelled', 'rejected')
    AND id != p_diplomacy_id;
  
  -- Cancel diplomacy
  UPDATE alliance_diplomacy
  SET status = 'cancelled'
  WHERE id = p_diplomacy_id;
  
  -- Notify other alliance
  INSERT INTO messages (recipient_id, subject, body, message_type)
  SELECT 
    a.leader_id,
    CASE v_diplomacy.diplomacy_type
      WHEN 'nap' THEN '⚠️ Pacto de No Agresion Cancelado'
      WHEN 'trade' THEN '⚠️ Pacto Comercial Cancelado'
      WHEN 'war' THEN '🕊️ Guerra Cancelada'
    END,
    format(
      'La alianza %s ha cancelado %s.',
      (SELECT name FROM alliances WHERE id = v_user_alliance_id),
      CASE v_diplomacy.diplomacy_type
        WHEN 'nap' THEN 'el Pacto de No Agresion'
        WHEN 'trade' THEN 'el Pacto Comercial'
        WHEN 'war' THEN 'la Guerra'
      END
    ),
    'alliance'
  FROM alliances a
  WHERE a.id = v_other_alliance_id;
  
  RETURN jsonb_build_object(
    'success', true, 
    'message', 'Relacion diplomatica cancelada'
  );
END;
$$;
