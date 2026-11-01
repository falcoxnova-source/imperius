/*
  # Fix admin_purge_inactive_account - Use only existing tables

  ## Summary
  Remove references to non-existent tables:
  - telegram_user_tasks (doesn't exist)
  - supply_box_claims (doesn't exist)
  
  Add telegram_links cleanup which does exist.
*/

CREATE OR REPLACE FUNCTION admin_purge_inactive_account(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin_id uuid;
  v_is_admin boolean;
  v_target_profile record;
  v_days_inactive int;
  v_hours_played numeric;
  v_category text;
  v_planet_count int;
  v_deleted_data jsonb;
BEGIN
  v_admin_id := auth.uid();
  
  IF v_admin_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No autenticado');
  END IF;
  
  SELECT is_admin INTO v_is_admin FROM profiles WHERE id = v_admin_id;
  IF NOT COALESCE(v_is_admin, false) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Acceso denegado');
  END IF;
  
  SELECT * INTO v_target_profile FROM profiles WHERE id = p_user_id;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Usuario no encontrado');
  END IF;
  
  IF COALESCE(v_target_profile.is_admin, false) THEN
    RETURN jsonb_build_object('success', false, 'error', 'No se puede eliminar una cuenta de administrador');
  END IF;
  
  v_days_inactive := EXTRACT(DAY FROM (now() - COALESCE(v_target_profile.last_activity, v_target_profile.created_at)))::int;
  v_hours_played := ROUND(EXTRACT(EPOCH FROM (COALESCE(v_target_profile.last_activity, v_target_profile.created_at) - v_target_profile.created_at)) / 3600.0, 2);
  
  IF v_target_profile.last_activity IS NULL 
     OR v_target_profile.last_activity = v_target_profile.created_at
     OR EXTRACT(EPOCH FROM (v_target_profile.last_activity - v_target_profile.created_at)) < 3600 THEN
    v_category := 'never_played';
  ELSIF EXTRACT(EPOCH FROM (v_target_profile.last_activity - v_target_profile.created_at)) < 86400 THEN
    v_category := 'first_day_only';
  ELSE
    v_category := 'abandoned';
  END IF;

  SELECT COUNT(*)::int INTO v_planet_count FROM planets WHERE user_id = p_user_id;

  DELETE FROM alliance_members WHERE user_id = p_user_id;
  DELETE FROM alliance_applications WHERE user_id = p_user_id;
  
  UPDATE fleets 
  SET is_completed = true
  WHERE user_id = p_user_id AND is_completed = false;
  
  DELETE FROM messages WHERE sender_id = p_user_id OR recipient_id = p_user_id;
  DELETE FROM user_officers WHERE user_id = p_user_id;
  DELETE FROM market_listings WHERE seller_id = p_user_id;
  DELETE FROM research_queue WHERE user_id = p_user_id;
  
  DELETE FROM building_queue WHERE planet_id IN (SELECT id FROM planets WHERE user_id = p_user_id);
  DELETE FROM shipyard_queue WHERE planet_id IN (SELECT id FROM planets WHERE user_id = p_user_id);
  
  DELETE FROM fleets WHERE user_id = p_user_id;
  DELETE FROM planets WHERE user_id = p_user_id;
  DELETE FROM user_technologies WHERE user_id = p_user_id;
  DELETE FROM wallet_transactions WHERE user_id = p_user_id;
  DELETE FROM login_sessions WHERE user_id = p_user_id;
  
  DELETE FROM telegram_links WHERE user_id = p_user_id;
  DELETE FROM plus_subscriptions WHERE user_id = p_user_id;
  DELETE FROM public_chat_messages WHERE user_id = p_user_id;

  v_deleted_data := jsonb_build_object(
    'planets_deleted', v_planet_count,
    'fxu_balance', COALESCE(v_target_profile.fxu_balance, 0),
    'usdt_balance', COALESCE(v_target_profile.usdt_balance, 0),
    'points_total', COALESCE(v_target_profile.points_total, 0)
  );

  INSERT INTO admin_account_deletions (
    deleted_user_id,
    deleted_username,
    deleted_email,
    deletion_category,
    days_inactive,
    points_total,
    deleted_by,
    metadata
  ) VALUES (
    p_user_id,
    v_target_profile.username,
    v_target_profile.email,
    v_category,
    v_days_inactive,
    COALESCE(v_target_profile.points_total, 0),
    v_admin_id,
    v_deleted_data
  );
  
  DELETE FROM profiles WHERE id = p_user_id;
  
  DELETE FROM auth.users WHERE id = p_user_id;
  
  RETURN jsonb_build_object(
    'success', true, 
    'message', 'Cuenta eliminada completamente: ' || v_target_profile.username,
    'details', jsonb_build_object(
      'username', v_target_profile.username,
      'email', v_target_profile.email,
      'category', v_category,
      'days_inactive', v_days_inactive,
      'hours_played', v_hours_played,
      'planets_deleted', v_planet_count,
      'fxu_balance', COALESCE(v_target_profile.fxu_balance, 0),
      'usdt_balance', COALESCE(v_target_profile.usdt_balance, 0)
    )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION admin_purge_inactive_account(uuid) TO authenticated;