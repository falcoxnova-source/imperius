/*
  # Funcion segura para cancelar items de shipyard con devolucion de recursos
  
  ## Problema
  La cancelacion de shipyard queue se hacia desde el frontend directamente,
  calculando y actualizando recursos sin validacion del servidor. Esto es
  inseguro y puede ser manipulado.
  
  ## Solucion
  Crear funcion secure_cancel_shipyard_queue_item que:
  1. Valida autenticacion y propiedad
  2. Calcula recursos a devolver basado en unidades no completadas
  3. Devuelve recursos de forma segura
  4. Reordena la cola
*/

CREATE OR REPLACE FUNCTION secure_cancel_shipyard_queue_item(p_queue_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_queue_item record;
  v_planet record;
  v_remaining_quantity integer;
  v_unit_metal numeric;
  v_unit_crystal numeric;
  v_unit_deuterium numeric;
  v_refund_metal numeric;
  v_refund_crystal numeric;
  v_refund_deuterium numeric;
  v_is_first boolean;
  v_next_item record;
BEGIN
  v_user_id := auth.uid();
  
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;
  
  -- Get queue item with lock
  SELECT * INTO v_queue_item 
  FROM shipyard_queue 
  WHERE id = p_queue_id
  FOR UPDATE;
  
  IF v_queue_item IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Queue item not found');
  END IF;
  
  -- Verify ownership via planet
  SELECT * INTO v_planet 
  FROM planets 
  WHERE id = v_queue_item.planet_id AND user_id = v_user_id;
  
  IF v_planet IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Planet not owned by user');
  END IF;
  
  v_is_first := v_queue_item.queue_position = 1;
  
  -- Calculate remaining quantity (units not yet built)
  v_remaining_quantity := v_queue_item.quantity - COALESCE(v_queue_item.quantity_completed, 0);
  
  IF v_remaining_quantity <= 0 THEN
    -- All units completed, just clean up
    DELETE FROM shipyard_queue WHERE id = p_queue_id;
    RETURN jsonb_build_object(
      'success', true,
      'refunded_metal', 0,
      'refunded_crystal', 0,
      'refunded_deuterium', 0,
      'message', 'All units already completed'
    );
  END IF;
  
  -- Calculate cost per unit
  v_unit_metal := v_queue_item.metal_cost / NULLIF(v_queue_item.quantity, 0);
  v_unit_crystal := v_queue_item.crystal_cost / NULLIF(v_queue_item.quantity, 0);
  v_unit_deuterium := v_queue_item.deuterium_cost / NULLIF(v_queue_item.quantity, 0);
  
  -- Calculate refund for remaining units
  v_refund_metal := FLOOR(COALESCE(v_unit_metal, 0) * v_remaining_quantity);
  v_refund_crystal := FLOOR(COALESCE(v_unit_crystal, 0) * v_remaining_quantity);
  v_refund_deuterium := FLOOR(COALESCE(v_unit_deuterium, 0) * v_remaining_quantity);
  
  -- Refund resources to planet
  UPDATE planet_resources
  SET 
    metal = metal + v_refund_metal,
    crystal = crystal + v_refund_crystal,
    deuterium = deuterium + v_refund_deuterium,
    last_update = now()
  WHERE planet_id = v_queue_item.planet_id;
  
  -- Delete the cancelled item
  DELETE FROM shipyard_queue WHERE id = p_queue_id;
  
  -- If we cancelled the first item, activate the new first item
  IF v_is_first THEN
    SELECT * INTO v_next_item
    FROM shipyard_queue
    WHERE planet_id = v_queue_item.planet_id AND queue_position = 2
    LIMIT 1;
    
    IF FOUND THEN
      UPDATE shipyard_queue
      SET 
        queue_position = 1,
        start_time = now(),
        current_unit_end_time = now() + (build_time_per_unit * INTERVAL '1 second')
      WHERE id = v_next_item.id;
    END IF;
  END IF;
  
  -- Reorder remaining queue items
  WITH reordered AS (
    SELECT id, ROW_NUMBER() OVER (ORDER BY queue_position) as new_pos
    FROM shipyard_queue
    WHERE planet_id = v_queue_item.planet_id
  )
  UPDATE shipyard_queue sq
  SET queue_position = r.new_pos
  FROM reordered r
  WHERE sq.id = r.id AND sq.queue_position != r.new_pos;
  
  RETURN jsonb_build_object(
    'success', true,
    'refunded_metal', v_refund_metal,
    'refunded_crystal', v_refund_crystal,
    'refunded_deuterium', v_refund_deuterium,
    'units_cancelled', v_remaining_quantity,
    'units_completed', COALESCE(v_queue_item.quantity_completed, 0)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION secure_cancel_shipyard_queue_item(uuid) TO authenticated;
