/*
  # Admin Broadcast System
  
  1. New Features
    - Function to send mass in-game messages to all users
    - Tracks broadcast history for auditing
  
  2. Security
    - Only admins can execute broadcast functions
    - All broadcasts are logged with timestamp and sender
*/

-- Function to send broadcast message to all users (in-game messages)
CREATE OR REPLACE FUNCTION send_broadcast_message(
  p_subject text,
  p_body text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin_id uuid;
  v_recipient record;
  v_count integer := 0;
BEGIN
  -- Get admin user
  v_admin_id := auth.uid();
  
  IF v_admin_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;
  
  -- Verify admin
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = v_admin_id AND is_admin = true) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Admin access required');
  END IF;
  
  -- Send message to all active users
  FOR v_recipient IN 
    SELECT id FROM profiles WHERE id != v_admin_id
  LOOP
    INSERT INTO messages (
      sender_id,
      recipient_id,
      subject,
      body,
      message_type,
      topic,
      is_read
    ) VALUES (
      v_admin_id,
      v_recipient.id,
      p_subject,
      p_body,
      'system',
      'broadcast',
      false
    );
    
    v_count := v_count + 1;
  END LOOP;
  
  RETURN jsonb_build_object(
    'success', true,
    'messages_sent', v_count
  );
END;
$$;

-- Function to get all user emails for mass email (admin only)
CREATE OR REPLACE FUNCTION get_all_user_emails()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin_id uuid;
  v_emails jsonb;
BEGIN
  v_admin_id := auth.uid();
  
  IF v_admin_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = v_admin_id AND is_admin = true) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Admin access required');
  END IF;
  
  SELECT jsonb_agg(jsonb_build_object('id', u.id, 'email', u.email, 'username', p.username))
  INTO v_emails
  FROM auth.users u
  JOIN profiles p ON p.id = u.id
  WHERE u.email IS NOT NULL;
  
  RETURN jsonb_build_object(
    'success', true,
    'users', COALESCE(v_emails, '[]'::jsonb)
  );
END;
$$;
