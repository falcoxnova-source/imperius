/*
  # Notificacion in-game cuando dropea un plano en expedicion

  Cuando una expedicion encuentra un plano de nave (Falco-X Clasica,
  Mega Reciclador, etc.) le llega al jugador un mensaje al inbox con
  estilo de juego (narrativo, epico, dependiendo del plano).

  Se actualiza la funcion `award_expedition_blueprint_drop` para
  insertar un INSERT INTO messages adicional, justo despues de
  registrar el drop.

  Notas:
    - message_type = 'expedition' (entra al feed de expediciones)
    - sender_name  = 'Sonda Exploradora'
    - subject      = personalizado por plano
    - body         = narrativa con coordenadas y nombre del plano
*/

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
  v_blueprint_name text;
  v_blueprint_code text;
  v_eligible_count int;
  v_subject text;
  v_body text;
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

  SELECT COUNT(*) INTO v_eligible_count
  FROM ship_blueprints sb
  WHERE sb.is_active = true
    AND (sb.last_drop_at IS NULL
         OR sb.last_drop_at + (sb.drop_cooldown_seconds || ' seconds')::interval <= now());

  IF v_eligible_count = 0 THEN
    RETURN NEW;
  END IF;

  v_roll := random();
  IF v_roll > v_cfg.drop_chance THEN
    RETURN NEW;
  END IF;

  SELECT sb.id, sb.name, sb.code
    INTO v_blueprint_id, v_blueprint_name, v_blueprint_code
  FROM ship_blueprints sb
  WHERE sb.is_active = true
    AND (sb.last_drop_at IS NULL
         OR sb.last_drop_at + (sb.drop_cooldown_seconds || ' seconds')::interval <= now())
  ORDER BY random()
  LIMIT 1
  FOR UPDATE SKIP LOCKED;

  IF v_blueprint_id IS NULL THEN
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

  -- ============================================================
  --  Mensaje in-game al jugador (estilo narrativo)
  -- ============================================================
  IF v_blueprint_code = 'bp_falco_x_clasica' THEN
    v_subject := format('💎 ¡Hallazgo Legendario! Plano: %s', v_blueprint_name);
    v_body := format(
      E'Comandante,\n\n'
      'Durante la exploracion en las coordenadas [%s:%s:%s], la sonda detecto '
      'una senal energetica fuera de catalogo proveniente de los restos de una '
      'nave alienigena de origen desconocido.\n\n'
      'Tras horas de analisis, los ingenieros han logrado descifrar parte de los '
      'datos: se trata de un PLANO COMPLETO de la legendaria nave **%s**.\n\n'
      '⚡ Este es un descubrimiento extraordinario. Solo unas pocas civilizaciones '
      'en toda la galaxia han logrado siquiera ver uno de estos planos.\n\n'
      'El plano ha sido transferido a tu inventario. Puedes consultarlo en el '
      'Mercado de Planos.\n\n'
      '— Departamento de Inteligencia',
      NEW.target_galaxy, NEW.target_system, NEW.target_position,
      v_blueprint_name
    );
  ELSIF v_blueprint_code = 'bp_mega_recycler' THEN
    v_subject := format('🛠️ Plano Industrial Recuperado: %s', v_blueprint_name);
    v_body := format(
      E'Comandante,\n\n'
      'En las coordenadas [%s:%s:%s] la sonda encontro restos de un complejo '
      'industrial abandonado. Entre los escombros hemos rescatado un cilindro '
      'de datos intacto.\n\n'
      'El cilindro contiene el PLANO completo de un **%s**, una unidad capaz '
      'de procesar campos de escombros a una escala muy superior a los '
      'recicladores convencionales.\n\n'
      '🔧 Construirlo te dara una ventaja estrategica enorme en la recuperacion '
      'de recursos despues de cada batalla.\n\n'
      'El plano ya esta en tu inventario, accesible desde el Mercado de Planos.\n\n'
      '— Departamento de Inteligencia',
      NEW.target_galaxy, NEW.target_system, NEW.target_position,
      v_blueprint_name
    );
  ELSE
    v_subject := format('📜 Plano descubierto en expedicion: %s', v_blueprint_name);
    v_body := format(
      E'Comandante,\n\n'
      'La expedicion enviada a [%s:%s:%s] ha regresado con un descubrimiento '
      'inesperado: el PLANO de **%s**.\n\n'
      'Los datos han sido transferidos a tu inventario. Revisalo en el '
      'Mercado de Planos.\n\n'
      '— Departamento de Inteligencia',
      NEW.target_galaxy, NEW.target_system, NEW.target_position,
      v_blueprint_name
    );
  END IF;

  INSERT INTO messages (sender_id, recipient_id, sender_name, subject, body, message_type)
  VALUES (NULL, NEW.user_id, 'Sonda Exploradora', v_subject, v_body, 'expedition');

  RETURN NEW;
END;
$$;
