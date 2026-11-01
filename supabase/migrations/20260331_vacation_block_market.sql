-- ============================================================
-- Vacation Mode: Block Market + Auto-Cancel Active Listings
--
-- 1. create_market_listing: Block if user in vacation mode
-- 2. purchase_market_listing: Already blocked (previous migration)
-- 3. toggle_vacation_mode: Cancel all active listings + buy offers
--    when enabling vacation mode
-- ============================================================

-- 1. Update toggle_vacation_mode to cancel market listings and buy offers
CREATE OR REPLACE FUNCTION public.toggle_vacation_mode(p_enable boolean)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid;
  v_current_vacation_mode boolean;
  v_vacation_enabled_at timestamptz;
  v_hours_elapsed numeric;
  v_incoming_attacks integer;
  v_min_vacation_hours constant integer := 48;
  v_bq RECORD;
  v_sq RECORD;
  v_remaining_seconds integer;
  v_research_remaining integer;
  v_cancelled_listings integer;
  v_cancelled_buy_offers integer;
  v_refunded_fxu numeric := 0;
BEGIN
  PERFORM set_config('app.allow_vacation_update', 'true', true);

  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  SELECT vacation_mode, vacation_mode_enabled_at
  INTO v_current_vacation_mode, v_vacation_enabled_at
  FROM profiles WHERE id = v_user_id;

  -- ========== ENABLE VACATION MODE ==========
  IF p_enable = true THEN
    IF COALESCE(v_current_vacation_mode, false) = true THEN
      RETURN jsonb_build_object('success', false, 'error', 'Vacation mode is already active');
    END IF;

    SELECT COUNT(*) INTO v_incoming_attacks
    FROM check_incoming_hostile_fleets(v_user_id);

    IF v_incoming_attacks > 0 THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'Cannot enable vacation mode while hostile fleets are incoming',
        'incoming_attacks', v_incoming_attacks
      );
    END IF;

    IF EXISTS (
      SELECT 1 FROM fleets
      WHERE user_id = v_user_id
        AND mission_type IN ('attack', 'destroy', 'espionage')
        AND is_completed = false
    ) THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'Cannot enable vacation mode while you have active hostile missions'
      );
    END IF;

    -- Calculate remaining research time before pausing
    v_research_remaining := 0;
    SELECT GREATEST(1, EXTRACT(EPOCH FROM (research_end_time - now()))::integer)
    INTO v_research_remaining
    FROM user_technologies
    WHERE user_id = v_user_id AND is_researching = true
      AND research_end_time IS NOT NULL AND research_end_time > now();

    -- Activate vacation and store research remaining time
    UPDATE profiles
    SET vacation_mode = true,
        vacation_mode_enabled_at = now(),
        vacation_remaining_research_seconds = COALESCE(v_research_remaining, 0)
    WHERE id = v_user_id;

    -- Freeze resource timestamps
    UPDATE planet_resources pr
    SET last_update = now()
    FROM planets p
    WHERE pr.planet_id = p.id AND p.user_id = v_user_id;

    -- Pause active building queues
    FOR v_bq IN
      SELECT bq.id, bq.end_time
      FROM building_queue bq
      JOIN planets p ON bq.planet_id = p.id
      WHERE p.user_id = v_user_id
        AND bq.start_time IS NOT NULL AND bq.end_time IS NOT NULL
        AND bq.end_time > now()
    LOOP
      v_remaining_seconds := GREATEST(1, EXTRACT(EPOCH FROM (v_bq.end_time - now()))::integer);
      UPDATE building_queue
      SET end_time = NULL, start_time = NULL, build_time = v_remaining_seconds
      WHERE id = v_bq.id;
    END LOOP;

    -- Pause active shipyard queues
    FOR v_sq IN
      SELECT sq.id, sq.current_unit_end_time
      FROM shipyard_queue sq
      JOIN planets p ON sq.planet_id = p.id
      WHERE p.user_id = v_user_id
        AND sq.start_time IS NOT NULL AND sq.current_unit_end_time IS NOT NULL
        AND sq.current_unit_end_time > now()
    LOOP
      v_remaining_seconds := GREATEST(1, EXTRACT(EPOCH FROM (v_sq.current_unit_end_time - now()))::integer);
      UPDATE shipyard_queue
      SET current_unit_end_time = NULL, start_time = NULL, build_time_per_unit = v_remaining_seconds
      WHERE id = v_sq.id;
    END LOOP;

    -- Pause active research
    UPDATE user_technologies
    SET research_end_time = NULL, research_start_time = NULL
    WHERE user_id = v_user_id AND is_researching = true AND research_end_time IS NOT NULL;

    -- ===== AUTO-CANCEL ALL ACTIVE MARKET LISTINGS =====
    WITH cancelled AS (
      UPDATE market_listings
      SET status = 'cancelled', updated_at = now()
      WHERE seller_id = v_user_id AND status = 'active'
      RETURNING id
    )
    SELECT COUNT(*) INTO v_cancelled_listings FROM cancelled;

    -- ===== AUTO-CANCEL ALL ACTIVE BUY OFFERS + REFUND FXU =====
    PERFORM _internal_set_fxu_context();
    WITH cancelled_offers AS (
      UPDATE buy_offers
      SET status = 'cancelled', updated_at = now()
      WHERE buyer_id = v_user_id AND status = 'active'
      RETURNING id, (price_per_unit * (quantity - quantity_filled)) as refund_amount
    )
    SELECT COUNT(*), COALESCE(SUM(refund_amount), 0)
    INTO v_cancelled_buy_offers, v_refunded_fxu
    FROM cancelled_offers;

    -- Refund FXU from cancelled buy offers
    IF v_refunded_fxu > 0 THEN
      UPDATE profiles SET fxu_balance = fxu_balance + v_refunded_fxu WHERE id = v_user_id;
    END IF;

    RETURN jsonb_build_object(
      'success', true,
      'message', 'Vacation mode enabled',
      'minimum_duration_hours', v_min_vacation_hours,
      'can_disable_at', (now() + (v_min_vacation_hours || ' hours')::interval),
      'market_listings_cancelled', v_cancelled_listings,
      'buy_offers_cancelled', v_cancelled_buy_offers,
      'fxu_refunded', ROUND(v_refunded_fxu, 2)
    );

  -- ========== DISABLE VACATION MODE ==========
  ELSE
    IF COALESCE(v_current_vacation_mode, false) = false THEN
      RETURN jsonb_build_object('success', false, 'error', 'Vacation mode is not active');
    END IF;

    IF v_vacation_enabled_at IS NOT NULL THEN
      v_hours_elapsed := EXTRACT(EPOCH FROM (now() - v_vacation_enabled_at)) / 3600;

      IF v_hours_elapsed < v_min_vacation_hours THEN
        RETURN jsonb_build_object(
          'success', false,
          'error', format('Minimum vacation duration is %s hours. %s hours remaining.',
            v_min_vacation_hours,
            ROUND((v_min_vacation_hours - v_hours_elapsed)::numeric, 1)),
          'hours_elapsed', ROUND(v_hours_elapsed::numeric, 1),
          'hours_remaining', ROUND((v_min_vacation_hours - v_hours_elapsed)::numeric, 1)
        );
      END IF;
    END IF;

    -- Get stored research remaining time
    SELECT COALESCE(vacation_remaining_research_seconds, 0)
    INTO v_research_remaining FROM profiles WHERE id = v_user_id;

    -- Deactivate vacation
    UPDATE profiles
    SET vacation_mode = false,
        vacation_mode_enabled_at = NULL,
        vacation_remaining_research_seconds = 0
    WHERE id = v_user_id;

    -- Reset resource timestamps
    UPDATE planet_resources pr
    SET last_update = now()
    FROM planets p
    WHERE pr.planet_id = p.id AND p.user_id = v_user_id;

    -- Resume paused building queues
    FOR v_bq IN
      SELECT bq.id, bq.build_time, bq.planet_id
      FROM building_queue bq
      JOIN planets p ON bq.planet_id = p.id
      WHERE p.user_id = v_user_id
        AND bq.start_time IS NULL AND bq.end_time IS NULL
        AND bq.queue_position = (
          SELECT MIN(bq2.queue_position) FROM building_queue bq2 WHERE bq2.planet_id = bq.planet_id
        )
    LOOP
      UPDATE building_queue
      SET start_time = now(), end_time = now() + (v_bq.build_time || ' seconds')::interval
      WHERE id = v_bq.id;
    END LOOP;

    -- Resume paused shipyard queues
    FOR v_sq IN
      SELECT sq.id, sq.build_time_per_unit, sq.planet_id
      FROM shipyard_queue sq
      JOIN planets p ON sq.planet_id = p.id
      WHERE p.user_id = v_user_id
        AND sq.start_time IS NULL AND sq.current_unit_end_time IS NULL
        AND sq.queue_position = (
          SELECT MIN(sq2.queue_position) FROM shipyard_queue sq2 WHERE sq2.planet_id = sq.planet_id
        )
    LOOP
      UPDATE shipyard_queue
      SET start_time = now(), current_unit_end_time = now() + (v_sq.build_time_per_unit || ' seconds')::interval
      WHERE id = v_sq.id;
    END LOOP;

    -- Resume paused research
    IF v_research_remaining > 0 THEN
      UPDATE user_technologies
      SET research_start_time = now(),
          research_end_time = now() + (v_research_remaining || ' seconds')::interval
      WHERE user_id = v_user_id AND is_researching = true AND research_end_time IS NULL;
    END IF;

    RETURN jsonb_build_object('success', true, 'message', 'Vacation mode disabled');
  END IF;
END;
$function$;
