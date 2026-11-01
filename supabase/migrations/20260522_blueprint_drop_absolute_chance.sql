-- Make expedition_drop_chance the actual percentage probability per expedition
CREATE OR REPLACE FUNCTION award_expedition_blueprint_drop()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cfg expedition_blueprint_drop_config%ROWTYPE;
  v_blueprint_id bigint;
  v_drop_chance numeric;
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

  -- Each eligible blueprint rolls independently with probability = expedition_drop_chance / 100
  SELECT id, expedition_drop_chance INTO v_blueprint_id, v_drop_chance
  FROM ship_blueprints
  WHERE is_active = true AND is_droppable = true AND expedition_drop_chance > 0
    AND random() < expedition_drop_chance / 100.0
  ORDER BY random()
  LIMIT 1;

  IF v_blueprint_id IS NULL THEN
    RETURN NEW;
  END IF;

  INSERT INTO user_ship_blueprints (user_id, blueprint_id, source, metadata)
  VALUES (
    NEW.user_id,
    v_blueprint_id,
    'expedition',
    jsonb_build_object('fleet_id', NEW.id, 'chance', v_drop_chance)
  );

  INSERT INTO expedition_blueprint_drops (fleet_id, user_id, blueprint_id, roll_value, chance_used)
  VALUES (NEW.id, NEW.user_id, v_blueprint_id, random(), v_drop_chance)
  ON CONFLICT (fleet_id) DO NOTHING;

  RETURN NEW;
END;
$$;
