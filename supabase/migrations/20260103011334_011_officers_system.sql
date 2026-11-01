/*
  # Officers System (Oficiales)
  
  Implementation of the 5 officers from XNova/OGame that provide passive bonuses.
  Officers are purchased with Dark Matter and last for a duration.
  
  1. New Tables
    - `officer_types`
      - `id` (uuid, primary key)
      - `code` (text, unique) - commander, admiral, engineer, geologist, technocrat
      - `name` (text) - Display name
      - `description` (text) - What the officer does
      - `bonus_type` (text) - Type of bonus provided
      - `bonus_value` (numeric) - Bonus amount (percentage or flat)
      - `dark_matter_cost_7d` (integer) - Cost for 7 days
      - `dark_matter_cost_30d` (integer) - Cost for 30 days
      - `dark_matter_cost_90d` (integer) - Cost for 90 days
      - `icon` (text) - Icon identifier
      
    - `user_officers`
      - `id` (uuid, primary key)
      - `user_id` (uuid, references auth.users)
      - `officer_type_id` (uuid, references officer_types)
      - `expires_at` (timestamptz) - When the officer expires
      - `created_at` (timestamptz)
      
  2. Security
    - Enable RLS on both tables
    - Officer types readable by all authenticated users
    - User officers only accessible by owner
    
  3. Officers and their bonuses:
    - Commander: +2 building queue slots
    - Admiral: +2 fleet slots
    - Engineer: -50% defense losses, +10% energy production
    - Geologist: +10% mine production (metal, crystal, deuterium)
    - Technocrat: +2 spy probe levels, -25% research time
*/

-- Create officer_types table
CREATE TABLE IF NOT EXISTS officer_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text UNIQUE NOT NULL,
  name text NOT NULL,
  description text NOT NULL,
  bonus_type text NOT NULL,
  bonus_value numeric NOT NULL DEFAULT 0,
  bonus_secondary_type text,
  bonus_secondary_value numeric,
  dark_matter_cost_7d integer NOT NULL DEFAULT 5000,
  dark_matter_cost_30d integer NOT NULL DEFAULT 15000,
  dark_matter_cost_90d integer NOT NULL DEFAULT 40000,
  icon text NOT NULL DEFAULT 'user',
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

-- Create user_officers table
CREATE TABLE IF NOT EXISTS user_officers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  officer_type_id uuid NOT NULL REFERENCES officer_types(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_id, officer_type_id)
);

-- Enable RLS
ALTER TABLE officer_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_officers ENABLE ROW LEVEL SECURITY;

-- RLS Policies for officer_types (readable by all authenticated)
CREATE POLICY "Authenticated users can read officer types"
  ON officer_types FOR SELECT
  TO authenticated
  USING (true);

-- RLS Policies for user_officers
CREATE POLICY "Users can read own officers"
  ON user_officers FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own officers"
  ON user_officers FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own officers"
  ON user_officers FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own officers"
  ON user_officers FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Add dark_matter to profiles if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'dark_matter'
  ) THEN
    ALTER TABLE profiles ADD COLUMN dark_matter integer NOT NULL DEFAULT 0;
  END IF;
END $$;

-- Insert the 5 officers
INSERT INTO officer_types (code, name, description, bonus_type, bonus_value, bonus_secondary_type, bonus_secondary_value, dark_matter_cost_7d, dark_matter_cost_30d, dark_matter_cost_90d, icon, sort_order) VALUES
  ('commander', 'Comandante', 'Expande la cola de construccion permitiendo 2 edificios adicionales en cola. Proporciona una vision general mejorada del imperio.', 'building_queue', 2, NULL, NULL, 5000, 15000, 40000, 'crown', 1),
  ('admiral', 'Almirante', 'Aumenta los slots de flota disponibles en 2. Muestra informacion detallada sobre flotas en retorno.', 'fleet_slots', 2, NULL, NULL, 5000, 15000, 40000, 'anchor', 2),
  ('engineer', 'Ingeniero', 'Reduce las perdidas de defensa en batalla un 50%. Aumenta la produccion de energia un 10%.', 'defense_loss_reduction', 50, 'energy_bonus', 10, 7500, 22500, 60000, 'wrench', 3),
  ('geologist', 'Geologo', 'Aumenta la produccion de todas las minas (metal, cristal, deuterio) en un 10%.', 'mine_bonus', 10, NULL, NULL, 7500, 22500, 60000, 'mountain', 4),
  ('technocrat', 'Tecnocrata', 'Aumenta el nivel efectivo de sondas espias en 2. Reduce el tiempo de investigacion un 25%.', 'spy_bonus', 2, 'research_time_reduction', 25, 10000, 30000, 80000, 'brain', 5)
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  bonus_type = EXCLUDED.bonus_type,
  bonus_value = EXCLUDED.bonus_value,
  bonus_secondary_type = EXCLUDED.bonus_secondary_type,
  bonus_secondary_value = EXCLUDED.bonus_secondary_value,
  dark_matter_cost_7d = EXCLUDED.dark_matter_cost_7d,
  dark_matter_cost_30d = EXCLUDED.dark_matter_cost_30d,
  dark_matter_cost_90d = EXCLUDED.dark_matter_cost_90d,
  icon = EXCLUDED.icon,
  sort_order = EXCLUDED.sort_order;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_user_officers_user_id ON user_officers(user_id);
CREATE INDEX IF NOT EXISTS idx_user_officers_expires_at ON user_officers(expires_at);
