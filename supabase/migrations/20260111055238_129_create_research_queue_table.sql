/*
  # Create Research Queue Table

  ## Problem
  The research_queue table does not exist but is referenced by several functions
  including instant_complete_research. This causes errors when users try to 
  complete research instantly.

  ## Solution
  Create the research_queue table with the proper structure to match the 
  existing building_queue pattern.

  ## New Table
  - research_queue: Stores pending and in-progress research items
*/

CREATE TABLE IF NOT EXISTS research_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  technology_type_id integer NOT NULL REFERENCES technology_types(id),
  target_level integer NOT NULL DEFAULT 1,
  metal_cost bigint NOT NULL DEFAULT 0,
  crystal_cost bigint NOT NULL DEFAULT 0,
  deuterium_cost bigint NOT NULL DEFAULT 0,
  research_time integer NOT NULL DEFAULT 0,
  queue_position integer NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'cancelled')),
  start_time timestamptz,
  end_time timestamptz,
  planet_id uuid REFERENCES planets(id),
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_research_queue_user_id ON research_queue(user_id);
CREATE INDEX IF NOT EXISTS idx_research_queue_status ON research_queue(status);
CREATE INDEX IF NOT EXISTS idx_research_queue_end_time ON research_queue(end_time);

ALTER TABLE research_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own research queue"
  ON research_queue FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own research queue"
  ON research_queue FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own research queue"
  ON research_queue FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own research queue"
  ON research_queue FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);
