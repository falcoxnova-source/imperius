-- Nave Heroe: tabla principal
CREATE TABLE IF NOT EXISTS user_hero_ships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  level integer NOT NULL DEFAULT 1,
  xp integer NOT NULL DEFAULT 0,
  xp_to_next integer NOT NULL DEFAULT 100,
  attack_points integer NOT NULL DEFAULT 0,
  defense_points integer NOT NULL DEFAULT 0,
  shield_points integer NOT NULL DEFAULT 0,
  speed_points integer NOT NULL DEFAULT 0,
  loot_points integer NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id)
);

-- XP requerida por nivel (lineal primeros 20, exponencial despues)
CREATE OR REPLACE FUNCTION hero_xp_for_level(p_level integer)
RETURNS integer
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  IF p_level <= 20 THEN
    RETURN p_level * 100;
  ELSE
    RETURN p_level * p_level * 5;
  END IF;
END;
$$;

-- Crear nave heroe para nuevo usuario
CREATE OR REPLACE FUNCTION create_hero_ship(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO user_hero_ships (user_id, level, xp, xp_to_next)
  VALUES (p_user_id, 1, 0, hero_xp_for_level(1))
  ON CONFLICT (user_id) DO NOTHING;
END;
$$;

-- Obtener nave heroe
CREATE OR REPLACE FUNCTION get_hero_ship(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ship record;
  v_total_points integer;
  v_respec_cost integer;
BEGIN
  -- Auto-create if not exists
  PERFORM create_hero_ship(p_user_id);

  SELECT * INTO v_ship FROM user_hero_ships WHERE user_id = p_user_id;

  v_total_points := (v_ship.level - 1) * 10;
  v_total_points := GREATEST(v_total_points, v_ship.attack_points + v_ship.defense_points + v_ship.shield_points + v_ship.speed_points);

  SELECT COALESCE(
    (SELECT value::integer FROM game_settings WHERE key = 'fxu_hero_respec_cost'),
    10000
  ) INTO v_respec_cost;

  RETURN jsonb_build_object(
    'id', v_ship.id,
    'level', v_ship.level,
    'xp', v_ship.xp,
    'xp_to_next', v_ship.xp_to_next,
    'attack_points', v_ship.attack_points,
    'defense_points', v_ship.defense_points,
    'shield_points', v_ship.shield_points,
    'speed_points', v_ship.speed_points,
    'total_points', v_total_points,
    'free_points', v_total_points - (v_ship.attack_points + v_ship.defense_points + v_ship.shield_points + v_ship.speed_points),
    'respec_cost', v_respec_cost
  );
END;
$$;

-- Anadir XP a la nave heroe
CREATE OR REPLACE FUNCTION add_hero_xp(p_user_id uuid, p_xp integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ship record;
  v_leveled_up boolean := false;
BEGIN
  PERFORM create_hero_ship(p_user_id);

  SELECT * INTO v_ship FROM user_hero_ships WHERE user_id = p_user_id FOR UPDATE;

  v_ship.xp := v_ship.xp + p_xp;

  WHILE v_ship.xp >= v_ship.xp_to_next LOOP
    v_ship.xp := v_ship.xp - v_ship.xp_to_next;
    v_ship.level := v_ship.level + 1;
    v_ship.xp_to_next := hero_xp_for_level(v_ship.level);
    v_ship.hp_max := 100 + (v_ship.level - 1) * 10;
    v_ship.hp := v_ship.hp_max;
    v_leveled_up := true;
  END LOOP;

  UPDATE user_hero_ships
  SET level = v_ship.level,
      xp = v_ship.xp,
      xp_to_next = v_ship.xp_to_next,
      hp = v_ship.hp,
      hp_max = v_ship.hp_max,
      updated_at = now()
  WHERE user_id = p_user_id;

  RETURN jsonb_build_object(
    'success', true,
    'level', v_ship.level,
    'xp', v_ship.xp,
    'xp_to_next', v_ship.xp_to_next,
    'leveled_up', v_leveled_up
  );
END;
$$;

-- Asignar puntos de atributo (sin loot)
CREATE OR REPLACE FUNCTION assign_hero_points(
  p_user_id uuid,
  p_attack integer DEFAULT 0,
  p_defense integer DEFAULT 0,
  p_shield integer DEFAULT 0,
  p_speed integer DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ship record;
  v_total_available integer;
  v_requested integer;
BEGIN
  PERFORM create_hero_ship(p_user_id);

  SELECT * INTO v_ship FROM user_hero_ships WHERE user_id = p_user_id FOR UPDATE;

  v_total_available := (v_ship.level - 1) * 10;
  v_total_available := GREATEST(v_total_available, v_ship.attack_points + v_ship.defense_points + v_ship.shield_points + v_ship.speed_points);
  v_requested := p_attack + p_defense + p_shield + p_speed;

  IF v_requested <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Debes asignar al menos 1 punto');
  END IF;

  IF v_requested > v_total_available - v_ship.attack_points - v_ship.defense_points - v_ship.shield_points - v_ship.speed_points THEN
    RETURN jsonb_build_object('success', false, 'error', 'No tienes suficientes puntos disponibles');
  END IF;

  UPDATE user_hero_ships
  SET attack_points = attack_points + p_attack,
      defense_points = defense_points + p_defense,
      shield_points = shield_points + p_shield,
      speed_points = speed_points + p_speed,
      updated_at = now()
  WHERE user_id = p_user_id;

  RETURN jsonb_build_object('success', true);
END;
$$;

-- Reiniciar puntos (respec) con costo FXU
CREATE OR REPLACE FUNCTION respec_hero_ship(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_respec_cost integer;
  v_fxu_balance numeric;
  v_ship record;
  v_admin_id uuid;
  v_admin_amount numeric;
  v_pool_amount numeric;
BEGIN
  SELECT COALESCE(
    (SELECT value::integer FROM game_settings WHERE key = 'fxu_hero_respec_cost'),
    10000
  ) INTO v_respec_cost;

  SELECT fxu_balance INTO v_fxu_balance FROM profiles WHERE id = p_user_id;

  IF v_fxu_balance < v_respec_cost THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', '⚡ Fondos insuficientes. Necesitas ' || v_respec_cost || ' FXU para reiniciar los puntos de tu nave.'
    );
  END IF;

  PERFORM set_config('app.fxu_update_allowed', 'respec_hero_ship', true);

  UPDATE profiles SET fxu_balance = fxu_balance - v_respec_cost WHERE id = p_user_id;

  PERFORM set_config('app.fxu_update_allowed', '', true);

  -- Split 50% admin / 50% pools
  v_pool_amount := FLOOR(v_respec_cost * 0.50);
  v_admin_amount := v_respec_cost - v_pool_amount;

  -- 50% al admin wallet
  SELECT id INTO v_admin_id FROM profiles WHERE is_admin = true ORDER BY created_at ASC LIMIT 1;
  IF v_admin_id IS NOT NULL AND v_admin_id != p_user_id AND v_admin_amount > 0 THEN
    UPDATE profiles SET fxu_balance = fxu_balance + v_admin_amount WHERE id = v_admin_id;
  END IF;

  PERFORM record_admin_revenue('hero_respec', v_admin_amount, 'Hero Ship respec (50% admin)', p_user_id, NULL);

  -- 50% a pools de recompensa
  IF v_pool_amount > 0 THEN
    PERFORM contribute_to_jackpot(v_pool_amount, 'hero_respec', p_user_id);
  END IF;

  UPDATE user_hero_ships
  SET attack_points = 0,
      defense_points = 0,
      shield_points = 0,
      speed_points = 0,
      updated_at = now()
  WHERE user_id = p_user_id;

  RETURN jsonb_build_object(
    'success', true,
    'message', '✅ Puntos de la nave reiniciados. Se han gastado ' || v_respec_cost || ' FXU.',
    'fxu_spent', v_respec_cost
  );
END;
$$;

-- Anadir hero_respec al constraint de admin_revenue
ALTER TABLE admin_revenue DROP CONSTRAINT IF EXISTS admin_revenue_revenue_type_check;
ALTER TABLE admin_revenue ADD CONSTRAINT admin_revenue_revenue_type_check
  CHECK (revenue_type = ANY (ARRAY[
    'market_fee', 'withdrawal_fee', 'instant_build', 'instant_research',
    'instant_ship', 'referral_bonus', 'officer_fxu', 'expedition_fee',
    'supply_box', 'fleet_acceleration', 'swap_fee', 'transfer_fee',
    'plus_subscription', 'colony_abandon', 'planet_rename',
    'alliance_rename', 'alliance_creation', 'lottery_fee',
    'p2p_fee', 'blueprint_sale', 'hero_respec', 'other'
  ]));

-- Config default para respec
INSERT INTO game_settings (key, value, description)
VALUES ('fxu_hero_respec_cost', '10000', 'Costo en FXU para reiniciar puntos de la Nave Heroe')
ON CONFLICT (key) DO NOTHING;

-- Permisos
GRANT EXECUTE ON FUNCTION get_hero_ship(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION add_hero_xp(uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION assign_hero_points(uuid, integer, integer, integer, integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION respec_hero_ship(uuid) TO authenticated;
