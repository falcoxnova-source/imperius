/*
  # Auto-Cancel Insufficient Market Listings
  
  ## Summary
  When a user spends resources (building, research, ships, fleet), this system
  automatically cancels their active market listings if they no longer have
  enough resources to fulfill the sale.
  
  ## Changes
  
  ### 1. New Function: auto_cancel_insufficient_listings
  - Called after any resource-consuming operation
  - Checks all active listings for the planet
  - Cancels listings where the seller no longer has enough resources/ships
  - Sends notification to the seller about cancelled listings
  
  ### 2. Integration Points
  - Building queue (when construction starts)
  - Shipyard queue (when ship construction starts)
  - Research queue (when research starts)
  - Fleet dispatch (when resources are loaded or fuel consumed)
  
  ## Security
  - Function is SECURITY DEFINER to access necessary tables
  - Only cancels listings owned by the planet owner
  
  ## Important Notes
  - Dark matter listings are not affected (stored in profile, not planet)
  - Partial cancellation is not supported - entire listing is cancelled
  - User receives a notification for each cancelled listing
*/

-- Function to auto-cancel listings when resources are insufficient
CREATE OR REPLACE FUNCTION auto_cancel_insufficient_listings(p_planet_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_planet_owner uuid;
  v_resources RECORD;
  v_listing RECORD;
  v_ship_qty integer;
  v_total_listed bigint;
  v_cancelled_count integer := 0;
BEGIN
  -- Get planet owner
  SELECT user_id INTO v_planet_owner FROM planets WHERE id = p_planet_id;
  IF v_planet_owner IS NULL THEN
    RETURN;
  END IF;

  -- Get current resources
  SELECT metal, crystal, deuterium INTO v_resources
  FROM planet_resources WHERE planet_id = p_planet_id;
  
  IF v_resources IS NULL THEN
    RETURN;
  END IF;

  -- Check and cancel resource listings that exceed available resources
  -- We need to consider ALL active listings for this resource type and cancel from newest first
  
  -- Metal listings
  FOR v_listing IN 
    SELECT id, quantity, item_code
    FROM market_listings 
    WHERE planet_id = p_planet_id 
    AND status = 'active' 
    AND listing_type = 'resource'
    AND item_code = 'metal'
    ORDER BY created_at DESC
  LOOP
    -- Calculate total metal listed (excluding current listing)
    SELECT COALESCE(SUM(quantity), 0) INTO v_total_listed
    FROM market_listings
    WHERE planet_id = p_planet_id
    AND status = 'active'
    AND listing_type = 'resource'
    AND item_code = 'metal'
    AND id != v_listing.id;
    
    -- If this listing + others exceeds available, cancel this one
    IF (v_total_listed + v_listing.quantity) > v_resources.metal THEN
      UPDATE market_listings SET status = 'cancelled', updated_at = now() WHERE id = v_listing.id;
      v_cancelled_count := v_cancelled_count + 1;
      
      -- Send notification
      INSERT INTO messages (recipient_id, sender_id, subject, body, message_type)
      VALUES (
        v_planet_owner,
        v_planet_owner,
        'Venta cancelada automaticamente',
        'Tu venta de ' || v_listing.quantity || ' metal fue cancelada porque ya no tienes suficientes recursos.',
        'system'
      );
    END IF;
  END LOOP;

  -- Crystal listings
  FOR v_listing IN 
    SELECT id, quantity, item_code
    FROM market_listings 
    WHERE planet_id = p_planet_id 
    AND status = 'active' 
    AND listing_type = 'resource'
    AND item_code = 'crystal'
    ORDER BY created_at DESC
  LOOP
    SELECT COALESCE(SUM(quantity), 0) INTO v_total_listed
    FROM market_listings
    WHERE planet_id = p_planet_id
    AND status = 'active'
    AND listing_type = 'resource'
    AND item_code = 'crystal'
    AND id != v_listing.id;
    
    IF (v_total_listed + v_listing.quantity) > v_resources.crystal THEN
      UPDATE market_listings SET status = 'cancelled', updated_at = now() WHERE id = v_listing.id;
      v_cancelled_count := v_cancelled_count + 1;
      
      INSERT INTO messages (recipient_id, sender_id, subject, body, message_type)
      VALUES (
        v_planet_owner,
        v_planet_owner,
        'Venta cancelada automaticamente',
        'Tu venta de ' || v_listing.quantity || ' cristal fue cancelada porque ya no tienes suficientes recursos.',
        'system'
      );
    END IF;
  END LOOP;

  -- Deuterium listings
  FOR v_listing IN 
    SELECT id, quantity, item_code
    FROM market_listings 
    WHERE planet_id = p_planet_id 
    AND status = 'active' 
    AND listing_type = 'resource'
    AND item_code = 'deuterium'
    ORDER BY created_at DESC
  LOOP
    SELECT COALESCE(SUM(quantity), 0) INTO v_total_listed
    FROM market_listings
    WHERE planet_id = p_planet_id
    AND status = 'active'
    AND listing_type = 'resource'
    AND item_code = 'deuterium'
    AND id != v_listing.id;
    
    IF (v_total_listed + v_listing.quantity) > v_resources.deuterium THEN
      UPDATE market_listings SET status = 'cancelled', updated_at = now() WHERE id = v_listing.id;
      v_cancelled_count := v_cancelled_count + 1;
      
      INSERT INTO messages (recipient_id, sender_id, subject, body, message_type)
      VALUES (
        v_planet_owner,
        v_planet_owner,
        'Venta cancelada automaticamente',
        'Tu venta de ' || v_listing.quantity || ' deuterio fue cancelada porque ya no tienes suficientes recursos.',
        'system'
      );
    END IF;
  END LOOP;

  -- Ship listings
  FOR v_listing IN 
    SELECT ml.id, ml.quantity, ml.item_code, st.id as ship_type_id
    FROM market_listings ml
    JOIN ship_types st ON st.code = ml.item_code
    WHERE ml.planet_id = p_planet_id 
    AND ml.status = 'active' 
    AND ml.listing_type = 'ship'
    ORDER BY ml.created_at DESC
  LOOP
    -- Get current ship quantity
    SELECT COALESCE(quantity, 0) INTO v_ship_qty
    FROM planet_ships
    WHERE planet_id = p_planet_id AND ship_type_id = v_listing.ship_type_id;
    
    -- Calculate total ships of this type listed (excluding current)
    SELECT COALESCE(SUM(ml.quantity), 0) INTO v_total_listed
    FROM market_listings ml
    JOIN ship_types st ON st.code = ml.item_code
    WHERE ml.planet_id = p_planet_id
    AND ml.status = 'active'
    AND ml.listing_type = 'ship'
    AND st.id = v_listing.ship_type_id
    AND ml.id != v_listing.id;
    
    IF (v_total_listed + v_listing.quantity) > v_ship_qty THEN
      UPDATE market_listings SET status = 'cancelled', updated_at = now() WHERE id = v_listing.id;
      v_cancelled_count := v_cancelled_count + 1;
      
      INSERT INTO messages (recipient_id, sender_id, subject, body, message_type)
      VALUES (
        v_planet_owner,
        v_planet_owner,
        'Venta cancelada automaticamente',
        'Tu venta de ' || v_listing.quantity || ' ' || v_listing.item_code || ' fue cancelada porque ya no tienes suficientes naves.',
        'system'
      );
    END IF;
  END LOOP;
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION auto_cancel_insufficient_listings(uuid) TO authenticated;
