/*
  # Fix expedition FXU fee enforcement

  1. Problem
    - `charge_expedition_fee` was overwritten to always return free (fee=0)
    - Players could send unlimited expeditions without paying FXU after the first one

  2. Changes
    - Restores `charge_expedition_fee` to enforce FXU payment starting from the 2nd expedition
    - First expedition is always FREE
    - 2nd and subsequent expeditions cost the configured `expedition_extra_fee_fxu` (currently 1000 FXU)
    - Adds astrophysics-based expedition slot limit: max = floor(sqrt(astrophysics_level)), minimum 1
    - Uses FXU protection bypass context for secure balance updates
    - Records revenue for admin

  3. Security
    - FXU context flag set before balance updates
    - Revenue tracked in admin_revenue table
*/

CREATE OR REPLACE FUNCTION charge_expedition_fee(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_active_expeditions integer;
  v_fee numeric;
  v_user_fxu numeric;
  v_admin_id uuid;
  v_astrophysics_level integer;
  v_max_expeditions integer;
BEGIN
  SELECT COALESCE(ut.level, 0) INTO v_astrophysics_level
  FROM user_technologies ut
  JOIN technology_types tt ON ut.technology_type_id = tt.id
  WHERE ut.user_id = p_user_id AND tt.code = 'astrophysics';

  v_astrophysics_level := COALESCE(v_astrophysics_level, 0);

  IF v_astrophysics_level < 1 THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Necesitas investigar Astrofisica para enviar expediciones'
    );
  END IF;

  v_max_expeditions := GREATEST(1, FLOOR(SQRT(v_astrophysics_level::numeric)));

  v_active_expeditions := get_active_expedition_count(p_user_id);

  IF v_active_expeditions >= v_max_expeditions THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', format('Has alcanzado el maximo de expediciones simultaneas (%s). Investiga Astrofisica para desbloquear mas.', v_max_expeditions),
      'required_fee', 0,
      'current_balance', 0
    );
  END IF;

  IF v_active_expeditions = 0 THEN
    RETURN jsonb_build_object(
      'success', true,
      'charged', false,
      'fee', 0,
      'expedition_number', 1,
      'message', 'Primera expedicion - gratis'
    );
  END IF;

  v_fee := get_expedition_extra_fee();

  IF v_fee <= 0 THEN
    RETURN jsonb_build_object(
      'success', true,
      'charged', false,
      'fee', 0,
      'expedition_number', v_active_expeditions + 1,
      'message', 'Expedicion gratuita (fee configurado en 0)'
    );
  END IF;

  SELECT COALESCE(fxu_balance, 0) INTO v_user_fxu
  FROM profiles
  WHERE id = p_user_id
  FOR UPDATE;

  IF v_user_fxu < v_fee THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', format('Necesitas %s FXU para enviar una expedicion adicional. Tienes: %s FXU',
                      v_fee::text, COALESCE(v_user_fxu, 0)::text),
      'required_fee', v_fee,
      'current_balance', COALESCE(v_user_fxu, 0)
    );
  END IF;

  PERFORM set_config('fxu.allow_update_9x7k2m', 'true', true);

  UPDATE profiles
  SET fxu_balance = fxu_balance - v_fee
  WHERE id = p_user_id;

  v_admin_id := get_admin_account_id();
  IF v_admin_id IS NOT NULL THEN
    UPDATE profiles SET fxu_balance = fxu_balance + v_fee WHERE id = v_admin_id;

    INSERT INTO admin_revenue (revenue_type, amount, description, user_id)
    VALUES ('expedition_fee', v_fee, 'Fee por expedicion extra #' || (v_active_expeditions + 1)::text, p_user_id);
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'charged', true,
    'fee', v_fee,
    'expedition_number', v_active_expeditions + 1,
    'message', format('Expedicion #%s - Cobrado %s FXU', (v_active_expeditions + 1)::text, v_fee::text)
  );
END;
$$;