/*
  # Función para Ranking de Destrucción de Flotas

  Calcula los puntos de destrucción basados en el valor de flotas enemigas destruidas.
  Usa SECURITY DEFINER para poder leer todos los battle_reports.
  
  Puntos = (metal_cost + crystal_cost) / 1000 de cada nave destruida
  Solo cuenta FLOTAS (is_defense = false), no defensas.
*/

CREATE OR REPLACE FUNCTION get_destruction_ranking()
RETURNS TABLE (
  user_id uuid,
  username text,
  avatar_url text,
  alliance_tag text,
  alliance_name text,
  alliance_id uuid,
  destruction_points bigint,
  attacker_points bigint,
  defender_points bigint,
  battles_as_attacker integer,
  battles_as_defender integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r record;
  report_data jsonb;
  attacker_id uuid;
  defender_id uuid;
  initial_defender jsonb;
  defender_remaining jsonb;
  initial_attacker jsonb;
  attacker_remaining jsonb;
  unit jsonb;
  remaining_unit jsonb;
  destroyed integer;
  defender_fleet_loss bigint;
  attacker_fleet_loss bigint;
BEGIN
  -- Tabla temporal para acumular puntos
  CREATE TEMP TABLE IF NOT EXISTS temp_destruction_points (
    uid uuid PRIMARY KEY,
    att_points bigint DEFAULT 0,
    def_points bigint DEFAULT 0,
    att_battles integer DEFAULT 0,
    def_battles integer DEFAULT 0
  ) ON COMMIT DROP;
  
  -- Limpiar tabla temporal
  DELETE FROM temp_destruction_points;

  -- Procesar todos los battle_reports
  FOR r IN SELECT br.attacker_id, br.defender_id, br.report_data FROM battle_reports br WHERE br.report_data IS NOT NULL
  LOOP
    report_data := r.report_data;
    attacker_id := r.attacker_id;
    defender_id := r.defender_id;
    
    -- Verificar que existan los datos necesarios
    IF report_data ? 'initial_defender' AND report_data ? 'defender_remaining' 
       AND report_data ? 'initial_attacker' AND report_data ? 'attacker_remaining' THEN
      
      initial_defender := report_data->'initial_defender';
      defender_remaining := report_data->'defender_remaining';
      initial_attacker := report_data->'initial_attacker';
      attacker_remaining := report_data->'attacker_remaining';
      
      -- Calcular pérdidas de flota del defensor (lo que destruyó el atacante)
      defender_fleet_loss := 0;
      FOR unit IN SELECT * FROM jsonb_array_elements(initial_defender)
      LOOP
        -- Solo contar flotas, no defensas
        IF (unit->>'is_defense')::boolean = false THEN
          -- Buscar la unidad en defender_remaining
          SELECT INTO remaining_unit * FROM jsonb_array_elements(defender_remaining) ru 
          WHERE (ru->>'type_id')::integer = (unit->>'type_id')::integer 
          AND (ru->>'is_defense')::boolean = false
          LIMIT 1;
          
          destroyed := COALESCE((unit->>'initial_quantity')::integer, (unit->>'quantity')::integer) 
                       - COALESCE((remaining_unit->>'quantity')::integer, 0);
          
          IF destroyed > 0 THEN
            defender_fleet_loss := defender_fleet_loss + 
              (destroyed * ((unit->>'metal_cost')::bigint + (unit->>'crystal_cost')::bigint));
          END IF;
        END IF;
      END LOOP;
      
      -- Calcular pérdidas de flota del atacante (lo que destruyó el defensor)
      attacker_fleet_loss := 0;
      FOR unit IN SELECT * FROM jsonb_array_elements(initial_attacker)
      LOOP
        -- Buscar la unidad en attacker_remaining
        SELECT INTO remaining_unit * FROM jsonb_array_elements(attacker_remaining) ru 
        WHERE (ru->>'type_id')::integer = (unit->>'type_id')::integer 
        LIMIT 1;
        
        destroyed := COALESCE((unit->>'initial_quantity')::integer, (unit->>'quantity')::integer) 
                     - COALESCE((remaining_unit->>'quantity')::integer, 0);
        
        IF destroyed > 0 THEN
          attacker_fleet_loss := attacker_fleet_loss + 
            (destroyed * ((unit->>'metal_cost')::bigint + (unit->>'crystal_cost')::bigint));
        END IF;
      END LOOP;
      
      -- Puntos = recursos / 1000
      -- Agregar puntos al atacante por destruir flotas del defensor
      IF attacker_id IS NOT NULL AND defender_fleet_loss > 0 THEN
        INSERT INTO temp_destruction_points (uid, att_points, att_battles)
        VALUES (attacker_id, defender_fleet_loss / 1000, 1)
        ON CONFLICT (uid) DO UPDATE SET 
          att_points = temp_destruction_points.att_points + EXCLUDED.att_points,
          att_battles = temp_destruction_points.att_battles + 1;
      END IF;
      
      -- Agregar puntos al defensor por destruir flotas del atacante
      IF defender_id IS NOT NULL AND attacker_fleet_loss > 0 THEN
        INSERT INTO temp_destruction_points (uid, def_points, def_battles)
        VALUES (defender_id, attacker_fleet_loss / 1000, 1)
        ON CONFLICT (uid) DO UPDATE SET 
          def_points = temp_destruction_points.def_points + EXCLUDED.def_points,
          def_battles = temp_destruction_points.def_battles + 1;
      END IF;
      
    END IF;
  END LOOP;

  -- Retornar resultados con datos de perfil y alianza
  RETURN QUERY
  SELECT 
    p.id as user_id,
    p.username,
    p.avatar_url,
    a.tag as alliance_tag,
    a.name as alliance_name,
    am.alliance_id,
    (COALESCE(tdp.att_points, 0) + COALESCE(tdp.def_points, 0))::bigint as destruction_points,
    COALESCE(tdp.att_points, 0)::bigint as attacker_points,
    COALESCE(tdp.def_points, 0)::bigint as defender_points,
    COALESCE(tdp.att_battles, 0)::integer as battles_as_attacker,
    COALESCE(tdp.def_battles, 0)::integer as battles_as_defender
  FROM temp_destruction_points tdp
  JOIN profiles p ON p.id = tdp.uid
  LEFT JOIN alliance_members am ON am.user_id = p.id
  LEFT JOIN alliances a ON a.id = am.alliance_id
  WHERE p.is_hidden IS NOT TRUE AND p.is_admin IS NOT TRUE
    AND (COALESCE(tdp.att_points, 0) + COALESCE(tdp.def_points, 0)) > 0
  ORDER BY destruction_points DESC;
END;
$$;
