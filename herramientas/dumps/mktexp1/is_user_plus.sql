CREATE OR REPLACE FUNCTION public.is_user_plus(p_user_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM plus_subscriptions
    WHERE user_id = p_user_id
      AND is_active = true
      AND expires_at > now()
  );
END;
$function$

