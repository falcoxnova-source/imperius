/*
  # Supply Boxes System

  1. New Tables
    - `supply_boxes` - Configurable supply box types with resource amounts and FXU prices
    - `supply_box_purchases` - History of box purchases

  2. Features
    - Admin can configure box prices and resource amounts
    - Users purchase boxes with FXU and receive resources on current planet
    - Track purchase history for analytics

  3. Default Boxes
    - Starter Box: 10k each resource - 10,000 FXU
    - Medium Box: 50k each resource - 40,000 FXU
    - Large Box: 100k each resource - 80,000 FXU
    - Premium Box: 250k each resource - 200,000 FXU
    - Ultimate Box: 500k each resource - 400,000 FXU

  4. Security
    - RLS enabled
    - Admin-only price management
    - Secure purchase function
*/

-- Supply boxes configuration table
CREATE TABLE IF NOT EXISTS supply_boxes (
  id serial PRIMARY KEY,
  name text NOT NULL,
  code text UNIQUE NOT NULL,
  description text,
  metal_amount bigint NOT NULL DEFAULT 0,
  crystal_amount bigint NOT NULL DEFAULT 0,
  deuterium_amount bigint NOT NULL DEFAULT 0,
  price_fxu numeric NOT NULL DEFAULT 0,
  is_active boolean DEFAULT true,
  sort_order int DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Insert default supply boxes
INSERT INTO supply_boxes (name, code, description, metal_amount, crystal_amount, deuterium_amount, price_fxu, sort_order) VALUES
  ('Caja Inicial', 'box_starter', 'Recursos basicos para comenzar', 10000, 10000, 10000, 10000, 1),
  ('Caja Media', 'box_medium', 'Suministros para expansion', 50000, 50000, 50000, 40000, 2),
  ('Caja Grande', 'box_large', 'Recursos abundantes', 100000, 100000, 100000, 80000, 3),
  ('Caja Premium', 'box_premium', 'Para jugadores serios', 250000, 250000, 250000, 200000, 4),
  ('Caja Ultimate', 'box_ultimate', 'Maximos recursos', 500000, 500000, 500000, 400000, 5)
ON CONFLICT (code) DO NOTHING;

-- Purchase history table
CREATE TABLE IF NOT EXISTS supply_box_purchases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  planet_id uuid NOT NULL REFERENCES planets(id) ON DELETE CASCADE,
  box_id int NOT NULL REFERENCES supply_boxes(id),
  box_name text NOT NULL,
  metal_received bigint NOT NULL,
  crystal_received bigint NOT NULL,
  deuterium_received bigint NOT NULL,
  fxu_paid numeric NOT NULL,
  purchased_at timestamptz DEFAULT now()
);

CREATE INDEX idx_supply_box_purchases_user ON supply_box_purchases(user_id);
CREATE INDEX idx_supply_box_purchases_date ON supply_box_purchases(purchased_at);

-- Enable RLS
ALTER TABLE supply_boxes ENABLE ROW LEVEL SECURITY;
ALTER TABLE supply_box_purchases ENABLE ROW LEVEL SECURITY;

-- RLS Policies for supply_boxes
CREATE POLICY "Anyone can view active supply boxes"
  ON supply_boxes FOR SELECT
  TO authenticated
  USING (is_active = true);

CREATE POLICY "Admins can manage supply boxes"
  ON supply_boxes FOR ALL
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true)
  );

-- RLS Policies for purchases
CREATE POLICY "Users can view own purchases"
  ON supply_box_purchases FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Admins can view all purchases"
  ON supply_box_purchases FOR SELECT
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true)
  );

-- Function to purchase a supply box
CREATE OR REPLACE FUNCTION purchase_supply_box(
  p_box_code text,
  p_planet_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_box supply_boxes%ROWTYPE;
  v_planet planets%ROWTYPE;
  v_current_fxu numeric;
BEGIN
  v_user_id := auth.uid();
  
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No autenticado');
  END IF;

  -- Get box details
  SELECT * INTO v_box FROM supply_boxes WHERE code = p_box_code AND is_active = true;
  
  IF v_box.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Caja no encontrada o no disponible');
  END IF;

  -- Verify planet ownership
  SELECT * INTO v_planet FROM planets WHERE id = p_planet_id AND user_id = v_user_id;
  
  IF v_planet.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Planeta no encontrado o no te pertenece');
  END IF;

  -- Check FXU balance
  SELECT fxu_balance INTO v_current_fxu FROM profiles WHERE id = v_user_id;
  
  IF v_current_fxu IS NULL OR v_current_fxu < v_box.price_fxu THEN
    RETURN jsonb_build_object('success', false, 'error', 'FXU insuficiente. Necesitas ' || v_box.price_fxu || ' FXU');
  END IF;

  -- Deduct FXU from user
  UPDATE profiles 
  SET fxu_balance = fxu_balance - v_box.price_fxu 
  WHERE id = v_user_id;

  -- Add resources to planet
  UPDATE planets
  SET 
    metal = metal + v_box.metal_amount,
    crystal = crystal + v_box.crystal_amount,
    deuterium = deuterium + v_box.deuterium_amount,
    updated_at = now()
  WHERE id = p_planet_id;

  -- Record purchase
  INSERT INTO supply_box_purchases (user_id, planet_id, box_id, box_name, metal_received, crystal_received, deuterium_received, fxu_paid)
  VALUES (v_user_id, p_planet_id, v_box.id, v_box.name, v_box.metal_amount, v_box.crystal_amount, v_box.deuterium_amount, v_box.price_fxu);

  -- Record as admin revenue
  INSERT INTO admin_revenue (type, amount, user_id, description)
  VALUES ('supply_box', v_box.price_fxu, v_user_id, 'Compra: ' || v_box.name);

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Caja comprada exitosamente! Recursos agregados a ' || v_planet.name,
    'metal', v_box.metal_amount,
    'crystal', v_box.crystal_amount,
    'deuterium', v_box.deuterium_amount,
    'fxu_spent', v_box.price_fxu
  );
END;
$$;

-- Admin function to update supply box
CREATE OR REPLACE FUNCTION admin_update_supply_box(
  p_box_code text,
  p_name text DEFAULT NULL,
  p_description text DEFAULT NULL,
  p_metal_amount bigint DEFAULT NULL,
  p_crystal_amount bigint DEFAULT NULL,
  p_deuterium_amount bigint DEFAULT NULL,
  p_price_fxu numeric DEFAULT NULL,
  p_is_active boolean DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin_id uuid;
BEGIN
  v_admin_id := auth.uid();
  
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = v_admin_id AND is_admin = true) THEN
    RETURN jsonb_build_object('success', false, 'error', 'No autorizado');
  END IF;

  UPDATE supply_boxes
  SET 
    name = COALESCE(p_name, name),
    description = COALESCE(p_description, description),
    metal_amount = COALESCE(p_metal_amount, metal_amount),
    crystal_amount = COALESCE(p_crystal_amount, crystal_amount),
    deuterium_amount = COALESCE(p_deuterium_amount, deuterium_amount),
    price_fxu = COALESCE(p_price_fxu, price_fxu),
    is_active = COALESCE(p_is_active, is_active),
    updated_at = now()
  WHERE code = p_box_code;

  RETURN jsonb_build_object('success', true, 'message', 'Caja actualizada');
END;
$$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION purchase_supply_box(text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION admin_update_supply_box(text, text, text, bigint, bigint, bigint, numeric, boolean) TO authenticated;
