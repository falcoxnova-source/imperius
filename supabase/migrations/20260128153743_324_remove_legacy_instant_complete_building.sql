/*
  # Remove Legacy instant_complete_building Function
  
  ## Problem
  There are two versions of instant_complete_building:
  - Version with 1 param (p_queue_id): Uses calculate_fxu_cost_building() - CORRECT
  - Version with 2 params (p_planet_id, p_building_type_id): Uses old time-based formula - WRONG (charges ~60 FXU instead of 945)
  
  ## Solution
  Remove the 2-parameter legacy version to ensure only the correct calculation is used.
*/

DROP FUNCTION IF EXISTS instant_complete_building(uuid, integer);
