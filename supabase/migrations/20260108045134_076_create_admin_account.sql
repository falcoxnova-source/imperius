/*
  # Create Admin Account

  Creates the hidden admin account with:
  - Username: admin
  - Email: admin@falco-x.local
  - is_admin: true
  - is_hidden: true (excluded from rankings)

  The password is set via Supabase Auth.
*/

-- This migration only prepares the profile flag
-- The actual user creation happens through the auth system
-- We'll create a function to set up the admin after auth registration

CREATE OR REPLACE FUNCTION setup_admin_user(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE profiles
  SET 
    is_admin = true,
    is_hidden = true
  WHERE id = p_user_id;
END;
$$;