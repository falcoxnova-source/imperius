/*
  # Planos capitales (Deathstar/Nova/Nodra), precios USD->FXU y drops pausados

  Objetivo:
    - Tener planos comprables (como Falco-X) para:
      * Estrella de la Muerte (deathstar)
      * Nova (nova)
      * Nodra = Destruccion Masiva (destruccion_masiva)
    - Ajustar precio Falco-X a 50 USD
    - Pausar drops de expedicion para capitales (incluida Falco-X) hasta habilitacion manual

  Regla conversion:
    1 USDT = 10,000 FXU

  Precios:
    - Deathstar: 20 USD  ->   200,000 FXU
    - Falco-X : 50 USD  ->   500,000 FXU
    - Nova    : 150 USD -> 1,500,000 FXU
    - Nodra   : 300 USD -> 3,000,000 FXU
*/

-- 1) Flag de control de drops por plano (ON/OFF independiente de venta)
ALTER TABLE ship_blueprints
  ADD COLUMN IF NOT EXISTS is_droppable boolean NOT NULL DEFAULT true;

-- 2) Crear / actualizar planos (comprables en mercado)
-- Deathstar
INSERT INTO ship_blueprints (
  code, ship_type_id, name, description, image_url, price_fxu, is_active,
  drop_cooldown_seconds, last_drop_at, is_droppable
)
SELECT
  'bp_deathstar',
  st.id,
  'Plano Estrella de la Muerte',
  'Plano permanente de ensamblaje de la Estrella de la Muerte. Transferible en mercado P2P.',
  st.image_url,
  200000,
  true,
  0,
  NULL,
  false
FROM ship_types st
WHERE st.code = 'deathstar'
ON CONFLICT (code) DO UPDATE
SET ship_type_id = EXCLUDED.ship_type_id,
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    image_url = COALESCE(EXCLUDED.image_url, ship_blueprints.image_url),
    price_fxu = 200000,
    is_active = true,
    is_droppable = false;

-- Nova
INSERT INTO ship_blueprints (
  code, ship_type_id, name, description, image_url, price_fxu, is_active,
  drop_cooldown_seconds, last_drop_at, is_droppable
)
SELECT
  'bp_nova',
  st.id,
  'Plano Nova',
  'Plano permanente de ensamblaje de la Nova. Transferible en mercado P2P.',
  st.image_url,
  1500000,
  true,
  0,
  NULL,
  false
FROM ship_types st
WHERE st.code = 'nova'
ON CONFLICT (code) DO UPDATE
SET ship_type_id = EXCLUDED.ship_type_id,
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    image_url = COALESCE(EXCLUDED.image_url, ship_blueprints.image_url),
    price_fxu = 1500000,
    is_active = true,
    is_droppable = false;

-- Nodra (code real de nave: destruccion_masiva)
INSERT INTO ship_blueprints (
  code, ship_type_id, name, description, image_url, price_fxu, is_active,
  drop_cooldown_seconds, last_drop_at, is_droppable
)
SELECT
  'bp_nodra',
  st.id,
  'Plano Nodra',
  'Plano permanente de ensamblaje de la Nodra. Transferible en mercado P2P.',
  st.image_url,
  3000000,
  true,
  0,
  NULL,
  false
FROM ship_types st
WHERE st.code = 'destruccion_masiva'
ON CONFLICT (code) DO UPDATE
SET ship_type_id = EXCLUDED.ship_type_id,
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    image_url = COALESCE(EXCLUDED.image_url, ship_blueprints.image_url),
    price_fxu = 3000000,
    is_active = true,
    is_droppable = false;

-- Falco-X (actualizar a 50 USD y pausar drop)
UPDATE ship_blueprints
SET price_fxu = 500000,
    is_active = true,
    is_droppable = false
WHERE code = 'bp_falco_x_clasica';

-- Mega reciclador sigue dropeable
UPDATE ship_blueprints
SET is_droppable = true
WHERE code = 'bp_mega_recycler';

-- 3) Trigger function: solo considerar planos dropeables
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
    AND COALESCE(sb.is_droppable, true) = true
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
    AND COALESCE(sb.is_droppable, true) = true
    AND (sb.last_drop_at IS NULL
         OR sb.last_drop_at + (sb.drop_cooldown_seconds || ' seconds')::interval <= now())
  ORDER BY random()
  LIMIT 1
  FOR UPDATE SKIP LOCKED;

  IF v_blueprint_id IS NULL THEN
    RETURN NEW;
  END IF;

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

  IF v_blueprint_code = 'bp_falco_x_clasica' THEN
    v_subject := format('💎 ¡Hallazgo Legendario! Plano: %s', v_blueprint_name);
    v_body := format(
      E'Comandante,\n\n'
      'Durante la exploracion en las coordenadas [%s:%s:%s], la sonda detecto '
      'una senal energetica fuera de catalogo proveniente de los restos de una '
      'nave alienigena de origen desconocido.\n\n'
      'Tras horas de analisis, los ingenieros han logrado descifrar parte de los '
      'datos: se trata de un PLANO COMPLETO de la legendaria nave **%s**.\n\n'
      '⚡ Este es un descubrimiento extraordinario.\n\n'
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
      'El cilindro contiene el PLANO completo de un **%s**.\n\n'
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

-- 4) Permitir editar is_droppable desde admin RPC (como Falco-X editable)
CREATE OR REPLACE FUNCTION admin_update_ship_blueprint(
  p_blueprint_code text,
  p_name text,
  p_description text,
  p_image_url text,
  p_price_fxu numeric,
  p_is_active boolean,
  p_is_droppable boolean DEFAULT NULL
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

  UPDATE ship_blueprints
  SET name         = COALESCE(NULLIF(p_name, ''), name),
      description  = p_description,
      image_url    = p_image_url,
      price_fxu    = p_price_fxu,
      is_active    = COALESCE(p_is_active, is_active),
      is_droppable = COALESCE(p_is_droppable, is_droppable)
  WHERE code = p_blueprint_code;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Plano no existe');
  END IF;

  RETURN jsonb_build_object('success', true);
END;
$$;

GRANT EXECUTE ON FUNCTION admin_update_ship_blueprint(text, text, text, text, numeric, boolean, boolean) TO authenticated;
