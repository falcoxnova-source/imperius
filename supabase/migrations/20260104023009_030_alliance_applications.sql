/*
  # Alliance Applications System
  
  1. New Tables
    - `alliance_applications`
      - `id` (uuid, primary key)
      - `alliance_id` (uuid, references alliances)
      - `user_id` (uuid, references profiles)
      - `message` (text) - Application message
      - `status` (text) - pending/accepted/rejected
      - `created_at` (timestamp)
      - `reviewed_at` (timestamp)
      - `reviewed_by` (uuid, references profiles)
  
  2. New Columns
    - Add `is_open` to alliances table (if true, users can join directly)
  
  3. Security
    - RLS policies for alliance applications
*/

-- Add is_open column to alliances (open alliances allow direct joining)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'alliances' AND column_name = 'is_open'
  ) THEN
    ALTER TABLE alliances ADD COLUMN is_open boolean DEFAULT true;
  END IF;
END $$;

-- Create alliance_applications table
CREATE TABLE IF NOT EXISTS alliance_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  alliance_id uuid REFERENCES alliances(id) ON DELETE CASCADE,
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  message text DEFAULT '',
  status text DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected')),
  created_at timestamptz DEFAULT now(),
  reviewed_at timestamptz,
  reviewed_by uuid REFERENCES profiles(id),
  UNIQUE(alliance_id, user_id)
);

ALTER TABLE alliance_applications ENABLE ROW LEVEL SECURITY;

-- Anyone can view their own applications
CREATE POLICY "Users can view own applications"
  ON alliance_applications FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- Alliance members with can_invite can view applications
CREATE POLICY "Alliance admins can view applications"
  ON alliance_applications FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM alliance_members
      WHERE alliance_members.alliance_id = alliance_applications.alliance_id
      AND alliance_members.user_id = auth.uid()
      AND alliance_members.can_invite = true
    )
  );

-- Users can create applications
CREATE POLICY "Users can apply to alliances"
  ON alliance_applications FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND NOT EXISTS (
      SELECT 1 FROM alliance_members
      WHERE alliance_members.user_id = auth.uid()
    )
  );

-- Users can delete their own pending applications
CREATE POLICY "Users can cancel own pending applications"
  ON alliance_applications FOR DELETE
  TO authenticated
  USING (user_id = auth.uid() AND status = 'pending');

-- Alliance admins can update applications (accept/reject)
CREATE POLICY "Alliance admins can update applications"
  ON alliance_applications FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM alliance_members
      WHERE alliance_members.alliance_id = alliance_applications.alliance_id
      AND alliance_members.user_id = auth.uid()
      AND alliance_members.can_invite = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM alliance_members
      WHERE alliance_members.alliance_id = alliance_applications.alliance_id
      AND alliance_members.user_id = auth.uid()
      AND alliance_members.can_invite = true
    )
  );

-- Add policy for alliance members to update their rank (for promotions by leaders)
DROP POLICY IF EXISTS "Alliance leaders can update members" ON alliance_members;
CREATE POLICY "Alliance leaders can update members"
  ON alliance_members FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM alliance_members am
      WHERE am.alliance_id = alliance_members.alliance_id
      AND am.user_id = auth.uid()
      AND (am.can_kick = true OR am.rank_level >= 8)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM alliance_members am
      WHERE am.alliance_id = alliance_members.alliance_id
      AND am.user_id = auth.uid()
      AND (am.can_kick = true OR am.rank_level >= 8)
    )
  );

-- Add policy for alliance admins to kick members
DROP POLICY IF EXISTS "Alliance admins can kick members" ON alliance_members;
CREATE POLICY "Alliance admins can kick members"
  ON alliance_members FOR DELETE
  TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM alliance_members am
      WHERE am.alliance_id = alliance_members.alliance_id
      AND am.user_id = auth.uid()
      AND am.can_kick = true
      AND am.rank_level > alliance_members.rank_level
    )
  );

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_alliance_applications_alliance ON alliance_applications(alliance_id, status);
CREATE INDEX IF NOT EXISTS idx_alliance_applications_user ON alliance_applications(user_id);
