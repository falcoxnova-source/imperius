CREATE OR REPLACE FUNCTION public.secure_cancel_shipyard_queue_item(p_queue_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  v_bp_id bigint;
  v_refund_blueprints integer;
BEGIN
  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  SELECT * INTO v_queue_item
  FROM shipyard_queue
  WHERE id = p_queue_id
  FOR UPDATE;

  IF v_queue_item IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Queue item not found');
  END IF;

  SELECT * INTO v_planet
  FROM planets
  WHERE id = v_queue_item.planet_id AND user_id = v_user_id;

  IF v_planet IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Planet not owned by user');
  END IF;

  v_is_first := v_queue_item.queue_position = 1;

  v_remaining_quantity := v_queue_item.quantity - COALESCE(v_queue_item.quantity_completed, 0);

  IF v_remaining_quantity <= 0 THEN
    DELETE FROM shipyard_queue WHERE id = p_queue_id;
    RETURN jsonb_build_object(
      'success', true,
      'refunded_metal', 0,
      'refunded_crystal', 0,
      'refunded_deuterium', 0,
      'message', 'All units already completed'
    );
  END IF;

  v_unit_metal := v_queue_item.metal_cost / NULLIF(v_queue_item.quantity, 0);
  v_unit_crystal := v_queue_item.crystal_cost / NULLIF(v_queue_item.quantity, 0);
  v_unit_deuterium := v_queue_item.deuterium_cost / NULLIF(v_queue_item.quantity, 0);

  v_refund_metal := FLOOR(COALESCE(v_unit_metal, 0) * v_remaining_quantity);
  v_refund_crystal := FLOOR(COALESCE(v_unit_crystal, 0) * v_remaining_quantity);
  v_refund_deuterium := FLOOR(COALESCE(v_unit_deuterium, 0) * v_remaining_quantity);

  UPDATE planet_resources
  SET
    metal = metal + v_refund_metal,
    crystal = crystal + v_refund_crystal,
    deuterium = deuterium + v_refund_deuterium,
    last_update = now()
  WHERE planet_id = v_queue_item.planet_id;

  -- CONSUMIBLE: reembolsar planos de las unidades NO construidas (nave o defensa)
  v_refund_blueprints := 0;
  IF COALESCE(v_queue_item.blueprints_used, 0) > 0 THEN
    v_refund_blueprints := LEAST(v_queue_item.blueprints_used, v_remaining_quantity);
    IF v_refund_blueprints > 0 THEN
      v_bp_id := NULL;
      IF v_queue_item.ship_type_id IS NOT NULL THEN
        SELECT sb.id INTO v_bp_id
        FROM ship_blueprints sb
        WHERE sb.ship_type_id = v_queue_item.ship_type_id AND sb.is_active = true
        LIMIT 1;
      ELSIF v_queue_item.defense_type_id IS NOT NULL THEN
        SELECT sb.id INTO v_bp_id
        FROM ship_blueprints sb
        WHERE sb.defense_type_id = v_queue_item.defense_type_id AND sb.is_active = true
        LIMIT 1;
      END IF;

      IF v_bp_id IS NOT NULL THEN
        INSERT INTO user_ship_blueprints (user_id, blueprint_id, source, metadata)
        SELECT v_user_id, v_bp_id, 'shop',
               jsonb_build_object('refunded_from_cancel', true)
        FROM generate_series(1, v_refund_blueprints);
      END IF;
    END IF;
  END IF;

  DELETE FROM shipyard_queue WHERE id = p_queue_id;

  IF v_is_first THEN
    SELECT * INTO v_next_item
    FROM shipyard_queue
    WHERE planet_id = v_queue_item.planet_id AND item_type = v_queue_item.item_type AND queue_position = 2
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

  WITH reordered AS (
    SELECT id, ROW_NUMBER() OVER (PARTITION BY item_type ORDER BY queue_position) as new_pos
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
    'refunded_blueprints', v_refund_blueprints,
    'units_cancelled', v_remaining_quantity,
    'units_completed', COALESCE(v_queue_item.quantity_completed, 0)
  );
END;
$function$

