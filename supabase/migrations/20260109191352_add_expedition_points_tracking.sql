/*
  # Add Expedition Points Tracking

  1. Changes
    - Add `points_expedition` column to profiles table for tracking expedition performance
    - Add `rank_expedition` column to profiles table for expedition ranking
    - Update the ranking update function to include expedition rankings
    
  2. Security
    - No RLS changes needed as profiles table already has proper policies
*/

-- Add expedition points and rank columns
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'points_expedition'
  ) THEN
    ALTER TABLE profiles ADD COLUMN points_expedition integer DEFAULT 0;
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'rank_expedition'
  ) THEN
    ALTER TABLE profiles ADD COLUMN rank_expedition integer DEFAULT 0;
  END IF;
END $$;

-- Update the ranking function to include expedition rankings
CREATE OR REPLACE FUNCTION update_all_rankings()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Update total points ranking
  WITH ranked AS (
    SELECT id, ROW_NUMBER() OVER (ORDER BY points_total DESC, created_at ASC) as new_rank
    FROM profiles
    WHERE is_admin IS NOT TRUE AND is_hidden IS NOT TRUE
  )
  UPDATE profiles p
  SET rank_position = r.new_rank
  FROM ranked r
  WHERE p.id = r.id;

  -- Update buildings ranking
  WITH ranked AS (
    SELECT id, ROW_NUMBER() OVER (ORDER BY points_buildings DESC, created_at ASC) as new_rank
    FROM profiles
    WHERE is_admin IS NOT TRUE AND is_hidden IS NOT TRUE
  )
  UPDATE profiles p
  SET rank_buildings = r.new_rank
  FROM ranked r
  WHERE p.id = r.id;

  -- Update research ranking
  WITH ranked AS (
    SELECT id, ROW_NUMBER() OVER (ORDER BY points_research DESC, created_at ASC) as new_rank
    FROM profiles
    WHERE is_admin IS NOT TRUE AND is_hidden IS NOT TRUE
  )
  UPDATE profiles p
  SET rank_research = r.new_rank
  FROM ranked r
  WHERE p.id = r.id;

  -- Update fleet ranking
  WITH ranked AS (
    SELECT id, ROW_NUMBER() OVER (ORDER BY points_fleet DESC, created_at ASC) as new_rank
    FROM profiles
    WHERE is_admin IS NOT TRUE AND is_hidden IS NOT TRUE
  )
  UPDATE profiles p
  SET rank_fleet = r.new_rank
  FROM ranked r
  WHERE p.id = r.id;

  -- Update defense ranking
  WITH ranked AS (
    SELECT id, ROW_NUMBER() OVER (ORDER BY points_defense DESC, created_at ASC) as new_rank
    FROM profiles
    WHERE is_admin IS NOT TRUE AND is_hidden IS NOT TRUE
  )
  UPDATE profiles p
  SET rank_defense = r.new_rank
  FROM ranked r
  WHERE p.id = r.id;

  -- Update expedition ranking
  WITH ranked AS (
    SELECT id, ROW_NUMBER() OVER (ORDER BY points_expedition DESC, created_at ASC) as new_rank
    FROM profiles
    WHERE is_admin IS NOT TRUE AND is_hidden IS NOT TRUE
  )
  UPDATE profiles p
  SET rank_expedition = r.new_rank
  FROM ranked r
  WHERE p.id = r.id;
END;
$$;

-- Update expedition points when returning from expedition
CREATE OR REPLACE FUNCTION add_expedition_points(p_user_id uuid, p_points integer)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE profiles
  SET points_expedition = COALESCE(points_expedition, 0) + p_points
  WHERE id = p_user_id;
END;
$$;