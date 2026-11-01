/*
  # Building Construction Queue System
  
  1. New Tables
    - `building_queue`
      - `id` (uuid, primary key)
      - `planet_id` (uuid, references planets)
      - `building_type_id` (int, references building_types)
      - `target_level` (int) - the level being built to
      - `metal_cost` (bigint) - resources already deducted
      - `crystal_cost` (bigint)
      - `deuterium_cost` (bigint)
      - `build_time` (int) - time in seconds
      - `queue_position` (int) - 1-5 position in queue
      - `start_time` (timestamptz) - when construction started (null if waiting)
      - `end_time` (timestamptz) - when construction ends (null if waiting)
      - `created_at` (timestamptz)
  
  2. Changes
    - Maximum 5 items per planet in queue
    - Resources deducted when added to queue
    - First item starts immediately if nothing building
  
  3. Security
    - Enable RLS on building_queue table
    - Policies for authenticated users to manage their own queues
*/

CREATE TABLE IF NOT EXISTS building_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  planet_id uuid NOT NULL REFERENCES planets(id) ON DELETE CASCADE,
  building_type_id int NOT NULL REFERENCES building_types(id),
  target_level int NOT NULL DEFAULT 1,
  metal_cost bigint NOT NULL DEFAULT 0,
  crystal_cost bigint NOT NULL DEFAULT 0,
  deuterium_cost bigint NOT NULL DEFAULT 0,
  build_time int NOT NULL DEFAULT 0,
  queue_position int NOT NULL DEFAULT 1,
  start_time timestamptz,
  end_time timestamptz,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE building_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own building queues"
  ON building_queue FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM planets
      WHERE planets.id = building_queue.planet_id
      AND planets.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert to own building queues"
  ON building_queue FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM planets
      WHERE planets.id = building_queue.planet_id
      AND planets.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update own building queues"
  ON building_queue FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM planets
      WHERE planets.id = building_queue.planet_id
      AND planets.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM planets
      WHERE planets.id = building_queue.planet_id
      AND planets.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete from own building queues"
  ON building_queue FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM planets
      WHERE planets.id = building_queue.planet_id
      AND planets.user_id = auth.uid()
    )
  );

CREATE INDEX IF NOT EXISTS idx_building_queue_planet ON building_queue(planet_id);
CREATE INDEX IF NOT EXISTS idx_building_queue_position ON building_queue(planet_id, queue_position);
