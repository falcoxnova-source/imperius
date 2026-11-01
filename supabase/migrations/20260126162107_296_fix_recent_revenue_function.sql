/*
  # Fix Recent Revenue Function
  
  1. Changes
    - Fix column name from `user_id` to `related_user_id`
    - Return `revenues` instead of `data` to match frontend expectation
    - Include username by joining with profiles table
    - Map `revenue_type` to `type` for frontend compatibility
    
  2. Security
    - Maintains admin-only access check
*/

CREATE OR REPLACE FUNCTION get_recent_revenue(p_limit integer DEFAULT 50)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
SET statement_timeout TO '10s'
AS $$
BEGIN
  IF NOT is_current_user_admin() THEN
    RETURN jsonb_build_object('success', false, 'error', 'No autorizado');
  END IF;
  
  RETURN jsonb_build_object('success', true, 'revenues', (
    SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb) FROM (
      SELECT 
        ar.id,
        ar.revenue_type as type,
        ar.amount,
        ar.description,
        p.username,
        ar.created_at
      FROM admin_revenue ar
      LEFT JOIN profiles p ON p.id = ar.related_user_id
      ORDER BY ar.created_at DESC 
      LIMIT p_limit
    ) t
  ));
END;
$$;
