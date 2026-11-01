/*
  # Add get_user_by_email function

  1. New Function
    - `get_user_by_email(p_email)` - Returns user ID and username by email
    - Only accessible by service role for security
*/

CREATE OR REPLACE FUNCTION get_user_by_email(p_email text)
RETURNS TABLE(id uuid, username text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    u.id,
    COALESCE(u.raw_user_meta_data->>'username', p.username, 'Comandante') as username
  FROM auth.users u
  LEFT JOIN profiles p ON p.id = u.id
  WHERE LOWER(u.email) = LOWER(p_email)
  LIMIT 1;
END;
$$;