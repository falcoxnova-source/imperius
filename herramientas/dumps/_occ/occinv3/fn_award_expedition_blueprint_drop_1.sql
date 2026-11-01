CREATE OR REPLACE FUNCTION public.award_expedition_blueprint_drop()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_cfg          expedition_blueprint_drop_config%ROWTYPE;
  v_roll         numeric;
  v_pick         numeric;
  v_total        numeric;
  v_weight       numeric;
  v_blueprint_id bigint;
BEGIN
  -- Solo cuando una expedicion pasa de no-completada a completada
  IF NOT (NEW.mission_type = 'expedition'
          AND NEW.is_completed = true
          AND COALESCE(OLD.is_completed, false) = false) THEN
    RETURN NEW;
  END IF;

  BEGIN
    -- Idempotencia: esta expedicion ya tuvo su tirada
    IF EXISTS (SELECT 1 FROM expedition_blueprint_drops WHERE fleet_id = NEW.id) THEN
      RETURN NEW;
    END IF;

    -- Config global (interruptor maestro + probabilidad de que salga plano)
    SELECT * INTO v_cfg FROM expedition_blueprint_drop_config WHERE id = 1;
    IF NOT FOUND
       OR v_cfg.is_enabled = false
       OR COALESCE(v_cfg.drop_chance, 0) <= 0 THEN
      RETURN NEW;
    END IF;

    -- TIRADA 1: sale plano en esta expedicion, si o no
    v_roll := random()::numeric;
    IF v_roll > v_cfg.drop_chance THEN
      RETURN NEW;
    END IF;

    -- TIRADA 2: cual plano. Solo dropeables, ponderado por su % del panel admin
    SELECT SUM(COALESCE(sb.expedition_drop_chance, 0)::numeric)
      INTO v_total
    FROM ship_blueprints sb
    WHERE sb.is_active = true
      AND sb.is_droppable = true
      AND COALESCE(sb.expedition_drop_chance, 0) > 0;

    -- Si el admin no dejo ningun plano dropeable, no se entrega nada
    IF COALESCE(v_total, 0) <= 0 THEN
      RETURN NEW;
    END IF;

    v_pick := random()::numeric * v_total;

    SELECT p.id, p.w
      INTO v_blueprint_id, v_weight
    FROM (
      SELECT sb.id,
             COALESCE(sb.expedition_drop_chance, 0)::numeric AS w,
             SUM(COALESCE(sb.expedition_drop_chance, 0)::numeric)
               OVER (ORDER BY sb.id ROWS UNBOUNDED PRECEDING) AS cum
      FROM ship_blueprints sb
      WHERE sb.is_active = true
        AND sb.is_droppable = true
        AND COALESCE(sb.expedition_drop_chance, 0) > 0
    ) p
    WHERE p.cum >= v_pick
    ORDER BY p.cum
    LIMIT 1;

    IF v_blueprint_id IS NULL THEN
      RETURN NEW;
    END IF;

    -- Reserva atomica: UNIQUE(fleet_id) => como maximo 1 plano por expedicion
    INSERT INTO expedition_blueprint_drops (fleet_id, user_id, blueprint_id, roll_value, chance_used)
    VALUES (NEW.id, NEW.user_id, v_blueprint_id, v_roll, v_cfg.drop_chance)
    ON CONFLICT (fleet_id) DO NOTHING;

    IF NOT FOUND THEN
      -- Otra ejecucion ya reservo esta expedicion: no se entrega nada
      RETURN NEW;
    END IF;

    -- Entrega del plano (consumible: se permiten repetidos, se acumulan)
    INSERT INTO user_ship_blueprints (user_id, blueprint_id, source, metadata)
    VALUES (
      NEW.user_id,
      v_blueprint_id,
      'expedition',
      jsonb_build_object(
        'fleet_id',         NEW.id,
        'roll',             v_roll,
        'chance',           v_cfg.drop_chance,
        'blueprint_weight', v_weight,
        'pool_total',       v_total
      )
    );

  EXCEPTION WHEN OTHERS THEN
    -- Nunca romper el cierre de la expedicion por culpa del plano
    RAISE WARNING 'award_expedition_blueprint_drop: fallo en fleet % -> %', NEW.id, SQLERRM;
  END;

  RETURN NEW;
END;
$function$

