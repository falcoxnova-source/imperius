/*
  # Fix Building Requirements According to Original Game

  1. Changes
    - Add Shipyard requirement: Robotics Factory level 2
    - Add Nanite Factory requirement: Computer Technology level 10
    - Add Terraformer requirement: Nanite Factory level 1
    - Add Fusion Reactor requirement: Deuterium Synthesizer level 5

  2. Requirements Summary (OGame Standard)
    - Shipyard: Robotics Factory 2
    - Research Lab: No requirements
    - Nanite Factory: Robotics Factory 10, Computer Tech 10
    - Missile Silo: Shipyard 1
    - Terraformer: Nanite Factory 1, Energy Tech 12
    - Fusion Reactor: Deuterium Synth 5, Energy Tech 3
    - Sensor Phalanx: Lunar Base 1
    - Jump Gate: Lunar Base 1, Hyperspace Tech 7
*/

-- Get building and technology IDs
DO $$
DECLARE
  v_shipyard_id integer;
  v_robotics_factory_id integer;
  v_nanite_factory_id integer;
  v_terraformer_id integer;
  v_fusion_reactor_id integer;
  v_deuterium_synth_id integer;
  v_computer_tech_id integer;
BEGIN
  -- Get building IDs
  SELECT id INTO v_shipyard_id FROM building_types WHERE code = 'shipyard';
  SELECT id INTO v_robotics_factory_id FROM building_types WHERE code = 'robotics_factory';
  SELECT id INTO v_nanite_factory_id FROM building_types WHERE code = 'nanite_factory';
  SELECT id INTO v_terraformer_id FROM building_types WHERE code = 'terraformer';
  SELECT id INTO v_fusion_reactor_id FROM building_types WHERE code = 'fusion_reactor';
  SELECT id INTO v_deuterium_synth_id FROM building_types WHERE code = 'deuterium_synthesizer';
  
  -- Get technology IDs
  SELECT id INTO v_computer_tech_id FROM technology_types WHERE code = 'computer_tech';

  -- 1. Add Shipyard requirement: Robotics Factory level 2
  IF NOT EXISTS (
    SELECT 1 FROM building_requirements 
    WHERE building_type_id = v_shipyard_id AND required_building_id = v_robotics_factory_id
  ) THEN
    INSERT INTO building_requirements (building_type_id, required_building_id, required_building_level)
    VALUES (v_shipyard_id, v_robotics_factory_id, 2);
  END IF;

  -- 2. Add Nanite Factory requirement: Computer Technology level 10
  IF v_computer_tech_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM building_requirements 
    WHERE building_type_id = v_nanite_factory_id AND required_tech_id = v_computer_tech_id
  ) THEN
    INSERT INTO building_requirements (building_type_id, required_tech_id, required_tech_level)
    VALUES (v_nanite_factory_id, v_computer_tech_id, 10);
  END IF;

  -- 3. Add Terraformer requirement: Nanite Factory level 1
  IF NOT EXISTS (
    SELECT 1 FROM building_requirements 
    WHERE building_type_id = v_terraformer_id AND required_building_id = v_nanite_factory_id
  ) THEN
    INSERT INTO building_requirements (building_type_id, required_building_id, required_building_level)
    VALUES (v_terraformer_id, v_nanite_factory_id, 1);
  END IF;

  -- 4. Add Fusion Reactor requirement: Deuterium Synthesizer level 5
  IF NOT EXISTS (
    SELECT 1 FROM building_requirements 
    WHERE building_type_id = v_fusion_reactor_id AND required_building_id = v_deuterium_synth_id
  ) THEN
    INSERT INTO building_requirements (building_type_id, required_building_id, required_building_level)
    VALUES (v_fusion_reactor_id, v_deuterium_synth_id, 5);
  END IF;

END $$;
