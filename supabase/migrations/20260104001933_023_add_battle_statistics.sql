/*
  # Add Battle Statistics to Profiles

  1. New Columns in `profiles`
    - `battles_won` (integer) - Number of battles won
    - `battles_draw` (integer) - Number of battles ended in draw
    - `battles_lost` (integer) - Number of battles lost
    - `units_destroyed` (bigint) - Total units destroyed in combat
    - `units_lost` (bigint) - Total units lost in combat
    - `debris_metal_total` (bigint) - Total metal generated in debris fields
    - `debris_crystal_total` (bigint) - Total crystal generated in debris fields
    - `rank_buildings` (integer) - Rank position for buildings
    - `rank_research` (integer) - Rank position for research
    - `rank_fleet` (integer) - Rank position for fleet
    - `rank_defense` (integer) - Rank position for defense

  2. Security
    - No RLS changes needed, profiles table already has RLS enabled
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'battles_won'
  ) THEN
    ALTER TABLE profiles ADD COLUMN battles_won integer DEFAULT 0;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'battles_draw'
  ) THEN
    ALTER TABLE profiles ADD COLUMN battles_draw integer DEFAULT 0;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'battles_lost'
  ) THEN
    ALTER TABLE profiles ADD COLUMN battles_lost integer DEFAULT 0;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'units_destroyed'
  ) THEN
    ALTER TABLE profiles ADD COLUMN units_destroyed bigint DEFAULT 0;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'units_lost'
  ) THEN
    ALTER TABLE profiles ADD COLUMN units_lost bigint DEFAULT 0;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'debris_metal_total'
  ) THEN
    ALTER TABLE profiles ADD COLUMN debris_metal_total bigint DEFAULT 0;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'debris_crystal_total'
  ) THEN
    ALTER TABLE profiles ADD COLUMN debris_crystal_total bigint DEFAULT 0;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'rank_buildings'
  ) THEN
    ALTER TABLE profiles ADD COLUMN rank_buildings integer DEFAULT 0;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'rank_research'
  ) THEN
    ALTER TABLE profiles ADD COLUMN rank_research integer DEFAULT 0;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'rank_fleet'
  ) THEN
    ALTER TABLE profiles ADD COLUMN rank_fleet integer DEFAULT 0;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'rank_defense'
  ) THEN
    ALTER TABLE profiles ADD COLUMN rank_defense integer DEFAULT 0;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION update_all_ranks()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  WITH ranked AS (
    SELECT id,
      ROW_NUMBER() OVER (ORDER BY points_total DESC) as rank_total,
      ROW_NUMBER() OVER (ORDER BY points_buildings DESC) as rank_b,
      ROW_NUMBER() OVER (ORDER BY points_research DESC) as rank_r,
      ROW_NUMBER() OVER (ORDER BY points_fleet DESC) as rank_f,
      ROW_NUMBER() OVER (ORDER BY points_defense DESC) as rank_d
    FROM profiles
  )
  UPDATE profiles p
  SET 
    rank_position = r.rank_total,
    rank_buildings = r.rank_b,
    rank_research = r.rank_r,
    rank_fleet = r.rank_f,
    rank_defense = r.rank_d
  FROM ranked r
  WHERE p.id = r.id;
END;
$$;

SELECT update_all_ranks();