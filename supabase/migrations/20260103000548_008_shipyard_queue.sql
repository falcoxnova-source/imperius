/*
  # Shipyard Construction Queue

  1. New Tables
    - `shipyard_queue`
      - `id` (uuid, primary key)
      - `planet_id` (uuid, references planets)
      - `item_type` (text: 'ship' or 'defense')
      - `ship_type_id` (integer, nullable, references ship_types)
      - `defense_type_id` (integer, nullable, references defense_types)
      - `quantity` (integer)
      - `quantity_completed` (integer, default 0)
      - `metal_cost` (bigint)
      - `crystal_cost` (bigint)
      - `deuterium_cost` (bigint)
      - `build_time_per_unit` (integer, seconds per unit)
      - `queue_position` (integer)
      - `start_time` (timestamptz, nullable)
      - `current_unit_end_time` (timestamptz, nullable)
      - `created_at` (timestamptz)

  2. Security
    - Enable RLS on `shipyard_queue` table
    - Add policies for authenticated users to manage their own queue

  3. Notes
    - Ships and defenses share the same construction queue
    - Units are built one at a time sequentially
    - quantity_completed tracks how many units have been built from total quantity
*/

CREATE TABLE IF NOT EXISTS shipyard_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  planet_id uuid NOT NULL REFERENCES planets(id) ON DELETE CASCADE,
  item_type text NOT NULL CHECK (item_type IN ('ship', 'defense')),
  ship_type_id integer REFERENCES ship_types(id),
  defense_type_id integer REFERENCES defense_types(id),
  quantity integer NOT NULL CHECK (quantity > 0),
  quantity_completed integer NOT NULL DEFAULT 0,
  metal_cost bigint NOT NULL DEFAULT 0,
  crystal_cost bigint NOT NULL DEFAULT 0,
  deuterium_cost bigint NOT NULL DEFAULT 0,
  build_time_per_unit integer NOT NULL DEFAULT 0,
  queue_position integer NOT NULL DEFAULT 1,
  start_time timestamptz,
  current_unit_end_time timestamptz,
  created_at timestamptz DEFAULT now(),
  CONSTRAINT valid_item_type CHECK (
    (item_type = 'ship' AND ship_type_id IS NOT NULL AND defense_type_id IS NULL) OR
    (item_type = 'defense' AND defense_type_id IS NOT NULL AND ship_type_id IS NULL)
  )
);

ALTER TABLE shipyard_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own planet shipyard queue"
  ON shipyard_queue
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM planets
      WHERE planets.id = shipyard_queue.planet_id
      AND planets.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert to own planet shipyard queue"
  ON shipyard_queue
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM planets
      WHERE planets.id = shipyard_queue.planet_id
      AND planets.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update own planet shipyard queue"
  ON shipyard_queue
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM planets
      WHERE planets.id = shipyard_queue.planet_id
      AND planets.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM planets
      WHERE planets.id = shipyard_queue.planet_id
      AND planets.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete from own planet shipyard queue"
  ON shipyard_queue
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM planets
      WHERE planets.id = shipyard_queue.planet_id
      AND planets.user_id = auth.uid()
    )
  );

CREATE INDEX IF NOT EXISTS idx_shipyard_queue_planet_id ON shipyard_queue(planet_id);
CREATE INDEX IF NOT EXISTS idx_shipyard_queue_position ON shipyard_queue(planet_id, queue_position);