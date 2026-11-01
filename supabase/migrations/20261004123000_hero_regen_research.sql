-- [HEROREGEN1] Nave Heroe: regen pasiva muy debil (>= 7 dias, segun Hangar/Robots/Nanobots),
-- reparacion pagada sin cambios, investigaciones (armas/escudos/blindaje) dan +10%/nivel como naves normales
-- sobre puntos + items equipados.

-- 1) Horas para regenerar el 100% de HP (fuente unica para regen y UI)
CREATE OR REPLACE FUNCTION public._hero_regen_hours(p_shipyard integer, p_robotics integer, p_nanite integer)
RETURNS numeric
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $$
  SELECT GREATEST(168::numeric,
    336::numeric / (1 + COALESCE(p_shipyard, 0) * 0.08 + COALESCE(p_robotics, 0) * 0.1 + COALESCE(p_nanite, 0) * 0.12));
$$;
REVOKE ALL ON FUNCTION public._hero_regen_hours(integer, integer, integer) FROM PUBLIC, anon, authenticated, service_role;

-- 2) Nivel de investigacion (mismo patron que perform_combat)
CREATE OR REPLACE FUNCTION public._hero_research_level(p_user_id uuid, p_code text)
RETURNS integer
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $$
  SELECT COALESCE((SELECT ut.level FROM public.user_technologies ut
                   JOIN public.technology_types tt ON ut.technology_type_id = tt.id
                   WHERE ut.user_id = p_user_id AND tt.code = p_code), 0);
$$;
REVOKE ALL ON FUNCTION public._hero_research_level(uuid, text) FROM PUBLIC, anon, authenticated, service_role;

-- 3) Regen pasiva: debil + sin perdida de fracciones
CREATE OR REPLACE FUNCTION public.apply_hero_regen(p_user_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_ship record;
  v_elapsed_hours numeric;
  v_hp_per_hour numeric;
  v_shipyard_level integer;
  v_robotics_level integer;
  v_nanite_level integer;
  v_repair_hours numeric;
  v_active_expedition uuid;
  v_hp_gain integer;
BEGIN
  SELECT * INTO v_ship FROM user_hero_ships WHERE user_id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;

  SELECT id INTO v_active_expedition FROM hero_ship_active_expedition
  WHERE user_id = p_user_id AND claimed = false LIMIT 1;

  -- Durante expedicion no hay regen ni finalizacion de reparacion
  IF v_active_expedition IS NOT NULL THEN
    UPDATE user_hero_ships SET last_regen_at = now() WHERE user_id = p_user_id;
    RETURN;
  END IF;

  -- Reparacion de hangar terminada: restaurar HP completo
  IF v_ship.repair_until IS NOT NULL AND now() >= v_ship.repair_until THEN
    UPDATE user_hero_ships
    SET hp = hp_max, repair_until = NULL, last_regen_at = now(), updated_at = now()
    WHERE user_id = p_user_id;
    RETURN;
  END IF;

  -- Reparacion de hangar en curso: sin regen pasiva
  IF v_ship.repair_until IS NOT NULL THEN
    UPDATE user_hero_ships SET last_regen_at = now() WHERE user_id = p_user_id;
    RETURN;
  END IF;

  IF v_ship.hp >= v_ship.hp_max OR v_ship.last_regen_at IS NULL THEN
    UPDATE user_hero_ships SET last_regen_at = now() WHERE user_id = p_user_id;
    RETURN;
  END IF;

  v_elapsed_hours := EXTRACT(EPOCH FROM (now() - v_ship.last_regen_at)) / 3600;
  IF v_elapsed_hours <= 0 THEN RETURN; END IF;

  SELECT COALESCE(MAX(CASE WHEN bt.code = 'shipyard' THEN pb.level END), 0),
         COALESCE(MAX(CASE WHEN bt.code = 'robotics_factory' THEN pb.level END), 0),
         COALESCE(MAX(CASE WHEN bt.code = 'nanite_factory' THEN pb.level END), 0)
  INTO v_shipyard_level, v_robotics_level, v_nanite_level
  FROM planets p
  JOIN planet_buildings pb ON pb.planet_id = p.id
  JOIN building_types bt ON bt.id = pb.building_type_id
  WHERE p.user_id = p_user_id AND p.is_main_planet = true;

  -- [HEROREGEN1] 100% HP en >= 7 dias (14 dias sin edificios)
  v_repair_hours := public._hero_regen_hours(v_shipyard_level, v_robotics_level, v_nanite_level);
  v_hp_per_hour := v_ship.hp_max / v_repair_hours;
  v_hp_gain := LEAST(FLOOR(v_elapsed_hours * v_hp_per_hour), v_ship.hp_max - v_ship.hp);

  -- Sin HP entero acumulado: no se toca last_regen_at (se conserva el progreso)
  IF v_hp_gain <= 0 THEN RETURN; END IF;

  IF v_ship.hp + v_hp_gain >= v_ship.hp_max THEN
    UPDATE user_hero_ships SET hp = hp_max, last_regen_at = now(), updated_at = now()
    WHERE user_id = p_user_id;
  ELSE
    -- Avanza solo el tiempo consumido; el sobrante sigue contando
    UPDATE user_hero_ships
    SET hp = hp + v_hp_gain,
        last_regen_at = v_ship.last_regen_at + make_interval(secs => (v_hp_gain / v_hp_per_hour) * 3600),
        updated_at = now()
    WHERE user_id = p_user_id;
  END IF;
END;
$function$;

-- 4) El tiempo pasado con HP lleno no cuenta como regen al recibir dano
CREATE OR REPLACE FUNCTION public._hero_reset_regen_on_damage()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  NEW.last_regen_at := now();
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public._hero_reset_regen_on_damage() FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS trg_hero_reset_regen_on_damage ON public.user_hero_ships;
CREATE TRIGGER trg_hero_reset_regen_on_damage
  BEFORE UPDATE OF hp ON public.user_hero_ships
  FOR EACH ROW
  WHEN (NEW.hp < OLD.hp AND OLD.hp >= OLD.hp_max)
  EXECUTE FUNCTION public._hero_reset_regen_on_damage();

-- 5) Duelos: investigacion multiplica (puntos + items)
DO $mig$
DECLARE
  v_src text;
  v_side text;
  v_stat text;
  v_tech text;
  v_mult text;
  v_old text;
  v_new text;
BEGIN
  SELECT replace(pg_get_functiondef('public.resolve_hero_duel(uuid)'::regprocedure), chr(13), '') INTO v_src;
  IF position('[HEROREGEN1]' in v_src) > 0 THEN
    RAISE NOTICE 'resolve_hero_duel ya parcheado';
  ELSE
    FOREACH v_side IN ARRAY ARRAY['creator', 'opponent'] LOOP
      FOREACH v_stat IN ARRAY ARRAY['attack', 'defense', 'shield'] LOOP
        v_tech := CASE v_stat WHEN 'attack' THEN 'weapons_tech' WHEN 'defense' THEN 'armour_tech' ELSE 'shielding_tech' END;
        v_mult := CASE v_stat WHEN 'attack' THEN '3' WHEN 'defense' THEN '2' ELSE '1.5' END;
        v_old := format('(COALESCE(v_%s_ship.%s_points, 0) + public._hero_item_bonus(v_duel.%s_id, %L)) * %s +',
                        v_side, v_stat, v_side, v_stat, v_mult);
        v_new := format('FLOOR((COALESCE(v_%s_ship.%s_points, 0) + public._hero_item_bonus(v_duel.%s_id, %L)) * (1 + 0.10 * public._hero_research_level(v_duel.%s_id, %L))) * %s + /* [HEROREGEN1] */',
                        v_side, v_stat, v_side, v_stat, v_side, v_tech, v_mult);
        IF (length(v_src) - length(replace(v_src, v_old, ''))) / length(v_old) <> 1 THEN
          RAISE EXCEPTION 'HEROREGEN1: ancla no unica/no encontrada en resolve_hero_duel: %', v_old;
        END IF;
        v_src := replace(v_src, v_old, v_new);
      END LOOP;
    END LOOP;
    EXECUTE v_src;
  END IF;
END
$mig$;

-- 6) get_hero_ship: exponer bonus de investigacion y horas de regen
DO $mig$
DECLARE
  v_src text;
  v_old text := E'    ''repair_remaining_seconds'', v_repair_remaining_seconds\n  );';
  v_new text := E'    ''repair_remaining_seconds'', v_repair_remaining_seconds,\n'
             || E'    -- [HEROREGEN1] investigacion +10%/nivel sobre puntos + items (como naves normales)\n'
             || E'    ''weapons_tech_level'', public._hero_research_level(p_user_id, ''weapons_tech''),\n'
             || E'    ''armour_tech_level'', public._hero_research_level(p_user_id, ''armour_tech''),\n'
             || E'    ''shielding_tech_level'', public._hero_research_level(p_user_id, ''shielding_tech''),\n'
             || E'    ''research_attack'', FLOOR(v_base_attack * (1 + 0.10 * public._hero_research_level(p_user_id, ''weapons_tech''))) - v_base_attack,\n'
             || E'    ''research_defense'', FLOOR(v_base_defense * (1 + 0.10 * public._hero_research_level(p_user_id, ''armour_tech''))) - v_base_defense,\n'
             || E'    ''research_shield'', FLOOR(v_base_shield * (1 + 0.10 * public._hero_research_level(p_user_id, ''shielding_tech''))) - v_base_shield,\n'
             || E'    ''regen_full_hours'', ROUND(public._hero_regen_hours(v_shipyard_level, v_robotics_level, v_nanite_level))\n'
             || E'  );';
BEGIN
  SELECT replace(pg_get_functiondef('public.get_hero_ship(uuid)'::regprocedure), chr(13), '') INTO v_src;
  IF position('[HEROREGEN1]' in v_src) > 0 THEN
    RAISE NOTICE 'get_hero_ship ya parcheado';
  ELSE
    IF (length(v_src) - length(replace(v_src, v_old, ''))) / length(v_old) <> 1 THEN
      RAISE EXCEPTION 'HEROREGEN1: ancla no unica/no encontrada en get_hero_ship';
    END IF;
    EXECUTE replace(v_src, v_old, v_new);
  END IF;
END
$mig$;
