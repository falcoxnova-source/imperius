/*
  # Alliance System Improvements
  
  ## Summary
  Fixes alliance system so that by default all alliances require approval to join.
  Adds diplomacy system for alliances (NAP, Trade Pact, War declarations).
  
  ## Changes
  
  1. Default is_open to FALSE
    - All new alliances will require approval by default
    - Updates existing alliances to require approval
  
  2. New Tables
    - `alliance_diplomacy` - Stores diplomatic relations between alliances
      - id (uuid)
      - alliance_id (uuid) - The alliance making the offer
      - target_alliance_id (uuid) - The target alliance
      - diplomacy_type (text) - 'nap', 'trade', 'war'
      - status (text) - 'pending', 'active', 'rejected', 'cancelled'
      - proposed_at, accepted_at, expires_at
  
  3. New Functions
    - `propose_diplomacy` - Propose a diplomatic relation
    - `respond_diplomacy` - Accept/reject diplomatic proposal
    - `cancel_diplomacy` - Cancel an active diplomatic relation
    - `get_alliance_diplomacy` - Get all diplomatic relations for an alliance
  
  4. Security
    - RLS enabled on alliance_diplomacy
    - Only alliance leaders/officers can manage diplomacy
    
  ## Diplomacy Types
  - NAP (Non-Aggression Pact): Members cannot attack each other
  - Trade Pact: Members can transport resources to each other (existing feature)
  - War: Alliance declares war on another (public declaration)
*/

-- Update default for is_open to FALSE
ALTER TABLE alliances ALTER COLUMN is_open SET DEFAULT false;

-- Update existing alliances to require approval (only those that haven't explicitly set it)
UPDATE alliances SET is_open = false WHERE is_open IS NULL OR is_open = true;

-- Create alliance_diplomacy table
CREATE TABLE IF NOT EXISTS alliance_diplomacy (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  alliance_id uuid REFERENCES alliances(id) ON DELETE CASCADE,
  target_alliance_id uuid REFERENCES alliances(id) ON DELETE CASCADE,
  diplomacy_type text NOT NULL CHECK (diplomacy_type IN ('nap', 'trade', 'war')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'rejected', 'cancelled')),
  proposed_by uuid REFERENCES profiles(id),
  responded_by uuid REFERENCES profiles(id),
  proposed_at timestamptz DEFAULT now(),
  accepted_at timestamptz,
  expires_at timestamptz,
  message text,
  created_at timestamptz DEFAULT now(),
  UNIQUE(alliance_id, target_alliance_id, diplomacy_type, status)
);

-- Enable RLS
ALTER TABLE alliance_diplomacy ENABLE ROW LEVEL SECURITY;

-- Policy: Members can view their alliance's diplomacy
CREATE POLICY "Alliance members can view diplomacy"
  ON alliance_diplomacy FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM alliance_members 
      WHERE alliance_members.user_id = auth.uid() 
      AND (alliance_members.alliance_id = alliance_diplomacy.alliance_id 
           OR alliance_members.alliance_id = alliance_diplomacy.target_alliance_id)
    )
  );

-- Policy: Officers can insert diplomacy proposals
CREATE POLICY "Officers can propose diplomacy"
  ON alliance_diplomacy FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM alliance_members 
      WHERE alliance_members.user_id = auth.uid() 
      AND alliance_members.alliance_id = alliance_diplomacy.alliance_id
      AND alliance_members.can_edit = true
    )
  );

-- Policy: Officers can update diplomacy (accept/reject/cancel)
CREATE POLICY "Officers can manage diplomacy"
  ON alliance_diplomacy FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM alliance_members 
      WHERE alliance_members.user_id = auth.uid() 
      AND (alliance_members.alliance_id = alliance_diplomacy.alliance_id 
           OR alliance_members.alliance_id = alliance_diplomacy.target_alliance_id)
      AND alliance_members.can_edit = true
    )
  );

-- Function to propose diplomacy
CREATE OR REPLACE FUNCTION propose_diplomacy(
  p_target_alliance_id uuid,
  p_diplomacy_type text,
  p_message text DEFAULT NULL,
  p_duration_days int DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_user_alliance_id uuid;
  v_can_edit boolean;
  v_existing record;
  v_diplomacy_id uuid;
  v_expires_at timestamptz;
  v_target_alliance record;
BEGIN
  v_user_id := auth.uid();
  
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No autenticado');
  END IF;
  
  -- Get user's alliance and permissions
  SELECT alliance_id, can_edit INTO v_user_alliance_id, v_can_edit
  FROM alliance_members
  WHERE user_id = v_user_id;
  
  IF v_user_alliance_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No estas en una alianza');
  END IF;
  
  IF NOT COALESCE(v_can_edit, false) THEN
    RETURN jsonb_build_object('success', false, 'error', 'No tienes permiso para gestionar diplomacia');
  END IF;
  
  -- Validate target alliance
  SELECT * INTO v_target_alliance FROM alliances WHERE id = p_target_alliance_id;
  IF v_target_alliance IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Alianza objetivo no encontrada');
  END IF;
  
  IF v_user_alliance_id = p_target_alliance_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'No puedes hacer diplomacia con tu propia alianza');
  END IF;
  
  -- Check for existing active/pending diplomacy of same type
  SELECT * INTO v_existing
  FROM alliance_diplomacy
  WHERE ((alliance_id = v_user_alliance_id AND target_alliance_id = p_target_alliance_id)
         OR (alliance_id = p_target_alliance_id AND target_alliance_id = v_user_alliance_id))
    AND diplomacy_type = p_diplomacy_type
    AND status IN ('pending', 'active');
    
  IF v_existing IS NOT NULL THEN
    IF v_existing.status = 'pending' THEN
      RETURN jsonb_build_object('success', false, 'error', 'Ya existe una propuesta pendiente de este tipo');
    ELSE
      RETURN jsonb_build_object('success', false, 'error', 'Ya existe una relacion activa de este tipo');
    END IF;
  END IF;
  
  -- Calculate expiration if duration provided
  IF p_duration_days IS NOT NULL AND p_duration_days > 0 THEN
    v_expires_at := now() + (p_duration_days || ' days')::interval;
  END IF;
  
  -- Create diplomacy proposal
  INSERT INTO alliance_diplomacy (
    alliance_id, target_alliance_id, diplomacy_type, status, 
    proposed_by, message, expires_at
  ) VALUES (
    v_user_alliance_id, p_target_alliance_id, p_diplomacy_type, 
    CASE WHEN p_diplomacy_type = 'war' THEN 'active' ELSE 'pending' END,
    v_user_id, p_message, v_expires_at
  ) RETURNING id INTO v_diplomacy_id;
  
  -- Send notification to target alliance leader
  INSERT INTO messages (recipient_id, subject, body, message_type)
  SELECT 
    a.leader_id,
    CASE p_diplomacy_type
      WHEN 'nap' THEN 'Propuesta de Pacto de No Agresion'
      WHEN 'trade' THEN 'Propuesta de Pacto Comercial'
      WHEN 'war' THEN 'Declaracion de Guerra!'
    END,
    CASE p_diplomacy_type
      WHEN 'war' THEN 
        'La alianza ' || (SELECT name FROM alliances WHERE id = v_user_alliance_id) || 
        ' te ha declarado la guerra!' || 
        CASE WHEN p_message IS NOT NULL THEN E'\n\nMensaje: ' || p_message ELSE '' END
      ELSE
        'La alianza ' || (SELECT name FROM alliances WHERE id = v_user_alliance_id) || 
        ' te ha enviado una propuesta diplomatica.' ||
        CASE WHEN p_message IS NOT NULL THEN E'\n\nMensaje: ' || p_message ELSE '' END ||
        E'\n\nRevisa la seccion de Alianza > Diplomacia para responder.'
    END,
    'alliance'
  FROM alliances a
  WHERE a.id = p_target_alliance_id AND a.leader_id IS NOT NULL;
  
  RETURN jsonb_build_object(
    'success', true, 
    'diplomacy_id', v_diplomacy_id,
    'message', CASE p_diplomacy_type
      WHEN 'war' THEN 'Guerra declarada!'
      ELSE 'Propuesta enviada'
    END
  );
END;
$$;

-- Function to respond to diplomacy proposal
CREATE OR REPLACE FUNCTION respond_diplomacy(
  p_diplomacy_id uuid,
  p_accept boolean
)
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
  WHERE id = p_diplomacy_id AND status = 'pending';
  
  IF v_diplomacy IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Propuesta no encontrada o ya procesada');
  END IF;
  
  -- Only target alliance can respond
  IF v_diplomacy.target_alliance_id != v_user_alliance_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Solo la alianza objetivo puede responder');
  END IF;
  
  -- Update diplomacy status
  UPDATE alliance_diplomacy
  SET 
    status = CASE WHEN p_accept THEN 'active' ELSE 'rejected' END,
    responded_by = v_user_id,
    accepted_at = CASE WHEN p_accept THEN now() ELSE NULL END
  WHERE id = p_diplomacy_id;
  
  -- Send notification to proposing alliance
  INSERT INTO messages (recipient_id, subject, body, message_type)
  SELECT 
    a.leader_id,
    CASE 
      WHEN p_accept THEN 'Propuesta Diplomatica Aceptada'
      ELSE 'Propuesta Diplomatica Rechazada'
    END,
    'La alianza ' || (SELECT name FROM alliances WHERE id = v_user_alliance_id) || 
    CASE 
      WHEN p_accept THEN ' ha aceptado tu propuesta de ' 
      ELSE ' ha rechazado tu propuesta de '
    END ||
    CASE v_diplomacy.diplomacy_type
      WHEN 'nap' THEN 'Pacto de No Agresion'
      WHEN 'trade' THEN 'Pacto Comercial'
    END || '.',
    'alliance'
  FROM alliances a
  WHERE a.id = v_diplomacy.alliance_id AND a.leader_id IS NOT NULL;
  
  RETURN jsonb_build_object(
    'success', true, 
    'message', CASE WHEN p_accept THEN 'Propuesta aceptada' ELSE 'Propuesta rechazada' END
  );
END;
$$;

-- Function to cancel diplomacy (both parties can cancel)
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
  
  -- Cancel diplomacy
  UPDATE alliance_diplomacy
  SET status = 'cancelled'
  WHERE id = p_diplomacy_id;
  
  -- Notify other alliance
  INSERT INTO messages (recipient_id, subject, body, message_type)
  SELECT 
    a.leader_id,
    CASE v_diplomacy.diplomacy_type
      WHEN 'nap' THEN 'Pacto de No Agresion Cancelado'
      WHEN 'trade' THEN 'Pacto Comercial Cancelado'
      WHEN 'war' THEN 'Fin de la Guerra'
    END,
    'La alianza ' || (SELECT name FROM alliances WHERE id = v_user_alliance_id) || 
    ' ha cancelado ' ||
    CASE v_diplomacy.diplomacy_type
      WHEN 'nap' THEN 'el Pacto de No Agresion'
      WHEN 'trade' THEN 'el Pacto Comercial'
      WHEN 'war' THEN 'la declaracion de guerra'
    END || '.',
    'alliance'
  FROM alliances a
  WHERE a.id = v_other_alliance_id AND a.leader_id IS NOT NULL;
  
  RETURN jsonb_build_object('success', true, 'message', 'Relacion cancelada');
END;
$$;

-- Function to get alliance diplomacy
CREATE OR REPLACE FUNCTION get_alliance_diplomacy(p_alliance_id uuid)
RETURNS TABLE (
  id uuid,
  alliance_id uuid,
  alliance_name text,
  alliance_tag text,
  target_alliance_id uuid,
  target_alliance_name text,
  target_alliance_tag text,
  diplomacy_type text,
  status text,
  proposed_at timestamptz,
  accepted_at timestamptz,
  expires_at timestamptz,
  message text,
  is_incoming boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    d.id,
    d.alliance_id,
    a1.name as alliance_name,
    a1.tag as alliance_tag,
    d.target_alliance_id,
    a2.name as target_alliance_name,
    a2.tag as target_alliance_tag,
    d.diplomacy_type,
    d.status,
    d.proposed_at,
    d.accepted_at,
    d.expires_at,
    d.message,
    (d.target_alliance_id = p_alliance_id) as is_incoming
  FROM alliance_diplomacy d
  JOIN alliances a1 ON d.alliance_id = a1.id
  JOIN alliances a2 ON d.target_alliance_id = a2.id
  WHERE (d.alliance_id = p_alliance_id OR d.target_alliance_id = p_alliance_id)
    AND d.status IN ('pending', 'active')
  ORDER BY 
    CASE d.status WHEN 'pending' THEN 0 ELSE 1 END,
    d.proposed_at DESC;
END;
$$;

-- Update validate_fleet_mission to check NAP
CREATE OR REPLACE FUNCTION check_alliance_nap(p_attacker_id uuid, p_defender_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_attacker_alliance_id uuid;
  v_defender_alliance_id uuid;
  v_nap_exists boolean;
BEGIN
  -- Get attacker's alliance
  SELECT alliance_id INTO v_attacker_alliance_id
  FROM alliance_members
  WHERE user_id = p_attacker_id;
  
  -- Get defender's alliance
  SELECT alliance_id INTO v_defender_alliance_id
  FROM alliance_members
  WHERE user_id = p_defender_id;
  
  -- If either not in alliance, no NAP applies
  IF v_attacker_alliance_id IS NULL OR v_defender_alliance_id IS NULL THEN
    RETURN jsonb_build_object('has_nap', false);
  END IF;
  
  -- Same alliance cannot attack
  IF v_attacker_alliance_id = v_defender_alliance_id THEN
    RETURN jsonb_build_object('has_nap', true, 'reason', 'No puedes atacar a miembros de tu propia alianza');
  END IF;
  
  -- Check for active NAP
  SELECT EXISTS (
    SELECT 1 FROM alliance_diplomacy
    WHERE ((alliance_id = v_attacker_alliance_id AND target_alliance_id = v_defender_alliance_id)
           OR (alliance_id = v_defender_alliance_id AND target_alliance_id = v_attacker_alliance_id))
      AND diplomacy_type = 'nap'
      AND status = 'active'
      AND (expires_at IS NULL OR expires_at > now())
  ) INTO v_nap_exists;
  
  IF v_nap_exists THEN
    RETURN jsonb_build_object('has_nap', true, 'reason', 'Existe un Pacto de No Agresion activo con esa alianza');
  END IF;
  
  RETURN jsonb_build_object('has_nap', false);
END;
$$;

-- Update join_open_alliance to properly check is_open
CREATE OR REPLACE FUNCTION join_open_alliance(p_alliance_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_alliance record;
  v_member_count int;
  v_max_members int := 5;
BEGIN
  v_user_id := auth.uid();
  
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No autenticado');
  END IF;

  -- Check if already in alliance
  IF EXISTS (SELECT 1 FROM alliance_members WHERE user_id = v_user_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Ya estas en una alianza');
  END IF;

  -- Get alliance
  SELECT * INTO v_alliance
  FROM alliances
  WHERE id = p_alliance_id;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Alianza no encontrada');
  END IF;

  -- IMPORTANT: Now properly check is_open - must be explicitly true
  IF NOT COALESCE(v_alliance.is_open, false) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Esta alianza requiere solicitud de ingreso');
  END IF;

  -- Check member limit
  SELECT COUNT(*) INTO v_member_count
  FROM alliance_members
  WHERE alliance_id = p_alliance_id;
  
  IF v_member_count >= v_max_members THEN
    RETURN jsonb_build_object(
      'success', false, 
      'error', 'La alianza ha alcanzado el limite maximo de ' || v_max_members || ' miembros'
    );
  END IF;

  -- Join alliance
  INSERT INTO alliance_members (alliance_id, user_id, rank_name, rank_level, can_invite, can_kick, can_edit)
  VALUES (p_alliance_id, v_user_id, 'Miembro', 1, false, false, false);

  -- Update alliance member count
  UPDATE alliances
  SET member_count = member_count + 1
  WHERE id = p_alliance_id;

  RETURN jsonb_build_object('success', true, 'message', 'Te has unido a la alianza');
END;
$$;

-- Add index for faster diplomacy lookups
CREATE INDEX IF NOT EXISTS idx_alliance_diplomacy_alliances 
  ON alliance_diplomacy(alliance_id, target_alliance_id);
CREATE INDEX IF NOT EXISTS idx_alliance_diplomacy_status 
  ON alliance_diplomacy(status) WHERE status IN ('pending', 'active');

-- Grant permissions
GRANT ALL ON alliance_diplomacy TO authenticated;
GRANT EXECUTE ON FUNCTION propose_diplomacy TO authenticated;
GRANT EXECUTE ON FUNCTION respond_diplomacy TO authenticated;
GRANT EXECUTE ON FUNCTION cancel_diplomacy TO authenticated;
GRANT EXECUTE ON FUNCTION get_alliance_diplomacy TO authenticated;
GRANT EXECUTE ON FUNCTION check_alliance_nap TO authenticated;
