/*
  # Cooldown global por tipo de plano (cap absoluto en el tiempo)

  Objetivo:
    - Maximo 1 plano de "Falco-X Clasica" cada 7 dias en todo el servidor.
    - Maximo 1 plano de "Mega Reciclador" cada 24 horas en todo el servidor.
    - La cuenta que lo recibe sigue siendo aleatoria (la primera
      expedicion afortunada despues de que el cooldown libere ese plano).

  Implementacion:
    1) Anadir columnas en `ship_blueprints`:
        - drop_cooldown_seconds  -> cooldown global del plano
        - last_drop_at           -> cuando dropeo por ultima vez
    2) Configurar cooldowns por plano.
    3) Reescribir `award_expedition_blueprint_drop` para:
        - Considerar solo planos activos con cooldown vencido.
        - Si random() <= drop_chance y hay planos elegibles -> dropea uno al azar.
        - Reinicia el cooldown de ese plano.

  Nota: drop_chance se mantiene tal cual (0.0001), pero ahora es
  irrelevante el numero exacto, porque el cap real lo fija el cooldown.
  Aun asi, lo subimos a 0.01 (1%) para que la primera expedicion despues del
  cooldown sea muy probablemente la afortunada (sino podria pasar todo un dia
  sin que ninguna expedicion ruede el numero ganador).
*/

-- 1) Columnas
ALTER TABLE ship_blueprints
  ADD COLUMN IF NOT EXISTS drop_cooldown_seconds integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_drop_at timestamptz;

-- 2) Configurar cooldowns
UPDATE ship_blueprints
SET drop_cooldown_seconds = 7 * 24 * 3600  -- 1 semana
WHERE code = 'bp_falco_x_clasica';

UPDATE ship_blueprints
SET drop_cooldown_seconds = 24 * 3600       -- 1 dia
WHERE code = 'bp_mega_recycler';

-- 3) Subir drop_chance global a 1% (el cooldown es el cap real ahora)
UPDATE expedition_blueprint_drop_config
SET drop_chance = 0.01,
    updated_at = now()
WHERE id = 1;

-- 4) Reescribir la funcion del trigger
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
  v_eligible_count int;
BEGIN
  IF NOT (NEW.mission_type = 'expedition'
          AND NEW.is_completed = true
          AND COALESCE(OLD.is_completed, false) = false) THEN
    RETURN NEW;
  END IF;

  IF EXISTS (SELECT 1 FROM expedition_blueprint_drops WHERE fleet_id = NEW.id) THEN
    RETURN NEW;
  END IF;

  SELECT * INTO v_cfg FROM expedition_blueprint_drop_config WHERE id = 1;
  IF v_cfg IS NULL OR v_cfg.is_enabled = false THEN
    RETURN NEW;
  END IF;

  -- Cuantos planos tienen cooldown vencido y pueden dropear?
  SELECT COUNT(*) INTO v_eligible_count
  FROM ship_blueprints sb
  WHERE sb.is_active = true
    AND (sb.last_drop_at IS NULL
         OR sb.last_drop_at + (sb.drop_cooldown_seconds || ' seconds')::interval <= now());

  IF v_eligible_count = 0 THEN
    -- Todos los planos estan en cooldown global, no se dropea nada.
    RETURN NEW;
  END IF;

  v_roll := random();
  IF v_roll > v_cfg.drop_chance THEN
    RETURN NEW;
  END IF;

  -- Elegir aleatoriamente uno de los planos elegibles, con SELECT FOR UPDATE
  -- para evitar carreras (dos expediciones simultaneas).
  SELECT sb.id INTO v_blueprint_id
  FROM ship_blueprints sb
  WHERE sb.is_active = true
    AND (sb.last_drop_at IS NULL
         OR sb.last_drop_at + (sb.drop_cooldown_seconds || ' seconds')::interval <= now())
  ORDER BY random()
  LIMIT 1
  FOR UPDATE SKIP LOCKED;

  IF v_blueprint_id IS NULL THEN
    -- Otra expedicion concurrente ya agarro el ultimo elegible.
    RETURN NEW;
  END IF;

  -- Reservar el cooldown ANTES de insertar (consistencia)
  UPDATE ship_blueprints
  SET last_drop_at = now()
  WHERE id = v_blueprint_id;

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
