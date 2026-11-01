-- =====================================================================
-- ASTILLERO CORPORATIVO (Corporate Shipyard)
-- Venta de naves y defensas YA ENSAMBLADAS, entrega inmediata, pagadas
-- en TUNG al cambio vivo del USD.
-- =====================================================================
-- Ficcion de juego: la Corporacion mantiene astilleros orbitales que
-- fabrican flota en serie para quien pueda pagarla. No hay cola de
-- construccion ni consumo de recursos: la unidad se entrega montada en
-- el planeta que elija el cliente.
--
-- REUTILIZA SIN MODIFICAR:
--   * get_live_tung_price_usd()  -> conversion USD -> TUNG
--   * distribute_spend_fee(...)  -> reparto pool / empresa / referido,
--                                   y empresa -> accionistas via
--                                   record_admin_revenue
--   * _internal_set_fxu_context() -> permiso del trigger de saldo
--
-- NO TOCA: cola de hangar, recursos, flotas, combate, planos (salvo el
--   flag de game_settings indicado al final), mercado P2P, retiros.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 1. Catalogo administrable
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.instant_unit_offers (
  id              bigserial PRIMARY KEY,
  code            text NOT NULL UNIQUE,
  item_type       text NOT NULL CHECK (item_type IN ('ship', 'defense')),
  ship_type_id    integer REFERENCES public.ship_types(id) ON DELETE CASCADE,
  defense_type_id integer REFERENCES public.defense_types(id) ON DELETE CASCADE,
  name            text NOT NULL,
  description     text NOT NULL DEFAULT '',
  image_url       text,
  price_usd       numeric NOT NULL DEFAULT 0 CHECK (price_usd >= 0),
  max_per_order   integer NOT NULL DEFAULT 100 CHECK (max_per_order BETWEEN 1 AND 100000),
  is_active       boolean NOT NULL DEFAULT false,
  sort_order      integer NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT instant_unit_offers_one_target CHECK (
    (item_type = 'ship'    AND ship_type_id    IS NOT NULL AND defense_type_id IS NULL) OR
    (item_type = 'defense' AND defense_type_id IS NOT NULL AND ship_type_id    IS NULL)
  ),
  CONSTRAINT instant_unit_offers_uniq_ship    UNIQUE (ship_type_id),
  CONSTRAINT instant_unit_offers_uniq_defense UNIQUE (defense_type_id)
);

CREATE INDEX IF NOT EXISTS idx_instant_unit_offers_active
  ON public.instant_unit_offers (is_active, sort_order);

-- ---------------------------------------------------------------------
-- 2. Libro de compras (auditoria)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.instant_unit_purchases (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  planet_id       uuid NOT NULL REFERENCES public.planets(id) ON DELETE CASCADE,
  offer_code      text NOT NULL,
  item_type       text NOT NULL,
  ship_type_id    integer,
  defense_type_id integer,
  quantity        integer NOT NULL CHECK (quantity > 0),
  unit_price_usd  numeric NOT NULL,
  total_usd       numeric NOT NULL,
  tung_price_usd  numeric NOT NULL,
  cost_tung       numeric NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_instant_unit_purchases_user
  ON public.instant_unit_purchases (user_id, created_at DESC);

-- ---------------------------------------------------------------------
-- 3. Seguridad: solo lectura para el cliente, escritura solo por RPC
-- ---------------------------------------------------------------------
ALTER TABLE public.instant_unit_offers    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.instant_unit_purchases ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Instant unit catalog visible to authenticated" ON public.instant_unit_offers;
CREATE POLICY "Instant unit catalog visible to authenticated"
  ON public.instant_unit_offers FOR SELECT TO authenticated
  USING (is_active = true);

DROP POLICY IF EXISTS "Users read own instant unit purchases" ON public.instant_unit_purchases;
CREATE POLICY "Users read own instant unit purchases"
  ON public.instant_unit_purchases FOR SELECT TO authenticated
  USING (user_id = auth.uid());

REVOKE ALL ON public.instant_unit_offers    FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.instant_unit_purchases FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.instant_unit_offers    TO authenticated;
GRANT SELECT ON public.instant_unit_purchases TO authenticated;
GRANT ALL    ON public.instant_unit_offers    TO service_role;
GRANT ALL    ON public.instant_unit_purchases TO service_role;

-- ---------------------------------------------------------------------
-- 4. Vista de catalogo para el cliente (resuelve nombre/imagen/stats)
-- ---------------------------------------------------------------------
CREATE OR REPLACE VIEW public.instant_unit_catalog
WITH (security_invoker = true) AS
SELECT
  o.code,
  o.item_type,
  o.ship_type_id,
  o.defense_type_id,
  COALESCE(NULLIF(o.name, ''), st.name, dt.name)                 AS name,
  COALESCE(NULLIF(o.description, ''), st.description, dt.description, '') AS description,
  COALESCE(NULLIF(o.image_url, ''), st.image_url, dt.image_url)  AS image_url,
  o.price_usd,
  o.max_per_order,
  o.sort_order,
  COALESCE(st.metal_cost, dt.metal_cost)         AS metal_cost,
  COALESCE(st.crystal_cost, dt.crystal_cost)     AS crystal_cost,
  COALESCE(st.deuterium_cost, dt.deuterium_cost) AS deuterium_cost,
  COALESCE(st.structural_integrity, dt.structural_integrity) AS structural_integrity,
  COALESCE(st.shield_power, dt.shield_power)     AS shield_power,
  COALESCE(st.weapon_power, dt.weapon_power)     AS weapon_power,
  st.cargo_capacity,
  st.base_speed,
  dt.max_per_planet
FROM public.instant_unit_offers o
LEFT JOIN public.ship_types    st ON st.id = o.ship_type_id
LEFT JOIN public.defense_types dt ON dt.id = o.defense_type_id
WHERE o.is_active = true;

REVOKE ALL ON public.instant_unit_catalog FROM PUBLIC, anon;
GRANT SELECT ON public.instant_unit_catalog TO authenticated, service_role;

-- ---------------------------------------------------------------------
-- 5. RPC de compra (jugador)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.purchase_instant_unit(
  p_code     text,
  p_planet_id uuid,
  p_quantity  integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_user_id    uuid;
  v_offer      instant_unit_offers%ROWTYPE;
  v_qty        integer;
  v_planet_id  uuid;
  v_planet_name text;
  v_tung_usd   numeric;
  v_total_usd  numeric;
  v_cost       numeric;
  v_balance    numeric;
  v_max_planet integer;
  v_owned      bigint;
  v_unit_name  text;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No autenticado');
  END IF;

  -- Cantidad: entero estricto dentro del tope de la oferta
  v_qty := FLOOR(COALESCE(p_quantity, 0))::integer;
  IF v_qty <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cantidad invalida');
  END IF;

  SELECT * INTO v_offer
  FROM instant_unit_offers
  WHERE code = p_code AND is_active = true;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unidad no disponible en el astillero');
  END IF;

  IF v_qty > v_offer.max_per_order THEN
    RETURN jsonb_build_object('success', false, 'error',
      'Maximo ' || v_offer.max_per_order || ' unidades por pedido');
  END IF;

  IF COALESCE(v_offer.price_usd, 0) <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Esta unidad no tiene precio configurado');
  END IF;

  -- Planeta destino: tiene que ser del comprador y estar operativo
  SELECT p.id, p.name INTO v_planet_id, v_planet_name
  FROM planets p
  WHERE p.id = p_planet_id
    AND p.user_id = v_user_id
    AND COALESCE(p.is_destroyed, false) = false;
  IF v_planet_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Planeta no valido');
  END IF;

  -- Limites de la unidad (cupulas y plataformas)
  IF v_offer.item_type = 'defense' THEN
    SELECT dt.max_per_planet, dt.name INTO v_max_planet, v_unit_name
    FROM defense_types dt WHERE dt.id = v_offer.defense_type_id;

    IF v_max_planet IS NOT NULL AND v_max_planet > 0 THEN
      SELECT COALESCE(SUM(pd.quantity), 0) INTO v_owned
      FROM planet_defenses pd
      WHERE pd.planet_id = v_planet_id AND pd.defense_type_id = v_offer.defense_type_id;

      IF v_owned + v_qty > v_max_planet THEN
        RETURN jsonb_build_object('success', false, 'error',
          'Limite alcanzado: maximo ' || v_max_planet || ' por planeta');
      END IF;
    END IF;

    -- Misma regla que el hangar: cupula planetaria/gigante, una por cuenta
    IF v_offer.defense_type_id IN (7, 8) THEN
      IF EXISTS (
        SELECT 1 FROM planet_defenses pd
        JOIN planets pl ON pl.id = pd.planet_id
        WHERE pl.user_id = v_user_id
          AND pd.defense_type_id = v_offer.defense_type_id
          AND pd.quantity > 0
      ) THEN
        RETURN jsonb_build_object('success', false, 'error',
          'Ya posees esta cupula (solo se permite una por cuenta)');
      END IF;
      IF v_qty > 1 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Solo se permite una cupula por cuenta');
      END IF;
    END IF;
  ELSE
    SELECT st.name INTO v_unit_name FROM ship_types st WHERE st.id = v_offer.ship_type_id;
  END IF;

  -- Precio en TUNG al cambio vivo
  v_tung_usd := get_live_tung_price_usd();
  IF v_tung_usd IS NULL OR v_tung_usd <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error',
      'Precio de TUNG no disponible en este momento, intenta mas tarde');
  END IF;

  v_total_usd := v_offer.price_usd * v_qty;
  v_cost      := CEIL(v_total_usd / v_tung_usd);
  IF v_cost <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Importe invalido');
  END IF;

  -- Serializa compras concurrentes del mismo comprador
  SELECT COALESCE(fxu_balance, 0) INTO v_balance
  FROM profiles WHERE id = v_user_id FOR UPDATE;

  IF v_balance < v_cost THEN
    RETURN jsonb_build_object('success', false, 'error', 'TUNG insuficiente',
      'required', v_cost, 'balance', v_balance);
  END IF;

  -- Cobro
  PERFORM _internal_set_fxu_context();
  UPDATE profiles
  SET fxu_balance = COALESCE(fxu_balance, 0) - v_cost
  WHERE id = v_user_id;

  -- Reparto estandar: pool / empresa (y de ahi accionistas) / referido
  PERFORM distribute_spend_fee(
    v_cost,
    'instant_unit',
    'instant_unit_sale',
    v_user_id,
    'Astillero: ' || v_qty || 'x ' || COALESCE(v_unit_name, v_offer.name),
    NULL
  );

  -- Entrega inmediata
  IF v_offer.item_type = 'ship' THEN
    INSERT INTO planet_ships (planet_id, ship_type_id, quantity)
    VALUES (v_planet_id, v_offer.ship_type_id, v_qty)
    ON CONFLICT (planet_id, ship_type_id)
    DO UPDATE SET quantity = planet_ships.quantity + EXCLUDED.quantity;
  ELSE
    INSERT INTO planet_defenses (planet_id, defense_type_id, quantity)
    VALUES (v_planet_id, v_offer.defense_type_id, v_qty)
    ON CONFLICT (planet_id, defense_type_id)
    DO UPDATE SET quantity = planet_defenses.quantity + EXCLUDED.quantity;
  END IF;

  INSERT INTO instant_unit_purchases (
    user_id, planet_id, offer_code, item_type, ship_type_id, defense_type_id,
    quantity, unit_price_usd, total_usd, tung_price_usd, cost_tung
  ) VALUES (
    v_user_id, v_planet_id, v_offer.code, v_offer.item_type,
    v_offer.ship_type_id, v_offer.defense_type_id,
    v_qty, v_offer.price_usd, v_total_usd, v_tung_usd, v_cost
  );

  RETURN jsonb_build_object(
    'success', true,
    'message', v_qty || 'x ' || COALESCE(v_unit_name, v_offer.name)
               || ' entregadas en ' || COALESCE(v_planet_name, 'tu planeta'),
    'code', v_offer.code,
    'item_type', v_offer.item_type,
    'quantity', v_qty,
    'cost', v_cost,
    'total_usd', v_total_usd,
    'planet_id', v_planet_id,
    'planet_name', v_planet_name
  );
END;
$fn$;

REVOKE ALL ON FUNCTION public.purchase_instant_unit(text, uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.purchase_instant_unit(text, uuid, integer) TO authenticated, service_role;

-- ---------------------------------------------------------------------
-- 6. RPC de administracion
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_list_instant_unit_offers()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_rows jsonb;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true) THEN
    RETURN jsonb_build_object('success', false, 'error', 'No autorizado');
  END IF;

  SELECT COALESCE(jsonb_agg(x ORDER BY x->>'item_type', (x->>'sort_order')::int, x->>'name'), '[]'::jsonb)
  INTO v_rows
  FROM (
    SELECT jsonb_build_object(
      'code',            o.code,
      'item_type',       o.item_type,
      'ship_type_id',    o.ship_type_id,
      'defense_type_id', o.defense_type_id,
      'name',            COALESCE(NULLIF(o.name, ''), st.name, dt.name),
      'description',     o.description,
      'image_url',       COALESCE(NULLIF(o.image_url, ''), st.image_url, dt.image_url),
      'price_usd',       o.price_usd,
      'max_per_order',   o.max_per_order,
      'is_active',       o.is_active,
      'sort_order',      o.sort_order,
      'blueprint_price_usd', b.price_usd,
      'sold_units',      COALESCE(s.units, 0),
      'sold_tung',       COALESCE(s.tung, 0)
    ) AS x
    FROM instant_unit_offers o
    LEFT JOIN ship_types    st ON st.id = o.ship_type_id
    LEFT JOIN defense_types dt ON dt.id = o.defense_type_id
    LEFT JOIN ship_blueprints b
      ON (o.ship_type_id    IS NOT NULL AND b.ship_type_id    = o.ship_type_id)
      OR (o.defense_type_id IS NOT NULL AND b.defense_type_id = o.defense_type_id)
    LEFT JOIN LATERAL (
      SELECT SUM(quantity)::bigint AS units, SUM(cost_tung)::numeric AS tung
      FROM instant_unit_purchases ip WHERE ip.offer_code = o.code
    ) s ON true
  ) q;

  RETURN jsonb_build_object('success', true, 'offers', v_rows);
END;
$fn$;

CREATE OR REPLACE FUNCTION public.admin_update_instant_unit_offer(
  p_code          text,
  p_price_usd     numeric DEFAULT NULL,
  p_is_active     boolean DEFAULT NULL,
  p_max_per_order integer DEFAULT NULL,
  p_name          text    DEFAULT NULL,
  p_description   text    DEFAULT NULL,
  p_image_url     text    DEFAULT NULL,
  p_sort_order    integer DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true) THEN
    RETURN jsonb_build_object('success', false, 'error', 'No autorizado');
  END IF;

  IF p_price_usd IS NOT NULL AND p_price_usd < 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'El precio USD no puede ser negativo');
  END IF;

  IF p_max_per_order IS NOT NULL AND (p_max_per_order < 1 OR p_max_per_order > 100000) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Tope por pedido fuera de rango (1-100000)');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM instant_unit_offers WHERE code = p_code) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unidad no encontrada');
  END IF;

  UPDATE instant_unit_offers
  SET price_usd     = COALESCE(p_price_usd, price_usd),
      is_active     = COALESCE(p_is_active, is_active),
      max_per_order = COALESCE(p_max_per_order, max_per_order),
      name          = COALESCE(NULLIF(p_name, ''), name),
      description   = COALESCE(p_description, description),
      image_url     = CASE WHEN p_image_url IS NULL THEN image_url
                           WHEN p_image_url = ''    THEN NULL
                           ELSE p_image_url END,
      sort_order    = COALESCE(p_sort_order, sort_order),
      updated_at    = now()
  WHERE code = p_code;

  RETURN jsonb_build_object('success', true, 'message', 'Unidad actualizada');
END;
$fn$;

REVOKE ALL ON FUNCTION public.admin_list_instant_unit_offers() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_update_instant_unit_offer(text, numeric, boolean, integer, text, text, text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_instant_unit_offers() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_update_instant_unit_offer(text, numeric, boolean, integer, text, text, text, integer) TO authenticated, service_role;

-- ---------------------------------------------------------------------
-- 7. Semilla: una oferta por cada unidad que ya tiene plano.
--    Precio = precio del plano x 1.5 (los ajusta el admin despues).
-- ---------------------------------------------------------------------
INSERT INTO public.instant_unit_offers
  (code, item_type, ship_type_id, defense_type_id, name, description, price_usd, max_per_order, is_active, sort_order)
SELECT
  'iu_' || st.code,
  'ship',
  st.id,
  NULL,
  st.name,
  '',
  ROUND(b.price_usd * 1.5, 4),
  1000,
  true,
  st.id
FROM public.ship_blueprints b
JOIN public.ship_types st ON st.id = b.ship_type_id
WHERE b.ship_type_id IS NOT NULL
  AND COALESCE(b.price_usd, 0) > 0
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.instant_unit_offers
  (code, item_type, ship_type_id, defense_type_id, name, description, price_usd, max_per_order, is_active, sort_order)
SELECT
  'iu_' || dt.code,
  'defense',
  NULL,
  dt.id,
  dt.name,
  '',
  ROUND(b.price_usd * 1.5, 4),
  COALESCE(NULLIF(dt.max_per_planet, 0), 1000),
  true,
  dt.id
FROM public.ship_blueprints b
JOIN public.defense_types dt ON dt.id = b.defense_type_id
WHERE b.defense_type_id IS NOT NULL
  AND COALESCE(b.price_usd, 0) > 0
ON CONFLICT (code) DO NOTHING;

-- ---------------------------------------------------------------------
-- 8. Los planos dejan de entregar los recursos de fabricacion.
--    Se usa el interruptor que ya existe en purchase_ship_blueprint,
--    sin tocar una sola linea de esa funcion.
-- ---------------------------------------------------------------------
UPDATE public.game_settings
SET value = 'false', updated_at = now()
WHERE key = 'blueprint_includes_resources';

COMMIT;

NOTIFY pgrst, 'reload schema';
