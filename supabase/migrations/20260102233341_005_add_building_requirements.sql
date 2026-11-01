/*
  # Add Building Requirements System

  1. New Tables
    - `building_requirements` - Stores prerequisites for buildings
      - `id` (serial, primary key)
      - `building_type_id` (integer, references building_types)
      - `required_building_id` (integer, nullable, references building_types)
      - `required_building_level` (integer)
      - `required_tech_id` (integer, nullable, references technology_types)
      - `required_tech_level` (integer)

  2. Seed Data
    - Nanite Factory requires Robotics Factory 10
    - Fusion Reactor requires Energy Tech 3
    - Missile Silo requires Shipyard 1
    - Terraformer requires Energy Tech 12

  3. Notes
    - This enables the game to enforce build order requirements
*/

CREATE TABLE IF NOT EXISTS building_requirements (
  id serial PRIMARY KEY,
  building_type_id integer NOT NULL REFERENCES building_types(id) ON DELETE CASCADE,
  required_building_id integer REFERENCES building_types(id) ON DELETE CASCADE,
  required_building_level integer DEFAULT 0,
  required_tech_id integer REFERENCES technology_types(id) ON DELETE CASCADE,
  required_tech_level integer DEFAULT 0,
  CONSTRAINT valid_requirement CHECK (
    required_building_id IS NOT NULL OR required_tech_id IS NOT NULL
  )
);

INSERT INTO building_requirements (building_type_id, required_building_id, required_building_level)
SELECT bt.id, rb.id, 10
FROM building_types bt
CROSS JOIN building_types rb
WHERE bt.code = 'nanite_factory' AND rb.code = 'robotics_factory'
ON CONFLICT DO NOTHING;

INSERT INTO building_requirements (building_type_id, required_tech_id, required_tech_level)
SELECT bt.id, tt.id, 3
FROM building_types bt
CROSS JOIN technology_types tt
WHERE bt.code = 'fusion_reactor' AND tt.code = 'energy_tech'
ON CONFLICT DO NOTHING;

INSERT INTO building_requirements (building_type_id, required_building_id, required_building_level)
SELECT bt.id, rb.id, 1
FROM building_types bt
CROSS JOIN building_types rb
WHERE bt.code = 'missile_silo' AND rb.code = 'shipyard'
ON CONFLICT DO NOTHING;

INSERT INTO building_requirements (building_type_id, required_tech_id, required_tech_level)
SELECT bt.id, tt.id, 12
FROM building_types bt
CROSS JOIN technology_types tt
WHERE bt.code = 'terraformer' AND tt.code = 'energy_tech'
ON CONFLICT DO NOTHING;
