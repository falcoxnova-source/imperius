/*
  # Correccion de Actualizacion Automatica de Rankings
  
  1. Problema Identificado
    - Los rankings no se actualizaban automaticamente cuando los puntos cambiaban
    - La funcion update_all_ranks() no se llamaba despues de actualizar puntos
    
  2. Solucion
    - Modificar update_player_points para llamar update_all_ranks automaticamente
    - Agregar search_path correcto para seguridad
*/

CREATE OR REPLACE FUNCTION update_player_points(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_buildings integer;
  v_research integer;
  v_fleet integer;
  v_defense integer;
BEGIN
  v_buildings := calculate_building_points(p_user_id);
  v_research := calculate_research_points(p_user_id);
  v_fleet := calculate_fleet_points(p_user_id);
  v_defense := calculate_defense_points(p_user_id);

  UPDATE profiles SET
    points_buildings = v_buildings,
    points_research = v_research,
    points_fleet = v_fleet,
    points_defense = v_defense,
    points_total = v_buildings + v_research + v_fleet + v_defense,
    updated_at = now()
  WHERE id = p_user_id;

  PERFORM update_all_ranks();
END;
$$;

CREATE OR REPLACE FUNCTION update_all_ranks()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  WITH ranked AS (
    SELECT id,
      ROW_NUMBER() OVER (ORDER BY points_total DESC, created_at ASC) as rank_total,
      ROW_NUMBER() OVER (ORDER BY points_buildings DESC, created_at ASC) as rank_b,
      ROW_NUMBER() OVER (ORDER BY points_research DESC, created_at ASC) as rank_r,
      ROW_NUMBER() OVER (ORDER BY points_fleet DESC, created_at ASC) as rank_f,
      ROW_NUMBER() OVER (ORDER BY points_defense DESC, created_at ASC) as rank_d
    FROM profiles
  )
  UPDATE profiles p
  SET 
    rank_position = r.rank_total,
    rank_buildings = r.rank_b,
    rank_research = r.rank_r,
    rank_fleet = r.rank_f,
    rank_defense = r.rank_d
  FROM ranked r
  WHERE p.id = r.id;
END;
$$;

CREATE OR REPLACE FUNCTION recalculate_all_player_points()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user record;
BEGIN
  FOR v_user IN SELECT id FROM profiles LOOP
    PERFORM update_player_points(v_user.id);
  END LOOP;
END;
$$;