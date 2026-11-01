/*
  # Set alliance member limit to 3 (test phase)

  Changes:
  - can_alliance_accept_member: 5 → 3
  - accept_alliance_application: ya estaba en 3
  - join_open_alliance: ya estaba en 3
*/

CREATE OR REPLACE FUNCTION public.can_alliance_accept_member(p_alliance_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_member_count int;
  v_max_members int := 3;
BEGIN
  SELECT COUNT(*) INTO v_member_count
  FROM alliance_members
  WHERE alliance_id = p_alliance_id;
  
  RETURN v_member_count < v_max_members;
END;
$function$;
