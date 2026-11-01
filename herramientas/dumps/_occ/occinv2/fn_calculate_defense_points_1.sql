CREATE OR REPLACE FUNCTION public.calculate_defense_points(p_user_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
DECLARE
  v_total_cost bigint := 0;
BEGIN
  SELECT COALESCE(SUM(
    (dt.metal_cost + dt.crystal_cost + dt.deuterium_cost)::bigint * pd.quantity
  ), 0) INTO v_total_cost
  FROM public.planet_defenses pd
  JOIN public.planets p ON pd.planet_id = p.id
  JOIN public.defense_types dt ON pd.defense_type_id = dt.id
  WHERE p.user_id = p_user_id AND pd.quantity > 0;
  
  RETURN floor(v_total_cost / 1000)::integer;
END;
$function$

