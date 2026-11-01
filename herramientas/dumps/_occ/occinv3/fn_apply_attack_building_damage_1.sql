CREATE OR REPLACE FUNCTION public.apply_attack_building_damage(p_planet_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_target RECORD;
BEGIN
  -- [PROB 30] Probabilidad de dano estructural: 30% se rompe UNA de las 4
  -- construcciones (baja un nivel); 70% no se rompe ninguna.
  IF random() >= 0.30 THEN
    RETURN jsonb_build_object('damaged', false);
  END IF;

  -- 1) Preferir un edificio que NO este en construccion, nivel >= 1, aleatorio.
  SELECT pb.id AS pb_id, bt.code AS code, bt.name AS name, pb.level AS level
  INTO v_target
  FROM planet_buildings pb
  JOIN building_types bt ON bt.id = pb.building_type_id
  WHERE pb.planet_id = p_planet_id
    AND bt.code IN ('robotics_factory','shipyard','research_lab','nanite_factory')
    AND COALESCE(pb.level, 0) >= 1
    AND COALESCE(pb.is_upgrading, false) = false
  ORDER BY random()
  LIMIT 1;

  -- 2) Fallback: si todos estan en construccion, danar uno igual (nivel >= 1).
  IF NOT FOUND THEN
    SELECT pb.id AS pb_id, bt.code AS code, bt.name AS name, pb.level AS level
    INTO v_target
    FROM planet_buildings pb
    JOIN building_types bt ON bt.id = pb.building_type_id
    WHERE pb.planet_id = p_planet_id
      AND bt.code IN ('robotics_factory','shipyard','research_lab','nanite_factory')
      AND COALESCE(pb.level, 0) >= 1
    ORDER BY random()
    LIMIT 1;
  END IF;

  -- 3) Si no hay ninguno de los 4 con nivel >= 1, no hay nada que danar.
  IF NOT FOUND THEN
    RETURN jsonb_build_object('damaged', false);
  END IF;

  UPDATE planet_buildings SET level = v_target.level - 1 WHERE id = v_target.pb_id;

  RETURN jsonb_build_object(
    'damaged', true,
    'building_code', v_target.code,
    'building_name', v_target.name,
    'old_level', v_target.level,
    'new_level', v_target.level - 1
  );
END;
$function$

