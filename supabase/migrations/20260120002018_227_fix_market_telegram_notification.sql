/*
  # Fix Market Telegram Notification

  ## Summary
  Fixes the HTTP call to use correct pg_net syntax and adds configuration
  for the Supabase URL needed for the notification.

  ## Changes
  1. Add market_notification_config table to store the edge function URL
  2. Update create_market_listing to use net.http_post correctly
*/

-- Create config table for market notifications
CREATE TABLE IF NOT EXISTS market_notification_config (
  id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  edge_function_url text NOT NULL,
  is_enabled boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE market_notification_config ENABLE ROW LEVEL SECURITY;

-- Only admins can view/edit config
CREATE POLICY "Admins can manage notification config"
  ON market_notification_config
  FOR ALL
  TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true));

-- Insert default config (will be updated with actual URL)
INSERT INTO market_notification_config (edge_function_url, is_enabled)
VALUES ('', false)
ON CONFLICT (id) DO NOTHING;

-- Function to send market notification via pg_net
CREATE OR REPLACE FUNCTION send_market_telegram_notification(
  p_listing_id uuid,
  p_seller_username text,
  p_listing_type text,
  p_item_code text,
  p_quantity bigint,
  p_price_per_unit numeric,
  p_total_price numeric
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_config RECORD;
  v_request_id bigint;
BEGIN
  -- Get notification config
  SELECT edge_function_url, is_enabled INTO v_config
  FROM market_notification_config
  WHERE id = 1;
  
  -- Only send if enabled and URL is configured
  IF v_config IS NULL OR NOT v_config.is_enabled OR v_config.edge_function_url = '' THEN
    RETURN;
  END IF;
  
  -- Send async HTTP request using pg_net
  SELECT net.http_post(
    url := v_config.edge_function_url,
    body := jsonb_build_object(
      'listing_id', p_listing_id,
      'seller_username', p_seller_username,
      'listing_type', p_listing_type,
      'item_code', p_item_code,
      'quantity', p_quantity,
      'price_per_unit', p_price_per_unit,
      'total_price', p_total_price
    ),
    headers := jsonb_build_object(
      'Content-Type', 'application/json'
    )
  ) INTO v_request_id;
  
EXCEPTION
  WHEN OTHERS THEN
    -- Log but don't fail
    RAISE NOTICE 'Market notification error: %', SQLERRM;
END;
$$;

-- Update create_market_listing to use the new notification function
CREATE OR REPLACE FUNCTION create_market_listing(
  p_listing_type text,
  p_item_code text,
  p_quantity bigint,
  p_price_per_unit numeric,
  p_planet_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_total_price numeric;
  v_current_amount numeric;
  v_ship_quantity int;
  v_user_dm int;
  v_listing_id uuid;
  v_telegram_id bigint;
  v_is_member boolean;
  v_username text;
BEGIN
  v_user_id := auth.uid();
  
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No autenticado');
  END IF;
  
  SELECT telegram_id INTO v_telegram_id
  FROM telegram_links
  WHERE user_id = v_user_id;
  
  IF v_telegram_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false, 
      'error', 'Debes vincular tu cuenta de Telegram para usar el mercado. Ve a la seccion de Tareas para vincular tu cuenta.',
      'requires_telegram', true
    );
  END IF;
  
  SELECT is_member INTO v_is_member
  FROM telegram_task_rewards
  WHERE user_id = v_user_id AND task_type = 'join_group';
  
  IF v_is_member IS NULL OR v_is_member = false THEN
    RETURN jsonb_build_object(
      'success', false, 
      'error', 'Debes ser miembro del grupo de Telegram para usar el mercado. Unete al grupo desde la seccion de Tareas.',
      'requires_telegram', true
    );
  END IF;
  
  IF p_quantity <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cantidad debe ser mayor a 0');
  END IF;
  
  IF p_price_per_unit <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Precio debe ser mayor a 0');
  END IF;
  
  IF p_listing_type NOT IN ('resource', 'ship', 'dark_matter') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Tipo de listado invalido');
  END IF;
  
  IF p_listing_type != 'dark_matter' THEN
    IF p_planet_id IS NULL THEN
      RETURN jsonb_build_object('success', false, 'error', 'Planeta requerido');
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM planets WHERE id = p_planet_id AND user_id = v_user_id) THEN
      RETURN jsonb_build_object('success', false, 'error', 'No eres dueno de este planeta');
    END IF;
  END IF;
  
  v_total_price := p_quantity * p_price_per_unit;
  
  IF p_listing_type = 'resource' THEN
    IF p_item_code NOT IN ('metal', 'crystal', 'deuterium') THEN
      RETURN jsonb_build_object('success', false, 'error', 'Recurso invalido');
    END IF;
    
    IF p_item_code = 'metal' THEN
      SELECT metal INTO v_current_amount FROM planet_resources WHERE planet_id = p_planet_id;
      IF v_current_amount IS NULL OR v_current_amount < p_quantity THEN
        RETURN jsonb_build_object('success', false, 'error', 'Metal insuficiente');
      END IF;
      
    ELSIF p_item_code = 'crystal' THEN
      SELECT crystal INTO v_current_amount FROM planet_resources WHERE planet_id = p_planet_id;
      IF v_current_amount IS NULL OR v_current_amount < p_quantity THEN
        RETURN jsonb_build_object('success', false, 'error', 'Cristal insuficiente');
      END IF;
      
    ELSIF p_item_code = 'deuterium' THEN
      SELECT deuterium INTO v_current_amount FROM planet_resources WHERE planet_id = p_planet_id;
      IF v_current_amount IS NULL OR v_current_amount < p_quantity THEN
        RETURN jsonb_build_object('success', false, 'error', 'Deuterio insuficiente');
      END IF;
    END IF;
    
  ELSIF p_listing_type = 'dark_matter' THEN
    SELECT dark_matter INTO v_user_dm FROM profiles WHERE id = v_user_id;
    IF v_user_dm IS NULL OR v_user_dm < p_quantity THEN
      RETURN jsonb_build_object('success', false, 'error', 'Materia oscura insuficiente');
    END IF;
    UPDATE profiles SET dark_matter = dark_matter - p_quantity WHERE id = v_user_id;
    
  ELSIF p_listing_type = 'ship' THEN
    IF NOT EXISTS (SELECT 1 FROM ship_types WHERE code = p_item_code) THEN
      RETURN jsonb_build_object('success', false, 'error', 'Tipo de nave invalido');
    END IF;
    
    SELECT ps.quantity INTO v_ship_quantity
    FROM planet_ships ps
    JOIN ship_types st ON st.id = ps.ship_type_id
    WHERE ps.planet_id = p_planet_id AND st.code = p_item_code;
    
    IF v_ship_quantity IS NULL OR v_ship_quantity < p_quantity THEN
      RETURN jsonb_build_object('success', false, 'error', 'Naves insuficientes');
    END IF;
  END IF;
  
  INSERT INTO market_listings (seller_id, listing_type, item_code, quantity, price_per_unit, total_price, planet_id, status)
  VALUES (v_user_id, p_listing_type, p_item_code, p_quantity, p_price_per_unit, v_total_price, p_planet_id, 'active')
  RETURNING id INTO v_listing_id;
  
  -- Get username for notification
  SELECT username INTO v_username FROM profiles WHERE id = v_user_id;
  
  -- Send Telegram notification asynchronously
  PERFORM send_market_telegram_notification(
    v_listing_id,
    COALESCE(v_username, 'Jugador'),
    p_listing_type,
    p_item_code,
    p_quantity,
    p_price_per_unit,
    v_total_price
  );
  
  RETURN jsonb_build_object(
    'success', true,
    'message', 'Oferta creada exitosamente. Los recursos permanecen en tu planeta hasta que se vendan.',
    'listing_id', v_listing_id
  );
  
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', 'Error al crear oferta: ' || SQLERRM);
END;
$$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION create_market_listing(text, text, bigint, numeric, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION send_market_telegram_notification(uuid, text, text, text, bigint, numeric, numeric) TO authenticated;
