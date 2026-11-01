-- =====================================================================
-- VIP manual desde el panel de admin (Gestion de Usuarios)
-- NO toca purchase_plus_subscription: la compra normal sigue igual.
-- Solo inserta / desactiva filas en plus_subscriptions, que es la misma
-- tabla que ya consulta is_user_plus() / useIsUserPlus / get_plus_status.
-- amount_paid = 0 => no genera ingresos ni comisiones de referido.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.admin_set_user_plus(
  p_user_id uuid,
  p_enabled boolean,
  p_plan_code text DEFAULT 'plus_monthly'
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_admin boolean;
  v_plan plus_plans%ROWTYPE;
  v_expires timestamptz;
BEGIN
  SELECT is_admin INTO v_admin FROM profiles WHERE id = auth.uid();
  IF NOT COALESCE(v_admin, false) THEN
    RETURN json_build_object('success', false, 'error', 'No autorizado');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = p_user_id) THEN
    RETURN json_build_object('success', false, 'error', 'Usuario no encontrado');
  END IF;

  IF p_enabled THEN
    SELECT * INTO v_plan FROM plus_plans WHERE code = p_plan_code AND is_active = true;
    IF v_plan.id IS NULL THEN
      RETURN json_build_object('success', false, 'error', 'Plan no encontrado o inactivo: ' || p_plan_code);
    END IF;

    IF EXISTS (
      SELECT 1 FROM plus_subscriptions
      WHERE user_id = p_user_id AND is_active = true AND expires_at > now()
    ) THEN
      RETURN json_build_object('success', false, 'error', 'El usuario ya tiene VIP activo');
    END IF;

    IF COALESCE(v_plan.duration_days, 0) > 0 THEN
      v_expires := now() + (v_plan.duration_days || ' days')::interval;
    ELSE
      v_expires := now() + (v_plan.duration_months || ' months')::interval;
    END IF;

    INSERT INTO plus_subscriptions (
      user_id, plan_id, payment_type, amount_paid, expires_at,
      commission_share_percent, reward_calculated, pending_reward_amount
    ) VALUES (
      p_user_id, v_plan.id, 'fxu', 0, v_expires,
      v_plan.commission_share_percent, true, 0
    );

    RETURN json_build_object(
      'success', true,
      'enabled', true,
      'plan', v_plan.name,
      'expires_at', v_expires
    );
  ELSE
    UPDATE plus_subscriptions
       SET is_active = false
     WHERE user_id = p_user_id
       AND is_active = true;

    RETURN json_build_object('success', true, 'enabled', false);
  END IF;
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_set_user_plus(uuid, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_user_plus(uuid, boolean, text) TO authenticated, service_role;
