-- =====================================================================
-- Fix: Stuck shipyard items blocking queue processor
-- 1. Delete stuck items that can't complete (shield domes where user already has 1)
-- 2. Make queue processor skip errors instead of stopping
-- =====================================================================

-- STEP 1: Delete stuck queue items and refund resources
DO $$
DECLARE
  v_item RECORD;
  v_planet_resources planet_resources%ROWTYPE;
BEGIN
  FOR v_item IN
    SELECT sq.*, pl.user_id, 
           COALESCE(SUM(pd.quantity) FILTER (WHERE sq.defense_type_id IN (7,8)), 0) as existing_account_domes
    FROM shipyard_queue sq
    JOIN planets pl ON pl.id = sq.planet_id
    LEFT JOIN planet_defenses pd ON pd.defense_type_id = sq.defense_type_id 
      AND pd.planet_id IN (SELECT id FROM planets WHERE user_id = pl.user_id)
      AND pd.quantity > 0
    WHERE sq.current_unit_end_time <= now()
      AND sq.quantity > sq.quantity_completed
      AND sq.defense_type_id IN (7, 8)
    GROUP BY sq.id, pl.user_id
  LOOP
    -- If user already has a dome of this type, delete and refund unused portion
    IF v_item.existing_account_domes >= 1 THEN
      -- Calculate remaining quantity and refund proportional resources
      DECLARE
        v_remaining integer := v_item.quantity - v_item.quantity_completed;
        v_metal_refund bigint := (v_item.metal_cost * v_remaining / GREATEST(1, v_item.quantity));
        v_crystal_refund bigint := (v_item.crystal_cost * v_remaining / GREATEST(1, v_item.quantity));
        v_deuterium_refund bigint := (v_item.deuterium_cost * v_remaining / GREATEST(1, v_item.quantity));
      BEGIN
        UPDATE planet_resources
        SET metal = metal + v_metal_refund,
            crystal = crystal + v_crystal_refund,
            deuterium = deuterium + v_deuterium_refund
        WHERE planet_id = v_item.planet_id;
        
        DELETE FROM shipyard_queue WHERE id = v_item.id;
        
        RAISE NOTICE 'Removed stuck dome % for user % (refunded metal:%, crystal:%, deut:%)', 
          v_item.defense_type_id, v_item.user_id, v_metal_refund, v_crystal_refund, v_deuterium_refund;
      END;
    END IF;
  END LOOP;
END;
$$;

-- STEP 2: Also clean up the lingering Lanzamisiles (defense 1) stuck for 742h
DELETE FROM shipyard_queue 
WHERE defense_type_id = 1 
  AND current_unit_end_time <= now() - interval '30 days'
  AND quantity > quantity_completed;

-- STEP 3: Fix queue processor to skip errors (add exception handling)
CREATE OR REPLACE FUNCTION process_next_shipyard_unit(p_planet_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_queue_item RECORD;
  v_ship_type ship_types%ROWTYPE;
  v_defense_type defense_types%ROWTYPE;
  v_existing integer;
BEGIN
  -- Get the first pending/building item for this planet
  SELECT * INTO v_queue_item
  FROM shipyard_queue
  WHERE planet_id = p_planet_id
    AND quantity > quantity_completed
  ORDER BY queue_position ASC
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND THEN RETURN; END IF;

  BEGIN
    IF v_queue_item.item_type = 'ship' THEN
      SELECT * INTO v_ship_type FROM ship_types WHERE id = v_queue_item.ship_type_id;
      
      INSERT INTO planet_ships (planet_id, ship_type_id, quantity)
      VALUES (p_planet_id, v_queue_item.ship_type_id, 1)
      ON CONFLICT (planet_id, ship_type_id)
      DO UPDATE SET quantity = planet_ships.quantity + 1;

    ELSIF v_queue_item.item_type = 'defense' THEN
      SELECT * INTO v_defense_type FROM defense_types WHERE id = v_queue_item.defense_type_id;
      
      INSERT INTO planet_defenses (planet_id, defense_type_id, quantity)
      VALUES (p_planet_id, v_queue_item.defense_type_id, 1)
      ON CONFLICT (planet_id, defense_type_id)
      DO UPDATE SET quantity = planet_defenses.quantity + 1;
    END IF;

    UPDATE shipyard_queue
    SET quantity_completed = quantity_completed + 1,
        current_unit_end_time = CASE 
          WHEN quantity_completed + 1 >= quantity THEN NULL 
          ELSE now() + (build_time_per_unit || ' seconds')::interval 
        END,
        start_time = now()
    WHERE id = v_queue_item.id;

  EXCEPTION WHEN OTHERS THEN
    -- Log the error and move on to next item
    RAISE WARNING 'Shipyard queue item % failed: %', v_queue_item.id, SQLERRM;
    
    -- Mark as failed by completing the remaining quantity
    UPDATE shipyard_queue
    SET quantity_completed = quantity
    WHERE id = v_queue_item.id;
  END;
END;
$$;
