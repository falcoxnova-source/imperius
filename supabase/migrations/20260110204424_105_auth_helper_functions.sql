/*
  # Auth Helper Functions
  
  1. Functions
    - `get_user_by_email_for_verification` - Get user info by email for verification resend
    - `admin_update_user_password` - Update user password (for reset flow)
*/

CREATE OR REPLACE FUNCTION public.get_user_by_email_for_verification(p_email text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_username text;
BEGIN
  SELECT au.id, COALESCE(au.raw_user_meta_data->>'username', p.username, 'Comandante')
  INTO v_user_id, v_username
  FROM auth.users au
  LEFT JOIN profiles p ON p.id = au.id
  WHERE au.email = p_email
  LIMIT 1;
  
  IF v_user_id IS NULL THEN
    RETURN NULL;
  END IF;
  
  RETURN jsonb_build_object('user_id', v_user_id, 'username', v_username);
END;
$$;