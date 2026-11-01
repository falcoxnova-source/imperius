/*
  # Fix Broadcast Message Function - Missing Required Columns
  
  1. Problem
    - The send_broadcast_message function was failing silently
    - The messages table requires 'topic' and 'extension' columns (NOT NULL)
    - The function was not providing values for these required columns
  
  2. Solution
    - Add 'topic' column with value 'broadcast'
    - Add 'extension' column with empty string as default
*/

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
  v_admin_id := auth.uid();
  
  IF v_admin_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = v_admin_id AND is_admin = true) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Admin access required');
  END IF;
  
  FOR v_recipient IN 
    SELECT id FROM profiles WHERE id != v_admin_id
  LOOP
    INSERT INTO messages (
      sender_id,
      recipient_id,
      subject,
      body,
      topic,
      extension,
      message_type,
      is_read,
      created_at
    ) VALUES (
      v_admin_id,
      v_recipient.id,
      p_subject,
      p_body,
      'broadcast',
      '',
      'system',
      false,
      now()
    );
    
    v_count := v_count + 1;
  END LOOP;
  
  RETURN jsonb_build_object(
    'success', true,
    'messages_sent', v_count
  );
END;
$$;
