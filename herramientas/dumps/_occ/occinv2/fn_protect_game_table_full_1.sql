CREATE OR REPLACE FUNCTION public.protect_game_table_full()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  v_cu text := current_user;
BEGIN
  -- Bypass para roles no expuestos al cliente (postgres, service_role, etc.)
  IF v_cu NOT IN ('authenticated', 'anon') THEN
    RETURN NEW;
  END IF;

  -- Bypass de emergencia compatible con el patr??n existente.
  IF current_setting('fxu.allow_update_9x7k2m', true) = 'true' THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION
    'SECURITY_VIOLATION: Direct UPDATE on % from client is not allowed. Use the proper RPC. Code: GAME001',
    TG_TABLE_NAME
    USING ERRCODE = 'insufficient_privilege';
END;
$function$

