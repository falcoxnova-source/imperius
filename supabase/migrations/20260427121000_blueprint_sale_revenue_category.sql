/*
  # Reportar venta de planos como categoría propia ("blueprint_sale")

  Antes: la venta de planos en la tienda oficial registraba en admin_revenue
  con revenue_type = 'other' y descripción 'blueprint_sale: ...'. En el panel
  admin aparecía mezclado dentro de "Otros".

  Ahora:
   - Se añade 'blueprint_sale' al CHECK de admin_revenue.revenue_type.
   - purchase_ship_blueprint registra revenue como 'blueprint_sale'.
   - Se reclasifican (UPDATE) los registros antiguos que estén como 'other'
     con descripción que empiece por 'blueprint_sale' a 'blueprint_sale'.

  Nota: el fee del P2P de planos sigue contabilizándose como 'market_fee'
  (es una comisión del mercado P2P). Esta migración NO toca eso.
*/

-- ============================================================
-- 1) Ampliar CHECK de revenue_type para incluir 'blueprint_sale'
-- ============================================================
ALTER TABLE admin_revenue DROP CONSTRAINT IF EXISTS admin_revenue_revenue_type_check;

ALTER TABLE admin_revenue ADD CONSTRAINT admin_revenue_revenue_type_check
  CHECK (revenue_type = ANY (ARRAY[
    'market_fee', 'withdrawal_fee', 'instant_build', 'instant_research',
    'instant_ship', 'instant_defense', 'referral_bonus', 'officer_fxu',
    'expedition_fee', 'supply_box', 'fleet_acceleration', 'swap_fee',
    'transfer_fee', 'plus_subscription', 'colony_abandon', 'planet_rename',
    'alliance_rename', 'alliance_creation', 'lottery_fee', 'p2p_fee',
    'demolish_fee', 'abandon_colony', 'blueprint_sale', 'other'
  ]));

-- ============================================================
-- 2) Reclasificar registros históricos: 'other' con desc blueprint_sale
-- ============================================================
UPDATE admin_revenue
SET revenue_type = 'blueprint_sale'
WHERE revenue_type = 'other'
  AND description ILIKE 'blueprint_sale%';

-- ============================================================
-- 3) Actualizar purchase_ship_blueprint para usar 'blueprint_sale'
-- ============================================================
CREATE OR REPLACE FUNCTION purchase_ship_blueprint(p_blueprint_code text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_blueprint ship_blueprints%ROWTYPE;
  v_balance numeric;
  v_admin_id uuid;
  v_pool_amount numeric;
  v_admin_amount numeric;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No autenticado');
  END IF;

  SELECT * INTO v_blueprint
  FROM ship_blueprints
  WHERE code = p_blueprint_code AND is_active = true;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Plano no disponible');
  END IF;

  IF EXISTS (
    SELECT 1 FROM user_ship_blueprints
    WHERE user_id = v_user_id AND blueprint_id = v_blueprint.id
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Ya posees este plano');
  END IF;

  SELECT COALESCE(fxu_balance, 0) INTO v_balance
  FROM profiles
  WHERE id = v_user_id
  FOR UPDATE;

  IF v_balance < v_blueprint.price_fxu THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'FXU insuficiente',
      'required', v_blueprint.price_fxu,
      'balance', v_balance
    );
  END IF;

  PERFORM _internal_set_fxu_context();

  -- Cobrar al jugador
  UPDATE profiles
  SET fxu_balance = COALESCE(fxu_balance, 0) - v_blueprint.price_fxu
  WHERE id = v_user_id;

  -- Split 50% admin / 50% pools
  v_pool_amount  := FLOOR(v_blueprint.price_fxu * 0.50);
  v_admin_amount := v_blueprint.price_fxu - v_pool_amount;

  -- 50% al admin (transferencia real de FXU)
  SELECT id INTO v_admin_id
  FROM profiles
  WHERE is_admin = true
  ORDER BY created_at ASC
  LIMIT 1;

  IF v_admin_id IS NOT NULL AND v_admin_id <> v_user_id AND v_admin_amount > 0 THEN
    UPDATE profiles
    SET fxu_balance = COALESCE(fxu_balance, 0) + v_admin_amount
    WHERE id = v_admin_id;
  END IF;

  -- Registrar revenue (50% admin) — ahora con su propia categoría
  PERFORM record_admin_revenue(
    'blueprint_sale',
    v_admin_amount,
    'Venta de plano (50% admin): ' || v_blueprint.code,
    v_user_id,
    NULL
  );

  -- 50% a pools de recompensa
  IF v_pool_amount > 0 THEN
    PERFORM contribute_to_jackpot(v_pool_amount, 'blueprint_sale:' || v_blueprint.code, v_user_id);
  END IF;

  -- Entregar plano
  INSERT INTO user_ship_blueprints (user_id, blueprint_id, source, metadata)
  VALUES (
    v_user_id,
    v_blueprint.id,
    'shop',
    jsonb_build_object(
      'price_fxu', v_blueprint.price_fxu,
      'admin_share', v_admin_amount,
      'pool_share', v_pool_amount
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Plano comprado exitosamente',
    'blueprint_code', v_blueprint.code,
    'cost', v_blueprint.price_fxu,
    'admin_share', v_admin_amount,
    'pool_share', v_pool_amount
  );
END;
$$;

GRANT EXECUTE ON FUNCTION purchase_ship_blueprint(text) TO authenticated;
