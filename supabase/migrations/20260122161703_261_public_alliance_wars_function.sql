/*
  # Public Alliance Wars Function
  
  ## Summary
  Creates a function to get all active wars between alliances.
  Wars are public declarations and should be visible to all players.
  
  ## New Functions
  
  1. `get_active_alliance_wars()`
    - Returns all active war declarations between alliances
    - Available to all authenticated users
    - Shows alliance names and tags for both sides
  
  ## Security
  - Function is available to all authenticated users
  - Only returns active wars (public information)
*/

CREATE OR REPLACE FUNCTION get_active_alliance_wars()
RETURNS TABLE (
  id uuid,
  alliance1_id uuid,
  alliance1_tag text,
  alliance1_name text,
  alliance2_id uuid,
  alliance2_tag text,
  alliance2_name text,
  declared_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    d.id,
    d.alliance_id as alliance1_id,
    a1.tag as alliance1_tag,
    a1.name as alliance1_name,
    d.target_alliance_id as alliance2_id,
    a2.tag as alliance2_tag,
    a2.name as alliance2_name,
    d.proposed_at as declared_at
  FROM alliance_diplomacy d
  JOIN alliances a1 ON d.alliance_id = a1.id
  JOIN alliances a2 ON d.target_alliance_id = a2.id
  WHERE d.diplomacy_type = 'war'
    AND d.status = 'active'
  ORDER BY d.proposed_at DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION get_active_alliance_wars() TO authenticated;
