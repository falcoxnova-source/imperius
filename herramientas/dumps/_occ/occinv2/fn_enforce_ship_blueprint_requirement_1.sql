CREATE OR REPLACE FUNCTION public.enforce_ship_blueprint_requirement()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_owner_id       uuid;
  v_blueprint_id   bigint;
  v_unit_name      text;
  v_shipyard_level integer;
  v_owned          integer;
  v_validation     jsonb;
BEGIN
  -- Solo naves o defensas
  IF NEW.item_type NOT IN ('ship','defense') THEN
    RETURN NEW;
  END IF;
  IF NEW.item_type = 'ship'    AND NEW.ship_type_id    IS NULL THEN RETURN NEW; END IF;
  IF NEW.item_type = 'defense' AND NEW.defense_type_id IS NULL THEN RETURN NEW; END IF;

  SELECT p.user_id INTO v_owner_id FROM planets p WHERE p.id = NEW.planet_id;
  IF v_owner_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Localizar plano (nave o defensa)
  IF NEW.item_type = 'ship' THEN
    SELECT sb.id, st.name INTO v_blueprint_id, v_unit_name
    FROM ship_blueprints sb
    JOIN ship_types st ON st.id = sb.ship_type_id
    WHERE sb.ship_type_id = NEW.ship_type_id AND sb.is_active = true
    LIMIT 1;
  ELSE
    SELECT sb.id, dt.name INTO v_blueprint_id, v_unit_name
    FROM ship_blueprints sb
    JOIN defense_types dt ON dt.id = sb.defense_type_id
    WHERE sb.defense_type_id = NEW.defense_type_id AND sb.is_active = true
    LIMIT 1;
  END IF;

  -- Sin plano definido: sin restriccion extra (via normal ya validada)
  IF v_blueprint_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT COUNT(*)::integer INTO v_owned
  FROM user_ship_blueprints usb
  WHERE usb.user_id = v_owner_id AND usb.blueprint_id = v_blueprint_id;

  -- CONSUMIBLE: si posee planos suficientes para toda la tanda,
  -- exige Hangar Nv1, consume NEW.quantity planos (los mas antiguos) y listo.
  IF v_owned >= NEW.quantity THEN
    SELECT COALESCE(pb.level, 0) INTO v_shipyard_level
    FROM planet_buildings pb
    JOIN building_types bt ON bt.id = pb.building_type_id
    WHERE pb.planet_id = NEW.planet_id AND bt.code = 'shipyard'
    LIMIT 1;

    IF COALESCE(v_shipyard_level, 0) < 1 THEN
      RAISE EXCEPTION 'Necesitas Hangar nivel 1 para construir con plano.'
        USING ERRCODE = 'P0001';
    END IF;

    DELETE FROM user_ship_blueprints
    WHERE ctid IN (
      SELECT usb.ctid FROM user_ship_blueprints usb
      WHERE usb.user_id = v_owner_id AND usb.blueprint_id = v_blueprint_id
      ORDER BY usb.acquired_at ASC
      LIMIT NEW.quantity
    );
    NEW.blueprints_used := NEW.quantity;
    RETURN NEW;
  END IF;

  -- Sin planos suficientes: requisitos completos (via normal)
  IF NEW.item_type = 'ship' THEN
    v_validation := validate_ship_requirements(NEW.planet_id, NEW.ship_type_id);
  ELSE
    v_validation := validate_defense_requirements(NEW.planet_id, NEW.defense_type_id);
  END IF;

  IF NOT COALESCE((v_validation->>'valid')::boolean, false) THEN
    RAISE EXCEPTION 'No cumples los requisitos para construir %. Compra su plano o cumple los requisitos.',
      COALESCE(v_unit_name, 'esto')
      USING ERRCODE = 'P0001';
  END IF;

  NEW.blueprints_used := 0;
  RETURN NEW;
END;
$function$

