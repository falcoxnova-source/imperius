/*
  # Add Broadcast Message Type
  
  1. Problem
    - The messages_message_type_check constraint doesn't include 'broadcast'
    - Current allowed values: player, system, battle, espionage, expedition, alliance, fleet_warning
  
  2. Solution
    - Drop and recreate the constraint to include 'broadcast'
*/

ALTER TABLE messages DROP CONSTRAINT IF EXISTS messages_message_type_check;

ALTER TABLE messages ADD CONSTRAINT messages_message_type_check 
  CHECK (message_type = ANY (ARRAY['player', 'system', 'battle', 'espionage', 'expedition', 'alliance', 'fleet_warning', 'broadcast']));
