/*
  # Auto Setup Admin on Registration

  Creates a trigger that automatically sets is_admin and is_hidden flags
  when a user registers with username "admin".

  This is a one-time setup - the admin account will be hidden and
  have full admin privileges upon registration.
*/

CREATE OR REPLACE FUNCTION check_and_setup_admin()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.username = 'admin' THEN
    NEW.is_admin := true;
    NEW.is_hidden := true;
  END IF;
  
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS setup_admin_trigger ON profiles;

CREATE TRIGGER setup_admin_trigger
  BEFORE INSERT OR UPDATE ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION check_and_setup_admin();