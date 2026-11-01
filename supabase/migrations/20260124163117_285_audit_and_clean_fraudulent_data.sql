/*
  # Audit and Clean Fraudulent Data
  
  ## Purpose
  This migration creates admin functions to detect and clean fraudulent data
  that was added by exploiting the RLS UPDATE vulnerability (now fixed).
  
  ## Functions Created
  1. admin_audit_suspicious_ships() - Detects ships without construction history
  2. admin_clean_fraudulent_ships() - Removes ships that have no legitimate origin
  
  ## Logic
  Ships can be obtained through:
  - Shipyard construction (logged in shipyard_queue)
  - Expeditions (only light_fighter=7, heavy_fighter=8, cruiser=9)
  - Starting ships for new players (none by default)
  
  Ships that CANNOT be obtained from expeditions and have no construction history
  are considered fraudulent:
  - espionage_probe (5)
  - solar_satellite (6)
  - small_cargo (1) - cannot be found in expeditions
  - large_cargo (2) - cannot be found in expeditions
  - colony_ship (3) - cannot be found in expeditions
  - recycler (4) - cannot be found in expeditions
  - bomber (10)
  - destroyer (11)
  - battlecruiser (12)
  - battleship (13)
  - deathstar (14)
*/

-- =====================================================
-- ADMIN FUNCTION: AUDIT SUSPICIOUS SHIPS
-- =====================================================

CREATE OR REPLACE FUNCTION admin_audit_suspicious_ships()
RETURNS TABLE (
  username text,
  user_id uuid,
  ship_name text,
  ship_type_id int,
  current_quantity bigint,
  built_quantity bigint,
  can_find_in_expedition boolean,
  suspicious_quantity bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH built_ships AS (
    -- Sum all ships ever built by each user
    SELECT 
      pl.user_id,
      sq.ship_type_id,
      COALESCE(SUM(sq.quantity), 0) as total_built
    FROM shipyard_queue sq
    JOIN planets pl ON sq.planet_id = pl.id
    GROUP BY pl.user_id, sq.ship_type_id
  ),
  current_ships AS (
    -- Sum all ships currently owned by each user (across all planets)
    SELECT 
      pl.user_id,
      ps.ship_type_id,
      COALESCE(SUM(ps.quantity), 0) as total_current
    FROM planet_ships ps
    JOIN planets pl ON ps.planet_id = pl.id
    GROUP BY pl.user_id, ps.ship_type_id
  ),
  expedition_types AS (
    -- Ships that CAN be found in expeditions
    SELECT unnest(ARRAY[7, 8, 9]) as ship_type_id -- light_fighter, heavy_fighter, cruiser
  )
  SELECT 
    p.username,
    cs.user_id,
    st.name as ship_name,
    cs.ship_type_id,
    cs.total_current as current_quantity,
    COALESCE(bs.total_built, 0) as built_quantity,
    EXISTS(SELECT 1 FROM expedition_types et WHERE et.ship_type_id = cs.ship_type_id) as can_find_in_expedition,
    CASE 
      -- For expedition-findable ships, allow some tolerance (up to 100 extra)
      WHEN EXISTS(SELECT 1 FROM expedition_types et WHERE et.ship_type_id = cs.ship_type_id) THEN
        GREATEST(0, cs.total_current - COALESCE(bs.total_built, 0) - 100)
      -- For other ships, any excess is suspicious
      ELSE
        GREATEST(0, cs.total_current - COALESCE(bs.total_built, 0))
    END as suspicious_quantity
  FROM current_ships cs
  JOIN profiles p ON cs.user_id = p.id
  JOIN ship_types st ON cs.ship_type_id = st.id
  LEFT JOIN built_ships bs ON cs.user_id = bs.user_id AND cs.ship_type_id = bs.ship_type_id
  WHERE cs.total_current > COALESCE(bs.total_built, 0)
    AND NOT EXISTS(SELECT 1 FROM expedition_types et WHERE et.ship_type_id = cs.ship_type_id)
  ORDER BY (cs.total_current - COALESCE(bs.total_built, 0)) DESC;
END;
$$;

-- =====================================================
-- ADMIN FUNCTION: CLEAN FRAUDULENT SHIPS
-- =====================================================

CREATE OR REPLACE FUNCTION admin_clean_fraudulent_ships(p_dry_run boolean DEFAULT true)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin_id uuid;
  v_cleaned_count int := 0;
  v_cleaned_details jsonb := '[]'::jsonb;
  v_record record;
  v_remove_quantity bigint;
BEGIN
  -- Verify admin
  v_admin_id := auth.uid();
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = v_admin_id AND is_admin = true) THEN
    RAISE EXCEPTION 'Access denied: Admin only';
  END IF;

  -- Find and clean fraudulent ships
  FOR v_record IN 
    WITH built_ships AS (
      SELECT 
        pl.user_id,
        sq.ship_type_id,
        COALESCE(SUM(sq.quantity), 0) as total_built
      FROM shipyard_queue sq
      JOIN planets pl ON sq.planet_id = pl.id
      GROUP BY pl.user_id, sq.ship_type_id
    ),
    expedition_types AS (
      SELECT unnest(ARRAY[7, 8, 9]) as ship_type_id
    )
    SELECT 
      ps.id as planet_ship_id,
      ps.planet_id,
      ps.ship_type_id,
      ps.quantity as current_qty,
      COALESCE(bs.total_built, 0) as built_qty,
      pl.user_id,
      p.username,
      st.name as ship_name,
      -- Calculate how many to remove
      CASE 
        WHEN NOT EXISTS(SELECT 1 FROM expedition_types et WHERE et.ship_type_id = ps.ship_type_id) THEN
          -- Non-expedition ships: remove all that weren't built
          ps.quantity - COALESCE(bs.total_built, 0)
        ELSE
          0 -- Don't touch expedition-findable ships
      END as to_remove
    FROM planet_ships ps
    JOIN planets pl ON ps.planet_id = pl.id
    JOIN profiles p ON pl.user_id = p.id
    JOIN ship_types st ON ps.ship_type_id = st.id
    LEFT JOIN built_ships bs ON pl.user_id = bs.user_id AND ps.ship_type_id = bs.ship_type_id
    WHERE ps.quantity > COALESCE(bs.total_built, 0)
      AND NOT EXISTS(SELECT 1 FROM expedition_types et WHERE et.ship_type_id = ps.ship_type_id)
  LOOP
    IF v_record.to_remove > 0 THEN
      v_remove_quantity := LEAST(v_record.to_remove, v_record.current_qty);
      
      IF NOT p_dry_run THEN
        -- Actually remove the fraudulent ships
        UPDATE planet_ships 
        SET quantity = GREATEST(0, quantity - v_remove_quantity)
        WHERE id = v_record.planet_ship_id;
        
        -- Send notification to the user
        INSERT INTO messages (sender_id, recipient_id, subject, body, message_type)
        VALUES (NULL, v_record.user_id, 
          'Correccion de Datos',
          format('Se han detectado y corregido %s %s que no tenian registro de construccion valido.', 
            v_remove_quantity, v_record.ship_name),
          'system');
      END IF;
      
      v_cleaned_count := v_cleaned_count + 1;
      v_cleaned_details := v_cleaned_details || jsonb_build_object(
        'username', v_record.username,
        'ship_name', v_record.ship_name,
        'removed', v_remove_quantity,
        'had', v_record.current_qty,
        'should_have', v_record.built_qty
      );
    END IF;
  END LOOP;

  -- Recalculate points for affected users if not dry run
  IF NOT p_dry_run THEN
    PERFORM update_user_points(DISTINCT (detail->>'user_id')::uuid)
    FROM jsonb_array_elements(v_cleaned_details) detail
    WHERE detail->>'user_id' IS NOT NULL;
  END IF;

  RETURN jsonb_build_object(
    'dry_run', p_dry_run,
    'items_cleaned', v_cleaned_count,
    'details', v_cleaned_details
  );
END;
$$;

-- Grant execute to authenticated users (function checks admin internally)
GRANT EXECUTE ON FUNCTION admin_audit_suspicious_ships() TO authenticated;
GRANT EXECUTE ON FUNCTION admin_clean_fraudulent_ships(boolean) TO authenticated;
