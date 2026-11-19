/*
  Imperium: al subir de nivel el Heroe recarga la vida completa.
  Antes solo sumaba la vida maxima ganada. Si no sube de nivel, la vida sigue
  recuperandose solo de forma progresiva o pagando la curacion (sin cambios).
  Las funciones que llaman a add_hero_xp (expedicion, batalla, duelo) aplican
  el dano antes de la XP, asi que la recarga no queda sobrescrita.
*/
CREATE OR REPLACE FUNCTION public.add_hero_xp(p_user_id uuid, p_xp integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_ship record;
  v_leveled_up boolean := false;
BEGIN
  PERFORM create_hero_ship(p_user_id);

  SELECT * INTO v_ship FROM user_hero_ships WHERE user_id = p_user_id FOR UPDATE;

  v_ship.xp := v_ship.xp + p_xp;

  WHILE v_ship.xp >= v_ship.xp_to_next LOOP
    v_ship.xp := v_ship.xp - v_ship.xp_to_next;
    v_ship.level := v_ship.level + 1;
    v_ship.xp_to_next := hero_xp_for_level(v_ship.level);
    v_ship.hp_max := 100 + (v_ship.level - 1) * 10;
    -- Subir de nivel recarga la vida completa
    v_ship.hp := v_ship.hp_max;
    v_leveled_up := true;
  END LOOP;

  UPDATE user_hero_ships
  SET level = v_ship.level,
      xp = v_ship.xp,
      xp_to_next = v_ship.xp_to_next,
      hp = v_ship.hp,
      hp_max = v_ship.hp_max,
      updated_at = now()
  WHERE user_id = p_user_id;

  RETURN jsonb_build_object(
    'success', true,
    'level', v_ship.level,
    'xp', v_ship.xp,
    'xp_to_next', v_ship.xp_to_next,
    'leveled_up', v_leveled_up
  );
END;
$function$;
