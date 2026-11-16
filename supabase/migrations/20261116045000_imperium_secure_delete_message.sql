/*
  Imperium: borrar un mensaje individual no hacia nada.

  El frontend (MessagesPage) llama secure_delete_message(p_message_id), pero la
  funcion no existia en imperium-db: la llamada fallaba en silencio, el mensaje
  desaparecia solo de la pantalla y seguia en la campana / al recargar.

  Mismas reglas que secure_delete_all_my_messages: el destinatario puede borrar
  lo recibido y el remitente lo enviado.
*/
CREATE OR REPLACE FUNCTION public.secure_delete_message(p_message_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user_id uuid := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  DELETE FROM messages
  WHERE id = p_message_id
    AND (recipient_id = v_user_id OR sender_id = v_user_id);

  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION public.secure_delete_message(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.secure_delete_message(uuid) TO authenticated;
