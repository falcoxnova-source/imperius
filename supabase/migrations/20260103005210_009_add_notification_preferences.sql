/*
  # Add Notification Preferences

  1. Changes
    - Add notification preference columns to profiles table
      - `notify_attacks` (boolean) - Notify when attacks are incoming
      - `notify_buildings` (boolean) - Notify when buildings are completed
      - `notify_research` (boolean) - Notify when research is completed
      - `notify_messages` (boolean) - Notify when new messages arrive
  
  2. Notes
    - All notification preferences default to true (enabled)
    - Follows XNova/OGame original settings structure
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'notify_attacks'
  ) THEN
    ALTER TABLE profiles 
    ADD COLUMN notify_attacks boolean DEFAULT true,
    ADD COLUMN notify_buildings boolean DEFAULT true,
    ADD COLUMN notify_research boolean DEFAULT true,
    ADD COLUMN notify_messages boolean DEFAULT true;
  END IF;
END $$;