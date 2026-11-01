CREATE OR REPLACE FUNCTION public.calculate_building_points(p_user_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
DECLARE
  v_total_cost bigint := 0;
  v_record record;
BEGIN
  FOR v_record IN
    SELECT 
      bt.base_metal,
      bt.base_crystal,
      bt.base_deuterium,
      bt.cost_factor,
      pb.level
    FROM public.planet_buildings pb
    JOIN public.planets p ON pb.planet_id = p.id
    JOIN public.building_types bt ON pb.building_type_id = bt.id
    WHERE p.user_id = p_user_id AND pb.level > 0
  LOOP
    v_total_cost := v_total_cost + public.calculate_building_total_cost(
      v_record.base_metal,
      v_record.base_crystal,
      v_record.base_deuterium,
      v_record.cost_factor::numeric,
      v_record.level
    );
  END LOOP;
  
  RETURN floor(v_total_cost / 1000)::integer;
END;
$function$

