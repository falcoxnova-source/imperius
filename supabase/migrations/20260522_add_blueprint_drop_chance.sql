-- Add per-blueprint expedition drop chance percentage
ALTER TABLE ship_blueprints
  ADD COLUMN IF NOT EXISTS expedition_drop_chance numeric NOT NULL DEFAULT 0
  CHECK (expedition_drop_chance >= 0 AND expedition_drop_chance <= 100);

-- Update admin RPC to include the new field
CREATE OR REPLACE FUNCTION admin_update_ship_blueprint(
  p_blueprint_code text,
  p_name text,
  p_description text,
  p_image_url text,
  p_price_fxu numeric,
  p_is_active boolean,
  p_is_droppable boolean DEFAULT NULL,
  p_expedition_drop_chance numeric DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_is_admin boolean;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No autenticado');
  END IF;

  SELECT COALESCE(is_admin, false) INTO v_is_admin
  FROM profiles
  WHERE id = v_user_id;

  IF NOT v_is_admin THEN
    RETURN jsonb_build_object('success', false, 'error', 'Solo administradores');
  END IF;

  IF p_price_fxu IS NULL OR p_price_fxu < 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Precio invalido');
  END IF;

  IF p_expedition_drop_chance IS NOT NULL AND (p_expedition_drop_chance < 0 OR p_expedition_drop_chance > 100) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Drop chance debe ser entre 0 y 100');
  END IF;

  UPDATE ship_blueprints
  SET name                    = COALESCE(NULLIF(p_name, ''), name),
      description             = p_description,
      image_url               = p_image_url,
      price_fxu               = p_price_fxu,
      is_active               = COALESCE(p_is_active, is_active),
      is_droppable            = COALESCE(p_is_droppable, is_droppable),
      expedition_drop_chance  = COALESCE(p_expedition_drop_chance, expedition_drop_chance)
  WHERE code = p_blueprint_code;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Plano no existe');
  END IF;

  RETURN jsonb_build_object('success', true);
END;
$$;

GRANT EXECUTE ON FUNCTION admin_update_ship_blueprint(text, text, text, text, numeric, boolean, boolean, numeric) TO authenticated;

-- Update expedition drop function to use per-blueprint weighted chance
CREATE OR REPLACE FUNCTION award_expedition_blueprint_drop()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cfg expedition_blueprint_drop_config%ROWTYPE;
  v_roll numeric;
  v_blueprint_id bigint;
  v_total_weight numeric;
BEGIN
  IF NOT (NEW.mission_type = 'expedition' AND NEW.is_completed = true AND COALESCE(OLD.is_completed, false) = false) THEN
    RETURN NEW;
  END IF;

  IF EXISTS (SELECT 1 FROM expedition_blueprint_drops WHERE fleet_id = NEW.id) THEN
    RETURN NEW;
  END IF;

  SELECT * INTO v_cfg FROM expedition_blueprint_drop_config WHERE id = 1;
  IF v_cfg IS NULL OR v_cfg.is_enabled = false THEN
    RETURN NEW;
  END IF;

  v_roll := random();
  IF v_roll > v_cfg.drop_chance THEN
    RETURN NEW;
  END IF;

  -- Weighted random selection based on per-blueprint expedition_drop_chance
  WITH eligible AS (
    SELECT id, expedition_drop_chance
    FROM ship_blueprints
    WHERE is_active = true AND is_droppable = true AND expedition_drop_chance > 0
  )
  SELECT id INTO v_blueprint_id
  FROM (
    SELECT id, expedition_drop_chance,
      SUM(expedition_drop_chance) OVER () AS total_weight,
      SUM(expedition_drop_chance) OVER (ORDER BY id) AS cum_weight
    FROM eligible
  ) weighted
  WHERE cum_weight >= random() * total_weight
  ORDER BY cum_weight
  LIMIT 1;

  IF v_blueprint_id IS NULL THEN
    RETURN NEW;
  END IF;

  INSERT INTO user_ship_blueprints (user_id, blueprint_id, source, metadata)
  VALUES (
    NEW.user_id,
    v_blueprint_id,
    'expedition',
    jsonb_build_object('fleet_id', NEW.id, 'roll', v_roll, 'chance', v_cfg.drop_chance)
  );

  INSERT INTO expedition_blueprint_drops (fleet_id, user_id, blueprint_id, roll_value, chance_used)
  VALUES (NEW.id, NEW.user_id, v_blueprint_id, v_roll, v_cfg.drop_chance)
  ON CONFLICT (fleet_id) DO NOTHING;

  RETURN NEW;
END;
$$;

-- Seed default values for existing droppable blueprints
UPDATE ship_blueprints
SET expedition_drop_chance = 10
WHERE is_droppable = true AND is_active = true AND expedition_drop_chance = 0;
