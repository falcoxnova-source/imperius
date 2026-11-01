/*
  # Fix fleet mission type constraint

  1. Changes
    - Add 'return' to the allowed mission types in fleets table
    - This allows the cancel_fleet function to work properly

  2. Notes
    - The cancel_fleet function sets mission_type to 'return' when a fleet is cancelled
    - This value was missing from the constraint, causing cancellation to fail
*/

ALTER TABLE fleets DROP CONSTRAINT IF EXISTS fleets_mission_type_check;

ALTER TABLE fleets ADD CONSTRAINT fleets_mission_type_check 
CHECK (mission_type = ANY (ARRAY['attack', 'transport', 'deploy', 'colonize', 'espionage', 'recycle', 'destroy', 'expedition', 'hold', 'return']));
