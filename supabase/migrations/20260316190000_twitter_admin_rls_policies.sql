/*
  # Twitter Admin RLS Policies

  Problem: The twitter_actions and twitter_links tables have RLS policies 
  that only allow users to see their own rows. This means admins cannot 
  see pending actions from other players in the admin panel.

  Solution: Add SELECT and UPDATE policies for admins on twitter_actions
  and SELECT policy for admins on twitter_links, following the same 
  pattern used in other admin tables (e.g., login_sessions, suspicious_accounts).
*/

DO $$
BEGIN
  -- Admin can view ALL twitter actions (not just their own)
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'Admins can view all twitter actions' AND tablename = 'twitter_actions'
  ) THEN
    CREATE POLICY "Admins can view all twitter actions"
      ON twitter_actions FOR SELECT
      TO authenticated
      USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true));
  END IF;

  -- Admin can update twitter actions (to mark as validated)
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'Admins can update twitter actions' AND tablename = 'twitter_actions'
  ) THEN
    CREATE POLICY "Admins can update twitter actions"
      ON twitter_actions FOR UPDATE
      TO authenticated
      USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true))
      WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true));
  END IF;

  -- Admin can view ALL twitter links
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'Admins can view all twitter links' AND tablename = 'twitter_links'
  ) THEN
    CREATE POLICY "Admins can view all twitter links"
      ON twitter_links FOR SELECT
      TO authenticated
      USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true));
  END IF;
END $$;
