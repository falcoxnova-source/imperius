-- =====================================================================
-- 🎭 SISTEMA DE COSMÉTICOS
-- =====================================================================

DROP TABLE IF EXISTS user_cosmetics CASCADE;
DROP TABLE IF EXISTS cosmetic_items CASCADE;

CREATE TABLE cosmetic_items (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  cosmetic_type text NOT NULL CHECK (cosmetic_type IN ('title','badge','planet_effect','hero_skin','battle_effect')),
  name_es text NOT NULL,
  description_es text,
  icon text NOT NULL DEFAULT '✨',
  fxu_cost integer NOT NULL CHECK (fxu_cost > 0),
  duration_days integer NOT NULL DEFAULT 7,
  rarity text NOT NULL DEFAULT 'common' CHECK (rarity IN ('common','rare','epic','legendary','mythic')),
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (id)
);

CREATE TABLE user_cosmetics (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  cosmetic_id uuid NOT NULL REFERENCES cosmetic_items(id) ON DELETE CASCADE,
  purchased_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  equipped boolean NOT NULL DEFAULT false,
  PRIMARY KEY (id)
);
CREATE INDEX IF NOT EXISTS idx_uc_user ON user_cosmetics(user_id);
CREATE INDEX IF NOT EXISTS idx_uc_expires ON user_cosmetics(expires_at) WHERE equipped = true;

-- =====================================================================
-- CATÁLOGO INICIAL
-- =====================================================================

-- TÍTULOS (500-5000)
INSERT INTO cosmetic_items (code, cosmetic_type, name_es, description_es, icon, fxu_cost, duration_days, rarity, sort_order) VALUES
('title_alpha',     'title', '🐺 Alfa de la Manada',   'Domina la galaxia con autoridad suprema',        '🐺', 1000, 7,  'rare',      1),
('title_annihilator','title','⚡ Aniquilador Estelar',  'Tu nombre impone respeto en cada sistema',       '⚡', 2500, 7,  'legendary', 2),
('title_hawk',      'title', '🦅 Ojo del Halcón',      'Ves lo que otros no pueden ni imaginar',         '🦅', 1500, 7,  'epic',      3),
('title_reaper',    'title', '💀 Segador de Almas',     'Cada batalla deja su huella en tu leyenda',      '💀', 3500, 7,  'legendary', 4),
('title_emperor',   'title', '👑 Emperador del Vacío',  'No hay corona sin oscuridad',                    '👑', 5000, 14, 'mythic',    5),
('title_forged',    'title', '🔥 Forjado en Plasma',    'Templado en mil combates, irrompible',           '🔥', 2000, 7,  'epic',      6)
ON CONFLICT (code) DO NOTHING;

-- INSIGNIAS (200-2000)
INSERT INTO cosmetic_items (code, cosmetic_type, name_es, description_es, icon, fxu_cost, duration_days, rarity, sort_order) VALUES
('badge_wolf',      'badge', '🐺 Lobo Carmesí',        'Brillo rojo pulsante — ferocidad pura',          '🔴', 800,  7,  'rare',      1),
('badge_wings',     'badge', '🦅 Alas del Cazador',    'Dorado con partículas — majestuosidad alada',    '🟡', 1200, 7,  'epic',      2),
('badge_dragon',    'badge', '🐉 Dragón Ancestral',    'Fuego animado — poder milenario',                '🔥', 2000, 14, 'legendary', 3),
('badge_swords',    'badge', '⚔️ Espadas del Caos',    'Cruzadas en acero azul — equilibrio letal',      '🔵', 500,  7,  'common',    4),
('badge_crystal',   'badge', '💎 Cristal de Poder',    'Gira y refleja — energía pura concentrada',      '💎', 1500, 7,  'epic',      5),
('badge_storm',     'badge', '🌪️ Tormenta Eterna',     'Rayos animados — caos controlado',               '⚡', 1000, 7,  'rare',      6)
ON CONFLICT (code) DO NOTHING;

-- EFECTOS PLANETA (1000-10000)
INSERT INTO cosmetic_items (code, cosmetic_type, name_es, description_es, icon, fxu_cost, duration_days, rarity, sort_order) VALUES
('planet_fire',     'planet_effect', '🔥 Aureola de Fuego',     'Llamas rodean tu mundo — inconfundible',       '🔥', 2000,  7,  'rare',      1),
('planet_ice',      'planet_effect', '❄️ Tormenta de Hielo',   'Ventisca perpetua — frío calculador',          '❄️', 2000, 7,  'rare',      2),
('planet_golden',   'planet_effect', '🟡 Anillos Dorados',     'Anillos como Saturno — riqueza visible',       '🟡', 5000,  14, 'epic',      3),
('planet_dark',     'planet_effect', '🟣 Pulso de Energía Oscura','Ondas violetas — poder oculto',              '🟣', 7500, 14, 'legendary', 4),
('planet_nebula',   'planet_effect', '🌈 Nebulosa Radiante',    'Multicolor hipnótico — todos te miran',        '🌈', 10000, 30,'mythic', 5)
ON CONFLICT (code) DO NOTHING;

-- SKINS NAVE HÉROE (2000-50000)
INSERT INTO cosmetic_items (code, cosmetic_type, name_es, description_es, icon, fxu_cost, duration_days, rarity, sort_order) VALUES
('skin_obsidian',   'hero_skin', '⚫ Obsidiana',              'Negra con bordes rojos — sigilo letal',        '⚫', 3000,  7,  'rare',      1),
('skin_golden',     'hero_skin', '🟡 Dorada Imperial',       'Brillo cegador — riqueza sin límites',         '🟡', 10000, 14, 'legendary', 2),
('skin_spectral',   'hero_skin', '💀 Espectral',             'Semi-transparente azul — entre dos mundos',    '💀', 25000, 14, 'legendary', 3),
('skin_phoenix',    'hero_skin', '🔥 Fénix',                 'Llamas vivas — renaces de cada batalla',       '🔥', 50000, 30, 'mythic',    4)
ON CONFLICT (code) DO NOTHING;

-- EFECTOS BATALLA (500-5000)
INSERT INTO cosmetic_items (code, cosmetic_type, name_es, description_es, icon, fxu_cost, duration_days, rarity, sort_order) VALUES
('battle_crimson',  'battle_effect', '💥 Explosión Carmesí', 'Explosiones rojas — cada impacto es un espectáculo', '💥', 1000, 7,  'rare',  1),
('battle_lightning','battle_effect', '⚡ Trail de Rayos',    'Estela eléctrica — velocidad pura',                  '⚡', 2500, 7,  'epic',  2),
('battle_stardust', 'battle_effect', '🌌 Rastro Estelar',    'Polvo de estrellas — belleza cósmica',               '🌌', 5000, 14,'legendary', 3)
ON CONFLICT (code) DO NOTHING;

-- =====================================================================
-- FUNCIONES
-- =====================================================================

-- Limpiar cosméticos expirados al cargar perfil
DROP FUNCTION IF EXISTS clean_expired_cosmetics(uuid);
CREATE OR REPLACE FUNCTION clean_expired_cosmetics(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_expired record;
  v_type text;
BEGIN
  FOR v_expired IN
    SELECT uc.id, ci.cosmetic_type
    FROM user_cosmetics uc
    JOIN cosmetic_items ci ON ci.id = uc.cosmetic_id
    WHERE uc.user_id = p_user_id
      AND uc.equipped = true
      AND uc.expires_at < now()
  LOOP
    v_type := v_expired.cosmetic_type;

    UPDATE user_cosmetics SET equipped = false WHERE id = v_expired.id;

    IF v_type = 'title' THEN
      UPDATE profiles SET active_title = NULL, active_title_icon = NULL WHERE id = p_user_id;
    ELSIF v_type = 'badge' THEN
      UPDATE profiles SET active_badge = NULL WHERE id = p_user_id;
    ELSIF v_type = 'planet_effect' THEN
      UPDATE profiles SET active_planet_effect = NULL WHERE id = p_user_id;
    ELSIF v_type = 'hero_skin' THEN
      UPDATE profiles SET active_hero_skin = NULL WHERE id = p_user_id;
    END IF;
  END LOOP;
END;
$$;

-- Comprar cosmético
DROP FUNCTION IF EXISTS purchase_cosmetic(uuid);
CREATE OR REPLACE FUNCTION purchase_cosmetic(p_cosmetic_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_item cosmetic_items%ROWTYPE;
  v_balance numeric;
  v_expires timestamptz;
  v_purchase_id uuid;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No autenticado');
  END IF;

  SELECT * INTO v_item FROM cosmetic_items WHERE id = p_cosmetic_id AND is_active = true;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cosmético no encontrado');
  END IF;

  SELECT COALESCE(fxu_balance, 0) INTO v_balance FROM profiles WHERE id = v_user_id;
  IF v_balance < v_item.fxu_cost THEN
    RETURN jsonb_build_object('success', false, 'error', 'FXU insuficiente. Necesitas ' || v_item.fxu_cost || ' FXU, tienes ' || FLOOR(v_balance));
  END IF;

  -- Ya tiene este cosmético activo? renovar en vez de duplicar
  UPDATE user_cosmetics
  SET expires_at = expires_at + (v_item.duration_days || ' days')::interval
  WHERE user_id = v_user_id AND cosmetic_id = p_cosmetic_id AND expires_at > now() AND equipped = true
  RETURNING id INTO v_purchase_id;

  IF FOUND THEN
    PERFORM _internal_set_fxu_context();
    UPDATE profiles SET fxu_balance = fxu_balance - v_item.fxu_cost WHERE id = v_user_id;
    PERFORM record_admin_revenue('cosmetic_renewal', v_item.fxu_cost, 'Renew: ' || v_item.name_es, v_user_id, NULL);
    RETURN jsonb_build_object('success', true, 'message', 'Renovado hasta ' || (v_expires + (v_item.duration_days || ' days')::interval)::text, 'cost', v_item.fxu_cost, 'renewal', true);
  END IF;

  -- Nueva compra
  v_expires := now() + (v_item.duration_days || ' days')::interval;

  -- Cobrar
  PERFORM _internal_set_fxu_context();
  UPDATE profiles SET fxu_balance = fxu_balance - v_item.fxu_cost WHERE id = v_user_id;
  PERFORM record_admin_revenue('cosmetic_' || v_item.cosmetic_type, v_item.fxu_cost, 'Purchase: ' || v_item.name_es, v_user_id, NULL);

  INSERT INTO user_cosmetics (user_id, cosmetic_id, purchased_at, expires_at, equipped)
  VALUES (v_user_id, p_cosmetic_id, now(), v_expires, false)
  RETURNING id INTO v_purchase_id;

  RETURN jsonb_build_object('success', true, 'message', '¡' || v_item.name_es || ' adquirido! ', 'expires_at', v_expires, 'cost', v_item.fxu_cost);
END;
$$;

-- Equipar cosmético
DROP FUNCTION IF EXISTS equip_cosmetic(uuid);
CREATE OR REPLACE FUNCTION equip_cosmetic(p_cosmetic_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_item cosmetic_items%ROWTYPE;
  v_user_cosmetic user_cosmetics%ROWTYPE;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No autenticado');
  END IF;

  SELECT * INTO v_item FROM cosmetic_items WHERE id = p_cosmetic_id AND is_active = true;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cosmético no encontrado');
  END IF;

  -- Verificar que lo tiene y no expiró
  SELECT * INTO v_user_cosmetic FROM user_cosmetics
  WHERE user_id = v_user_id AND cosmetic_id = p_cosmetic_id AND expires_at > now()
  ORDER BY purchased_at DESC LIMIT 1;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'No tienes este cosmético o expiró');
  END IF;

  -- Desequipar otros del mismo tipo
  UPDATE user_cosmetics uc
  SET equipped = false
  FROM cosmetic_items ci
  WHERE ci.id = uc.cosmetic_id
    AND uc.user_id = v_user_id
    AND ci.cosmetic_type = v_item.cosmetic_type
    AND uc.id != v_user_cosmetic.id;

  -- Equipar este
  UPDATE user_cosmetics SET equipped = true WHERE id = v_user_cosmetic.id;

  -- Actualizar columna en profiles
  IF v_item.cosmetic_type = 'title' THEN
    UPDATE profiles SET active_title = v_item.name_es, active_title_icon = v_item.icon WHERE id = v_user_id;
  ELSIF v_item.cosmetic_type = 'badge' THEN
    UPDATE profiles SET active_badge = v_item.icon WHERE id = v_user_id;
  ELSIF v_item.cosmetic_type = 'planet_effect' THEN
    UPDATE profiles SET active_planet_effect = v_item.code WHERE id = v_user_id;
  ELSIF v_item.cosmetic_type = 'hero_skin' THEN
    UPDATE profiles SET active_hero_skin = v_item.code WHERE id = v_user_id;
  END IF;

  RETURN jsonb_build_object('success', true, 'message', v_item.name_es || ' equipado');
END;
$$;

-- Desequipar cosmético
DROP FUNCTION IF EXISTS unequip_cosmetic(text);
CREATE OR REPLACE FUNCTION unequip_cosmetic(p_cosmetic_type text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No autenticado');
  END IF;

  UPDATE user_cosmetics uc
  SET equipped = false
  FROM cosmetic_items ci
  WHERE ci.id = uc.cosmetic_id
    AND uc.user_id = v_user_id
    AND ci.cosmetic_type = p_cosmetic_type
    AND uc.equipped = true;

  IF p_cosmetic_type = 'title' THEN
    UPDATE profiles SET active_title = NULL, active_title_icon = NULL WHERE id = v_user_id;
  ELSIF p_cosmetic_type = 'badge' THEN
    UPDATE profiles SET active_badge = NULL WHERE id = v_user_id;
  ELSIF p_cosmetic_type = 'planet_effect' THEN
    UPDATE profiles SET active_planet_effect = NULL WHERE id = v_user_id;
  ELSIF p_cosmetic_type = 'hero_skin' THEN
    UPDATE profiles SET active_hero_skin = NULL WHERE id = v_user_id;
  END IF;

  RETURN jsonb_build_object('success', true, 'message', 'Desequipado');
END;
$$;

-- Catálogo de cosméticos (con estado del usuario actual)
DROP FUNCTION IF EXISTS get_cosmetic_catalog();
CREATE OR REPLACE FUNCTION get_cosmetic_catalog()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_result jsonb;
BEGIN
  v_user_id := auth.uid();
  
  -- Auto-clean expired first
  IF v_user_id IS NOT NULL THEN
    PERFORM clean_expired_cosmetics(v_user_id);
  END IF;

  SELECT jsonb_agg(
    jsonb_build_object(
      'id', ci.id,
      'code', ci.code,
      'type', ci.cosmetic_type,
      'name', ci.name_es,
      'description', ci.description_es,
      'icon', ci.icon,
      'cost', ci.fxu_cost,
      'duration_days', ci.duration_days,
      'rarity', ci.rarity,
      'owned', CASE WHEN v_user_id IS NOT NULL THEN
        EXISTS(SELECT 1 FROM user_cosmetics uc WHERE uc.user_id = v_user_id AND uc.cosmetic_id = ci.id AND uc.expires_at > now())
      ELSE false END,
      'equipped', CASE WHEN v_user_id IS NOT NULL THEN
        EXISTS(SELECT 1 FROM user_cosmetics uc WHERE uc.user_id = v_user_id AND uc.cosmetic_id = ci.id AND uc.expires_at > now() AND uc.equipped = true)
      ELSE false END,
      'expires_at', CASE WHEN v_user_id IS NOT NULL THEN
        (SELECT uc.expires_at::text FROM user_cosmetics uc WHERE uc.user_id = v_user_id AND uc.cosmetic_id = ci.id AND uc.expires_at > now() AND uc.equipped = true LIMIT 1)
      ELSE NULL END
    ) ORDER BY ci.sort_order
  ) INTO v_result
  FROM cosmetic_items ci
  WHERE ci.is_active = true;

  RETURN COALESCE(v_result, '[]'::jsonb);
END;
$$;

-- Inventario del usuario
DROP FUNCTION IF EXISTS get_user_cosmetics();
CREATE OR REPLACE FUNCTION get_user_cosmetics()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_result jsonb;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No autenticado');
  END IF;

  PERFORM clean_expired_cosmetics(v_user_id);

  SELECT jsonb_agg(
    jsonb_build_object(
      'id', ci.id,
      'code', ci.code,
      'type', ci.cosmetic_type,
      'name', ci.name_es,
      'icon', ci.icon,
      'rarity', ci.rarity,
      'cost', ci.fxu_cost,
      'purchased_at', uc.purchased_at,
      'expires_at', uc.expires_at,
      'equipped', uc.equipped,
      'remaining_hours', GREATEST(0, EXTRACT(EPOCH FROM (uc.expires_at - now()))/3600)
    ) ORDER BY uc.equipped DESC, uc.expires_at DESC
  ) INTO v_result
  FROM user_cosmetics uc
  JOIN cosmetic_items ci ON ci.id = uc.cosmetic_id
  WHERE uc.user_id = v_user_id AND uc.expires_at > now();

  RETURN COALESCE(v_result, '[]'::jsonb);
END;
$$;

-- =====================================================================
-- RLS
-- =====================================================================

ALTER TABLE cosmetic_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_cosmetics ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can view cosmetic items" ON cosmetic_items;
DROP POLICY IF EXISTS "Users can view own cosmetics" ON user_cosmetics;

CREATE POLICY "Anyone can view cosmetic items" ON cosmetic_items FOR SELECT USING (true);
CREATE POLICY "Users can view own cosmetics" ON user_cosmetics FOR SELECT USING (user_id = auth.uid());
