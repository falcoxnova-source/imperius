-- =====================================================================
-- Fix: restablecimiento de contrasena por token
-- Fecha: 2026-09-13
--
-- Problemas corregidos:
--   1) El mensaje "Token invalido o expirado" no distingue entre un
--      enlace caducado, uno ya usado y uno inexistente, lo que hace
--      imposible que el usuario sepa que debe pedir uno nuevo.
--   2) El consumo del token no era atomico: la contrasena se cambiaba
--      ANTES de marcar el token como usado, dejando una ventana de
--      reutilizacion (replay) si dos peticiones llegaban a la vez.
--
-- Sin cambios de firma, de seguridad ni de permisos:
--   - Misma signatura (text, text) -> jsonb, mismo SECURITY DEFINER,
--     mismo search_path. CREATE OR REPLACE conserva los GRANT actuales
--     (anon = NO, authenticated = SI, service_role = SI).
--   - El campo 'success' y 'error' se mantienen, por lo que el frontend
--     actual sigue funcionando sin necesidad de redesplegar.
--   - Los tokens son cadenas aleatorias de 64 caracteres: detallar el
--     motivo del fallo no permite enumerar usuarios ni adivinar tokens.
-- =====================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.reset_user_password_by_token(
  p_token text,
  p_new_password text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'auth', 'extensions'
AS $function$
DECLARE
  v_token   record;
  v_claimed record;
BEGIN
  IF p_new_password IS NULL OR length(p_new_password) < 6 THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'La contrasena debe tener al menos 6 caracteres',
      'reason', 'weak_password');
  END IF;

  IF p_token IS NULL OR length(btrim(p_token)) = 0 THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'El enlace no es valido. Solicita uno nuevo desde "Olvide mi contrasena".',
      'reason', 'not_found');
  END IF;

  SELECT * INTO v_token
  FROM email_verification_tokens
  WHERE token = btrim(p_token)
    AND type = 'password_reset';

  IF v_token IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'El enlace no es valido o fue reemplazado por uno mas reciente. '
            || 'Revisa el ultimo correo que recibiste o solicita uno nuevo.',
      'reason', 'not_found');
  END IF;

  IF v_token.used_at IS NOT NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Este enlace ya fue utilizado. Solicita uno nuevo desde "Olvide mi contrasena".',
      'reason', 'used');
  END IF;

  IF v_token.expires_at <= now() THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'El enlace ha caducado. Solicita uno nuevo desde "Olvide mi contrasena".',
      'reason', 'expired');
  END IF;

  -- Consumo atomico: si otra peticion gano la carrera, aqui no habra fila.
  UPDATE email_verification_tokens
  SET used_at = now()
  WHERE id = v_token.id
    AND used_at IS NULL
    AND expires_at > now()
  RETURNING * INTO v_claimed;

  IF v_claimed IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Este enlace ya fue utilizado. Solicita uno nuevo desde "Olvide mi contrasena".',
      'reason', 'used');
  END IF;

  UPDATE auth.users
  SET encrypted_password = crypt(p_new_password, gen_salt('bf', 10)),
      updated_at = now()
  WHERE id = v_claimed.user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'usuario asociado al token no existe';
  END IF;

  RETURN jsonb_build_object('success', true);
END;
$function$;

COMMIT;
