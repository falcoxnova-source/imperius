CREATE OR REPLACE FUNCTION public.send_broadcast_message(p_subject text, p_body text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
      message_type,
      is_read
    ) VALUES (
      v_admin_id,
      v_recipient.id,
      p_subject,
      p_body,
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
$function$

