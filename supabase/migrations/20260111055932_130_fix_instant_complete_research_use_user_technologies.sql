/*
  # Fix instant_complete_research to use user_technologies table
  
  ## Problem
  The frontend passes a user_technologies.id (UUID) to instant_complete_research,
  but the function was looking in research_queue table which is empty.
  Research is actually tracked in user_technologies with is_researching and research_end_time columns.
  
  ## Solution
  Create overloaded function that accepts UUID and queries user_technologies table directly.
  
  ## Changes
  1. Create instant_complete_research(uuid) that works with user_technologies
  2. Keep the integer version for backwards compatibility
*/

-- Create the UUID version that works with user_technologies table
CREATE OR REPLACE FUNCTION instant_complete_research(p_technology_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_tech_record record;
  v_fxu_cost numeric;
  v_current_fxu numeric;
  v_remaining_seconds numeric;
  v_admin_id uuid;
  v_tech_name text;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN 
    RETURN jsonb_build_object('success', false, 'error', 'No autenticado'); 
  END IF;

  -- Get the research from user_technologies (where research is actually tracked)
  SELECT ut.*, tt.name as tech_name, tt.id as type_id
  INTO v_tech_record
  FROM user_technologies ut
  JOIN technology_types tt ON ut.technology_type_id = tt.id
  WHERE ut.id = p_technology_id 
    AND ut.user_id = v_user_id 
    AND ut.is_researching = true
    AND ut.research_end_time IS NOT NULL;

  IF v_tech_record IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No hay investigacion en progreso');
  END IF;

  -- Calculate remaining time
  v_remaining_seconds := GREATEST(0, EXTRACT(EPOCH FROM (v_tech_record.research_end_time - now())));

  -- Calculate FXU cost based on remaining time (tiered pricing)
  IF v_remaining_seconds <= 600 THEN 
    v_fxu_cost := GREATEST(1, CEIL(v_remaining_seconds / 60));
  ELSIF v_remaining_seconds <= 3600 THEN 
    v_fxu_cost := 10 + CEIL((v_remaining_seconds - 600) / 120);
  ELSIF v_remaining_seconds <= 86400 THEN 
    v_fxu_cost := 35 + CEIL((v_remaining_seconds - 3600) / 300);
  ELSE 
    v_fxu_cost := 100 + CEIL((v_remaining_seconds - 86400) / 600);
  END IF;

  -- Check user has enough FXU
  SELECT fxu_balance INTO v_current_fxu FROM profiles WHERE id = v_user_id;

  IF v_current_fxu < v_fxu_cost THEN
    RETURN jsonb_build_object('success', false, 'error', 'FXU insuficiente', 'required', v_fxu_cost);
  END IF;

  -- Set FXU context for trigger bypass
  PERFORM _internal_set_fxu_context();

  -- Deduct FXU from user
  UPDATE profiles SET fxu_balance = fxu_balance - v_fxu_cost WHERE id = v_user_id;

  -- Add FXU to admin
  SELECT id INTO v_admin_id FROM profiles WHERE is_admin = true ORDER BY created_at ASC LIMIT 1;
  IF v_admin_id IS NOT NULL AND v_admin_id != v_user_id THEN
    UPDATE profiles SET fxu_balance = fxu_balance + v_fxu_cost WHERE id = v_admin_id;
  END IF;

  -- Record admin revenue
  PERFORM record_admin_revenue(
    'instant_research', 
    v_fxu_cost,
    'Investigacion: ' || v_tech_record.tech_name || ' Lv' || (v_tech_record.level + 1), 
    v_user_id, 
    p_technology_id
  );

  -- Complete the research - increment level and clear researching state
  UPDATE user_technologies 
  SET 
    level = level + 1,
    is_researching = false,
    research_end_time = NULL,
    research_planet_id = NULL
  WHERE id = p_technology_id;

  -- Update user points
  PERFORM update_user_points(v_user_id);

  RETURN jsonb_build_object('success', true, 'fxu_spent', v_fxu_cost, 'new_level', v_tech_record.level + 1);

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', 'Error de base de datos: ' || SQLERRM);
END;
$$;

-- Also fix the calculate_fxu_cost_research to accept UUID
CREATE OR REPLACE FUNCTION calculate_fxu_cost_research(p_technology_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_end_time timestamptz;
  v_remaining_seconds numeric;
  v_fxu_cost integer;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN RETURN 0; END IF;

  -- Get research end time from user_technologies
  SELECT research_end_time INTO v_end_time
  FROM user_technologies
  WHERE id = p_technology_id 
    AND user_id = v_user_id 
    AND is_researching = true;

  IF v_end_time IS NULL THEN RETURN 0; END IF;

  v_remaining_seconds := GREATEST(0, EXTRACT(EPOCH FROM (v_end_time - now())));
  
  IF v_remaining_seconds <= 0 THEN RETURN 0; END IF;

  -- Tiered pricing
  IF v_remaining_seconds <= 600 THEN 
    v_fxu_cost := GREATEST(1, CEIL(v_remaining_seconds / 60));
  ELSIF v_remaining_seconds <= 3600 THEN 
    v_fxu_cost := 10 + CEIL((v_remaining_seconds - 600) / 120);
  ELSIF v_remaining_seconds <= 86400 THEN 
    v_fxu_cost := 35 + CEIL((v_remaining_seconds - 3600) / 300);
  ELSE 
    v_fxu_cost := 100 + CEIL((v_remaining_seconds - 86400) / 600);
  END IF;

  RETURN v_fxu_cost;
END;
$$;
