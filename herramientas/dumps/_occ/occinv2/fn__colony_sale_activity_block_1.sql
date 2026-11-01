CREATE OR REPLACE FUNCTION public._colony_sale_activity_block(p_seller uuid, p_planet_id uuid, p_moon_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_ids uuid[] := array_remove(ARRAY[p_planet_id, p_moon_id], NULL);
  v_g integer;
  v_s integer;
  v_p integer;
BEGIN
  SELECT galaxy, solar_system, position INTO v_g, v_s, v_p FROM planets WHERE id = p_planet_id;

  IF EXISTS (SELECT 1 FROM building_queue WHERE planet_id = ANY (v_ids)) THEN
    RETURN 'hay construcciones en cola en la colonia o su luna';
  END IF;
  IF EXISTS (SELECT 1 FROM shipyard_queue WHERE planet_id = ANY (v_ids)) THEN
    RETURN 'hay produccion de hangar en cola en la colonia o su luna';
  END IF;
  IF EXISTS (SELECT 1 FROM research_queue WHERE planet_id = ANY (v_ids)) THEN
    RETURN 'hay investigaciones en cola en la colonia o su luna';
  END IF;
  IF EXISTS (SELECT 1 FROM user_technologies
             WHERE user_id = p_seller AND COALESCE(is_researching, false)
               AND research_planet_id = ANY (v_ids)) THEN
    RETURN 'hay una investigacion en curso en la colonia o su luna';
  END IF;
  -- [COLMKT3] Las flotas que SALIERON de la colonia/luna ya no bloquean:
  -- purchase_colony_listing las redirige al planeta principal del vendedor.
  IF EXISTS (SELECT 1 FROM fleets
             WHERE NOT COALESCE(is_completed, false)
               AND user_id = p_seller
               AND target_galaxy = v_g AND target_system = v_s AND target_position = v_p) THEN
    RETURN 'tienes flotas en camino hacia la colonia o su luna';
  END IF;

  RETURN NULL;
END;
$function$

