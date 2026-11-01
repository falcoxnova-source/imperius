/*
  # Fix admin_cancel_withdrawal error handling
  
  ## Problem
  The function returns JSON with success: false which causes Supabase to return 400.
  
  ## Solution
  Use RAISE EXCEPTION for actual errors so they're properly caught by the client.
*/

CREATE OR REPLACE FUNCTION public.admin_cancel_withdrawal(p_withdrawal_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid;
  v_is_admin boolean;
  v_withdrawal_id uuid;
  v_withdrawal_status text;
  v_withdrawal_amount numeric;
  v_withdrawal_admin_id uuid;
BEGIN
  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'No autenticado';
  END IF;

  SELECT is_admin INTO v_is_admin
  FROM profiles
  WHERE id = v_user_id;

  IF NOT COALESCE(v_is_admin, false) THEN
    RAISE EXCEPTION 'Solo administradores pueden usar esta funcion';
  END IF;

  SELECT id, status, amount, admin_id 
  INTO v_withdrawal_id, v_withdrawal_status, v_withdrawal_amount, v_withdrawal_admin_id
  FROM admin_withdrawals
  WHERE id = p_withdrawal_id;

  IF v_withdrawal_id IS NULL THEN
    RAISE EXCEPTION 'Retiro no encontrado';
  END IF;

  IF v_withdrawal_admin_id != v_user_id THEN
    RAISE EXCEPTION 'No tienes permiso para cancelar este retiro';
  END IF;

  IF v_withdrawal_status NOT IN ('pending', 'processing', 'failed') THEN
    RAISE EXCEPTION 'Solo se pueden cancelar retiros pendientes, en proceso o fallidos. Estado actual: %', v_withdrawal_status;
  END IF;

  UPDATE admin_withdrawals
  SET status = 'cancelled',
      error_message = 'Cancelado por admin',
      updated_at = now()
  WHERE id = p_withdrawal_id;

  RETURN jsonb_build_object(
    'success', true,
    'cancelled_amount', v_withdrawal_amount,
    'message', 'Retiro cancelado exitosamente'
  );
END;
$function$;
