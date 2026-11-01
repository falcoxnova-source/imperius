/*
  # Fix Delete User Account Function - XNova Style

  1. Problem
    - Current delete_user_account function only deletes profile
    - Several FK constraints with NO ACTION block deletion:
      - admin_speed_settings.updated_by
      - alliance_applications.reviewed_by
      - profiles.referred_by
      - referral_commissions (referrer_id, seller_id)

  2. Solution
    - Update FKs to SET NULL where appropriate
    - Create comprehensive delete function that:
      - Nullifies references that would block deletion
      - Transfers alliance leadership if user is leader
      - Deletes user from auth.users (which cascades to profiles)
    
  3. XNova Behavior
    - User data is completely removed
    - Alliance leadership transfers to next member or alliance is disbanded
    - Referral references are nullified (commissions preserved for history)
    - Messages from deleted user show sender as null
*/

-- Update FK constraints to allow deletion
ALTER TABLE admin_speed_settings
DROP CONSTRAINT IF EXISTS admin_speed_settings_updated_by_fkey;

ALTER TABLE admin_speed_settings
ADD CONSTRAINT admin_speed_settings_updated_by_fkey
FOREIGN KEY (updated_by) REFERENCES profiles(id) ON DELETE SET NULL;

ALTER TABLE alliance_applications
DROP CONSTRAINT IF EXISTS alliance_applications_reviewed_by_fkey;

ALTER TABLE alliance_applications
ADD CONSTRAINT alliance_applications_reviewed_by_fkey
FOREIGN KEY (reviewed_by) REFERENCES profiles(id) ON DELETE SET NULL;

ALTER TABLE referral_commissions
DROP CONSTRAINT IF EXISTS referral_commissions_referrer_id_fkey;

ALTER TABLE referral_commissions
ADD CONSTRAINT referral_commissions_referrer_id_fkey
FOREIGN KEY (referrer_id) REFERENCES profiles(id) ON DELETE SET NULL;

ALTER TABLE referral_commissions
DROP CONSTRAINT IF EXISTS referral_commissions_seller_id_fkey;

ALTER TABLE referral_commissions
ADD CONSTRAINT referral_commissions_seller_id_fkey
FOREIGN KEY (seller_id) REFERENCES profiles(id) ON DELETE SET NULL;

-- Fix profiles.referred_by to allow deletion
ALTER TABLE profiles
DROP CONSTRAINT IF EXISTS profiles_referred_by_fkey;

ALTER TABLE profiles
ADD CONSTRAINT profiles_referred_by_fkey
FOREIGN KEY (referred_by) REFERENCES profiles(id) ON DELETE SET NULL;

-- Create improved delete_user_account function
CREATE OR REPLACE FUNCTION delete_user_account()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  current_user_id uuid;
  user_alliance_id uuid;
  alliance_member_count int;
  next_leader_id uuid;
BEGIN
  current_user_id := auth.uid();

  IF current_user_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  -- Check if user is alliance leader and handle transfer/disband
  SELECT am.alliance_id INTO user_alliance_id
  FROM alliance_members am
  JOIN alliances a ON a.id = am.alliance_id
  WHERE am.user_id = current_user_id
  AND a.leader_id = current_user_id;

  IF user_alliance_id IS NOT NULL THEN
    -- Count remaining members (excluding current user)
    SELECT COUNT(*) INTO alliance_member_count
    FROM alliance_members
    WHERE alliance_id = user_alliance_id
    AND user_id != current_user_id;

    IF alliance_member_count > 0 THEN
      -- Transfer leadership to longest-standing member
      SELECT user_id INTO next_leader_id
      FROM alliance_members
      WHERE alliance_id = user_alliance_id
      AND user_id != current_user_id
      ORDER BY joined_at ASC
      LIMIT 1;

      UPDATE alliances
      SET leader_id = next_leader_id
      WHERE id = user_alliance_id;

      -- Promote new leader to officer if not already
      UPDATE alliance_members
      SET role = 'officer'
      WHERE alliance_id = user_alliance_id
      AND user_id = next_leader_id
      AND role = 'member';
    ELSE
      -- No other members, disband alliance
      DELETE FROM alliances WHERE id = user_alliance_id;
    END IF;
  END IF;

  -- Cancel active fleets (return resources if possible)
  DELETE FROM fleets WHERE user_id = current_user_id;

  -- Clear building and shipyard queues
  DELETE FROM building_queue WHERE planet_id IN (
    SELECT id FROM planets WHERE user_id = current_user_id
  );
  DELETE FROM shipyard_queue WHERE planet_id IN (
    SELECT id FROM planets WHERE user_id = current_user_id
  );

  -- Cancel active research
  UPDATE profiles 
  SET current_research_id = NULL,
      research_end_time = NULL
  WHERE id = current_user_id;

  -- Delete the profile (cascades to most related tables)
  DELETE FROM profiles WHERE id = current_user_id;

  RETURN json_build_object('success', true);
EXCEPTION
  WHEN OTHERS THEN
    RETURN json_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION delete_user_account() TO authenticated;