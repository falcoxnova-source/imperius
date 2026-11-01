/*
  # Fix Complete Research Function
  
  1. Changes
    - Update `complete_research` function to use SECURITY DEFINER
    - This allows the function to bypass RLS and complete researches properly
    - The function validates that the user_id parameter matches the authenticated user
    
  2. Security
    - Function validates auth.uid() matches p_user_id to prevent unauthorized access
    - Only the owner of the research can complete it
*/

CREATE OR REPLACE FUNCTION complete_research(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  research_record RECORD;
BEGIN
  IF p_user_id != auth.uid() THEN
    RAISE EXCEPTION 'Unauthorized: can only complete own research';
  END IF;

  FOR research_record IN
    SELECT id, level
    FROM user_technologies
    WHERE user_id = p_user_id
    AND is_researching = true
    AND research_end_time <= NOW()
  LOOP
    UPDATE user_technologies
    SET
      level = level + 1,
      is_researching = false,
      research_end_time = NULL,
      research_planet_id = NULL
    WHERE id = research_record.id;
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION complete_research(uuid) TO authenticated;