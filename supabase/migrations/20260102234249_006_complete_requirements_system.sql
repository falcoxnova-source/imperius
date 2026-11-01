/*
  # Complete Requirements System for XNova Logic

  1. New Tables
    - `technology_requirements` - Prerequisites for researching technologies
    - `ship_requirements` - Prerequisites for building ships
    - `defense_requirements` - Prerequisites for building defenses

  2. Seed Data
    Based on original XNova/OGame game logic:
    - Each technology has specific building and tech requirements
    - Each ship requires shipyard level and specific technologies
    - Each defense requires shipyard level and specific technologies

  3. Notes
    - Requirements are checked before allowing construction/research
    - Multiple requirements can exist per item (AND logic)
*/

-- Technology Requirements Table
CREATE TABLE IF NOT EXISTS technology_requirements (
  id serial PRIMARY KEY,
  technology_type_id integer NOT NULL REFERENCES technology_types(id) ON DELETE CASCADE,
  required_building_id integer REFERENCES building_types(id) ON DELETE CASCADE,
  required_building_level integer DEFAULT 0,
  required_tech_id integer REFERENCES technology_types(id) ON DELETE CASCADE,
  required_tech_level integer DEFAULT 0,
  CONSTRAINT valid_tech_requirement CHECK (
    required_building_id IS NOT NULL OR required_tech_id IS NOT NULL
  )
);

-- Ship Requirements Table
CREATE TABLE IF NOT EXISTS ship_requirements (
  id serial PRIMARY KEY,
  ship_type_id integer NOT NULL REFERENCES ship_types(id) ON DELETE CASCADE,
  required_building_id integer REFERENCES building_types(id) ON DELETE CASCADE,
  required_building_level integer DEFAULT 0,
  required_tech_id integer REFERENCES technology_types(id) ON DELETE CASCADE,
  required_tech_level integer DEFAULT 0,
  CONSTRAINT valid_ship_requirement CHECK (
    required_building_id IS NOT NULL OR required_tech_id IS NOT NULL
  )
);

-- Defense Requirements Table
CREATE TABLE IF NOT EXISTS defense_requirements (
  id serial PRIMARY KEY,
  defense_type_id integer NOT NULL REFERENCES defense_types(id) ON DELETE CASCADE,
  required_building_id integer REFERENCES building_types(id) ON DELETE CASCADE,
  required_building_level integer DEFAULT 0,
  required_tech_id integer REFERENCES technology_types(id) ON DELETE CASCADE,
  required_tech_level integer DEFAULT 0,
  CONSTRAINT valid_defense_requirement CHECK (
    required_building_id IS NOT NULL OR required_tech_id IS NOT NULL
  )
);

-- =============================================
-- TECHNOLOGY REQUIREMENTS (XNova Logic)
-- =============================================

-- Energy Tech: Research Lab 1
INSERT INTO technology_requirements (technology_type_id, required_building_id, required_building_level)
SELECT t.id, b.id, 1
FROM technology_types t, building_types b
WHERE t.code = 'energy_tech' AND b.code = 'research_lab';

-- Laser Tech: Research Lab 1, Energy Tech 2
INSERT INTO technology_requirements (technology_type_id, required_building_id, required_building_level)
SELECT t.id, b.id, 1
FROM technology_types t, building_types b
WHERE t.code = 'laser_tech' AND b.code = 'research_lab';

INSERT INTO technology_requirements (technology_type_id, required_tech_id, required_tech_level)
SELECT t.id, r.id, 2
FROM technology_types t, technology_types r
WHERE t.code = 'laser_tech' AND r.code = 'energy_tech';

-- Ion Tech: Research Lab 4, Laser Tech 5, Energy Tech 4
INSERT INTO technology_requirements (technology_type_id, required_building_id, required_building_level)
SELECT t.id, b.id, 4
FROM technology_types t, building_types b
WHERE t.code = 'ion_tech' AND b.code = 'research_lab';

INSERT INTO technology_requirements (technology_type_id, required_tech_id, required_tech_level)
SELECT t.id, r.id, 5
FROM technology_types t, technology_types r
WHERE t.code = 'ion_tech' AND r.code = 'laser_tech';

INSERT INTO technology_requirements (technology_type_id, required_tech_id, required_tech_level)
SELECT t.id, r.id, 4
FROM technology_types t, technology_types r
WHERE t.code = 'ion_tech' AND r.code = 'energy_tech';

-- Hyperspace Tech: Research Lab 7, Energy Tech 5, Shielding Tech 5
INSERT INTO technology_requirements (technology_type_id, required_building_id, required_building_level)
SELECT t.id, b.id, 7
FROM technology_types t, building_types b
WHERE t.code = 'hyperspace_tech' AND b.code = 'research_lab';

INSERT INTO technology_requirements (technology_type_id, required_tech_id, required_tech_level)
SELECT t.id, r.id, 5
FROM technology_types t, technology_types r
WHERE t.code = 'hyperspace_tech' AND r.code = 'energy_tech';

INSERT INTO technology_requirements (technology_type_id, required_tech_id, required_tech_level)
SELECT t.id, r.id, 5
FROM technology_types t, technology_types r
WHERE t.code = 'hyperspace_tech' AND r.code = 'shielding_tech';

-- Plasma Tech: Research Lab 4, Laser Tech 10, Ion Tech 5, Energy Tech 8
INSERT INTO technology_requirements (technology_type_id, required_building_id, required_building_level)
SELECT t.id, b.id, 4
FROM technology_types t, building_types b
WHERE t.code = 'plasma_tech' AND b.code = 'research_lab';

INSERT INTO technology_requirements (technology_type_id, required_tech_id, required_tech_level)
SELECT t.id, r.id, 10
FROM technology_types t, technology_types r
WHERE t.code = 'plasma_tech' AND r.code = 'laser_tech';

INSERT INTO technology_requirements (technology_type_id, required_tech_id, required_tech_level)
SELECT t.id, r.id, 5
FROM technology_types t, technology_types r
WHERE t.code = 'plasma_tech' AND r.code = 'ion_tech';

INSERT INTO technology_requirements (technology_type_id, required_tech_id, required_tech_level)
SELECT t.id, r.id, 8
FROM technology_types t, technology_types r
WHERE t.code = 'plasma_tech' AND r.code = 'energy_tech';

-- Combustion Drive: Research Lab 1, Energy Tech 1
INSERT INTO technology_requirements (technology_type_id, required_building_id, required_building_level)
SELECT t.id, b.id, 1
FROM technology_types t, building_types b
WHERE t.code = 'combustion_drive' AND b.code = 'research_lab';

INSERT INTO technology_requirements (technology_type_id, required_tech_id, required_tech_level)
SELECT t.id, r.id, 1
FROM technology_types t, technology_types r
WHERE t.code = 'combustion_drive' AND r.code = 'energy_tech';

-- Impulse Drive: Research Lab 2, Energy Tech 1
INSERT INTO technology_requirements (technology_type_id, required_building_id, required_building_level)
SELECT t.id, b.id, 2
FROM technology_types t, building_types b
WHERE t.code = 'impulse_drive' AND b.code = 'research_lab';

INSERT INTO technology_requirements (technology_type_id, required_tech_id, required_tech_level)
SELECT t.id, r.id, 1
FROM technology_types t, technology_types r
WHERE t.code = 'impulse_drive' AND r.code = 'energy_tech';

-- Hyperspace Drive: Research Lab 7, Hyperspace Tech 3
INSERT INTO technology_requirements (technology_type_id, required_building_id, required_building_level)
SELECT t.id, b.id, 7
FROM technology_types t, building_types b
WHERE t.code = 'hyperspace_drive' AND b.code = 'research_lab';

INSERT INTO technology_requirements (technology_type_id, required_tech_id, required_tech_level)
SELECT t.id, r.id, 3
FROM technology_types t, technology_types r
WHERE t.code = 'hyperspace_drive' AND r.code = 'hyperspace_tech';

-- Weapons Tech: Research Lab 4
INSERT INTO technology_requirements (technology_type_id, required_building_id, required_building_level)
SELECT t.id, b.id, 4
FROM technology_types t, building_types b
WHERE t.code = 'weapons_tech' AND b.code = 'research_lab';

-- Shielding Tech: Research Lab 6, Energy Tech 3
INSERT INTO technology_requirements (technology_type_id, required_building_id, required_building_level)
SELECT t.id, b.id, 6
FROM technology_types t, building_types b
WHERE t.code = 'shielding_tech' AND b.code = 'research_lab';

INSERT INTO technology_requirements (technology_type_id, required_tech_id, required_tech_level)
SELECT t.id, r.id, 3
FROM technology_types t, technology_types r
WHERE t.code = 'shielding_tech' AND r.code = 'energy_tech';

-- Armor Tech: Research Lab 2
INSERT INTO technology_requirements (technology_type_id, required_building_id, required_building_level)
SELECT t.id, b.id, 2
FROM technology_types t, building_types b
WHERE t.code = 'armour_tech' AND b.code = 'research_lab';

-- Espionage Tech: Research Lab 3
INSERT INTO technology_requirements (technology_type_id, required_building_id, required_building_level)
SELECT t.id, b.id, 3
FROM technology_types t, building_types b
WHERE t.code = 'espionage_tech' AND b.code = 'research_lab';

-- Computer Tech: Research Lab 1
INSERT INTO technology_requirements (technology_type_id, required_building_id, required_building_level)
SELECT t.id, b.id, 1
FROM technology_types t, building_types b
WHERE t.code = 'computer_tech' AND b.code = 'research_lab';

-- Astrophysics: Research Lab 3, Espionage Tech 4, Impulse Drive 3
INSERT INTO technology_requirements (technology_type_id, required_building_id, required_building_level)
SELECT t.id, b.id, 3
FROM technology_types t, building_types b
WHERE t.code = 'astrophysics' AND b.code = 'research_lab';

INSERT INTO technology_requirements (technology_type_id, required_tech_id, required_tech_level)
SELECT t.id, r.id, 4
FROM technology_types t, technology_types r
WHERE t.code = 'astrophysics' AND r.code = 'espionage_tech';

INSERT INTO technology_requirements (technology_type_id, required_tech_id, required_tech_level)
SELECT t.id, r.id, 3
FROM technology_types t, technology_types r
WHERE t.code = 'astrophysics' AND r.code = 'impulse_drive';

-- Graviton Tech: Research Lab 12
INSERT INTO technology_requirements (technology_type_id, required_building_id, required_building_level)
SELECT t.id, b.id, 12
FROM technology_types t, building_types b
WHERE t.code = 'graviton_tech' AND b.code = 'research_lab';

-- =============================================
-- SHIP REQUIREMENTS (XNova Logic)
-- =============================================

-- Small Cargo: Shipyard 2, Combustion Drive 2
INSERT INTO ship_requirements (ship_type_id, required_building_id, required_building_level)
SELECT s.id, b.id, 2
FROM ship_types s, building_types b
WHERE s.code = 'small_cargo' AND b.code = 'shipyard';

INSERT INTO ship_requirements (ship_type_id, required_tech_id, required_tech_level)
SELECT s.id, t.id, 2
FROM ship_types s, technology_types t
WHERE s.code = 'small_cargo' AND t.code = 'combustion_drive';

-- Large Cargo: Shipyard 4, Combustion Drive 6
INSERT INTO ship_requirements (ship_type_id, required_building_id, required_building_level)
SELECT s.id, b.id, 4
FROM ship_types s, building_types b
WHERE s.code = 'large_cargo' AND b.code = 'shipyard';

INSERT INTO ship_requirements (ship_type_id, required_tech_id, required_tech_level)
SELECT s.id, t.id, 6
FROM ship_types s, technology_types t
WHERE s.code = 'large_cargo' AND t.code = 'combustion_drive';

-- Light Fighter: Shipyard 1
INSERT INTO ship_requirements (ship_type_id, required_building_id, required_building_level)
SELECT s.id, b.id, 1
FROM ship_types s, building_types b
WHERE s.code = 'light_fighter' AND b.code = 'shipyard';

-- Heavy Fighter: Shipyard 3, Armor Tech 2, Impulse Drive 2
INSERT INTO ship_requirements (ship_type_id, required_building_id, required_building_level)
SELECT s.id, b.id, 3
FROM ship_types s, building_types b
WHERE s.code = 'heavy_fighter' AND b.code = 'shipyard';

INSERT INTO ship_requirements (ship_type_id, required_tech_id, required_tech_level)
SELECT s.id, t.id, 2
FROM ship_types s, technology_types t
WHERE s.code = 'heavy_fighter' AND t.code = 'armour_tech';

INSERT INTO ship_requirements (ship_type_id, required_tech_id, required_tech_level)
SELECT s.id, t.id, 2
FROM ship_types s, technology_types t
WHERE s.code = 'heavy_fighter' AND t.code = 'impulse_drive';

-- Cruiser: Shipyard 5, Ion Tech 2, Impulse Drive 4
INSERT INTO ship_requirements (ship_type_id, required_building_id, required_building_level)
SELECT s.id, b.id, 5
FROM ship_types s, building_types b
WHERE s.code = 'cruiser' AND b.code = 'shipyard';

INSERT INTO ship_requirements (ship_type_id, required_tech_id, required_tech_level)
SELECT s.id, t.id, 2
FROM ship_types s, technology_types t
WHERE s.code = 'cruiser' AND t.code = 'ion_tech';

INSERT INTO ship_requirements (ship_type_id, required_tech_id, required_tech_level)
SELECT s.id, t.id, 4
FROM ship_types s, technology_types t
WHERE s.code = 'cruiser' AND t.code = 'impulse_drive';

-- Battleship: Shipyard 7, Hyperspace Drive 4
INSERT INTO ship_requirements (ship_type_id, required_building_id, required_building_level)
SELECT s.id, b.id, 7
FROM ship_types s, building_types b
WHERE s.code = 'battleship' AND b.code = 'shipyard';

INSERT INTO ship_requirements (ship_type_id, required_tech_id, required_tech_level)
SELECT s.id, t.id, 4
FROM ship_types s, technology_types t
WHERE s.code = 'battleship' AND t.code = 'hyperspace_drive';

-- Colony Ship: Shipyard 4, Impulse Drive 3
INSERT INTO ship_requirements (ship_type_id, required_building_id, required_building_level)
SELECT s.id, b.id, 4
FROM ship_types s, building_types b
WHERE s.code = 'colony_ship' AND b.code = 'shipyard';

INSERT INTO ship_requirements (ship_type_id, required_tech_id, required_tech_level)
SELECT s.id, t.id, 3
FROM ship_types s, technology_types t
WHERE s.code = 'colony_ship' AND t.code = 'impulse_drive';

-- Recycler: Shipyard 4, Combustion Drive 6, Shielding Tech 2
INSERT INTO ship_requirements (ship_type_id, required_building_id, required_building_level)
SELECT s.id, b.id, 4
FROM ship_types s, building_types b
WHERE s.code = 'recycler' AND b.code = 'shipyard';

INSERT INTO ship_requirements (ship_type_id, required_tech_id, required_tech_level)
SELECT s.id, t.id, 6
FROM ship_types s, technology_types t
WHERE s.code = 'recycler' AND t.code = 'combustion_drive';

INSERT INTO ship_requirements (ship_type_id, required_tech_id, required_tech_level)
SELECT s.id, t.id, 2
FROM ship_types s, technology_types t
WHERE s.code = 'recycler' AND t.code = 'shielding_tech';

-- Espionage Probe: Shipyard 3, Combustion Drive 3, Espionage Tech 2
INSERT INTO ship_requirements (ship_type_id, required_building_id, required_building_level)
SELECT s.id, b.id, 3
FROM ship_types s, building_types b
WHERE s.code = 'espionage_probe' AND b.code = 'shipyard';

INSERT INTO ship_requirements (ship_type_id, required_tech_id, required_tech_level)
SELECT s.id, t.id, 3
FROM ship_types s, technology_types t
WHERE s.code = 'espionage_probe' AND t.code = 'combustion_drive';

INSERT INTO ship_requirements (ship_type_id, required_tech_id, required_tech_level)
SELECT s.id, t.id, 2
FROM ship_types s, technology_types t
WHERE s.code = 'espionage_probe' AND t.code = 'espionage_tech';

-- Solar Satellite: Shipyard 1
INSERT INTO ship_requirements (ship_type_id, required_building_id, required_building_level)
SELECT s.id, b.id, 1
FROM ship_types s, building_types b
WHERE s.code = 'solar_satellite' AND b.code = 'shipyard';

-- Bomber: Shipyard 8, Impulse Drive 6, Plasma Tech 5
INSERT INTO ship_requirements (ship_type_id, required_building_id, required_building_level)
SELECT s.id, b.id, 8
FROM ship_types s, building_types b
WHERE s.code = 'bomber' AND b.code = 'shipyard';

INSERT INTO ship_requirements (ship_type_id, required_tech_id, required_tech_level)
SELECT s.id, t.id, 6
FROM ship_types s, technology_types t
WHERE s.code = 'bomber' AND t.code = 'impulse_drive';

INSERT INTO ship_requirements (ship_type_id, required_tech_id, required_tech_level)
SELECT s.id, t.id, 5
FROM ship_types s, technology_types t
WHERE s.code = 'bomber' AND t.code = 'plasma_tech';

-- Destroyer: Shipyard 9, Hyperspace Tech 5, Hyperspace Drive 6
INSERT INTO ship_requirements (ship_type_id, required_building_id, required_building_level)
SELECT s.id, b.id, 9
FROM ship_types s, building_types b
WHERE s.code = 'destroyer' AND b.code = 'shipyard';

INSERT INTO ship_requirements (ship_type_id, required_tech_id, required_tech_level)
SELECT s.id, t.id, 5
FROM ship_types s, technology_types t
WHERE s.code = 'destroyer' AND t.code = 'hyperspace_tech';

INSERT INTO ship_requirements (ship_type_id, required_tech_id, required_tech_level)
SELECT s.id, t.id, 6
FROM ship_types s, technology_types t
WHERE s.code = 'destroyer' AND t.code = 'hyperspace_drive';

-- Deathstar: Shipyard 12, Hyperspace Tech 6, Hyperspace Drive 7, Graviton Tech 1
INSERT INTO ship_requirements (ship_type_id, required_building_id, required_building_level)
SELECT s.id, b.id, 12
FROM ship_types s, building_types b
WHERE s.code = 'deathstar' AND b.code = 'shipyard';

INSERT INTO ship_requirements (ship_type_id, required_tech_id, required_tech_level)
SELECT s.id, t.id, 6
FROM ship_types s, technology_types t
WHERE s.code = 'deathstar' AND t.code = 'hyperspace_tech';

INSERT INTO ship_requirements (ship_type_id, required_tech_id, required_tech_level)
SELECT s.id, t.id, 7
FROM ship_types s, technology_types t
WHERE s.code = 'deathstar' AND t.code = 'hyperspace_drive';

INSERT INTO ship_requirements (ship_type_id, required_tech_id, required_tech_level)
SELECT s.id, t.id, 1
FROM ship_types s, technology_types t
WHERE s.code = 'deathstar' AND t.code = 'graviton_tech';

-- Battlecruiser: Shipyard 8, Hyperspace Tech 5, Hyperspace Drive 5, Laser Tech 12
INSERT INTO ship_requirements (ship_type_id, required_building_id, required_building_level)
SELECT s.id, b.id, 8
FROM ship_types s, building_types b
WHERE s.code = 'battlecruiser' AND b.code = 'shipyard';

INSERT INTO ship_requirements (ship_type_id, required_tech_id, required_tech_level)
SELECT s.id, t.id, 5
FROM ship_types s, technology_types t
WHERE s.code = 'battlecruiser' AND t.code = 'hyperspace_tech';

INSERT INTO ship_requirements (ship_type_id, required_tech_id, required_tech_level)
SELECT s.id, t.id, 5
FROM ship_types s, technology_types t
WHERE s.code = 'battlecruiser' AND t.code = 'hyperspace_drive';

INSERT INTO ship_requirements (ship_type_id, required_tech_id, required_tech_level)
SELECT s.id, t.id, 12
FROM ship_types s, technology_types t
WHERE s.code = 'battlecruiser' AND t.code = 'laser_tech';

-- =============================================
-- DEFENSE REQUIREMENTS (XNova Logic)
-- =============================================

-- Rocket Launcher: Shipyard 1
INSERT INTO defense_requirements (defense_type_id, required_building_id, required_building_level)
SELECT d.id, b.id, 1
FROM defense_types d, building_types b
WHERE d.code = 'rocket_launcher' AND b.code = 'shipyard';

-- Light Laser: Shipyard 2, Energy Tech 1, Laser Tech 3
INSERT INTO defense_requirements (defense_type_id, required_building_id, required_building_level)
SELECT d.id, b.id, 2
FROM defense_types d, building_types b
WHERE d.code = 'light_laser' AND b.code = 'shipyard';

INSERT INTO defense_requirements (defense_type_id, required_tech_id, required_tech_level)
SELECT d.id, t.id, 1
FROM defense_types d, technology_types t
WHERE d.code = 'light_laser' AND t.code = 'energy_tech';

INSERT INTO defense_requirements (defense_type_id, required_tech_id, required_tech_level)
SELECT d.id, t.id, 3
FROM defense_types d, technology_types t
WHERE d.code = 'light_laser' AND t.code = 'laser_tech';

-- Heavy Laser: Shipyard 4, Energy Tech 3, Laser Tech 6
INSERT INTO defense_requirements (defense_type_id, required_building_id, required_building_level)
SELECT d.id, b.id, 4
FROM defense_types d, building_types b
WHERE d.code = 'heavy_laser' AND b.code = 'shipyard';

INSERT INTO defense_requirements (defense_type_id, required_tech_id, required_tech_level)
SELECT d.id, t.id, 3
FROM defense_types d, technology_types t
WHERE d.code = 'heavy_laser' AND t.code = 'energy_tech';

INSERT INTO defense_requirements (defense_type_id, required_tech_id, required_tech_level)
SELECT d.id, t.id, 6
FROM defense_types d, technology_types t
WHERE d.code = 'heavy_laser' AND t.code = 'laser_tech';

-- Gauss Cannon: Shipyard 6, Energy Tech 6, Weapons Tech 3, Shielding Tech 1
INSERT INTO defense_requirements (defense_type_id, required_building_id, required_building_level)
SELECT d.id, b.id, 6
FROM defense_types d, building_types b
WHERE d.code = 'gauss_cannon' AND b.code = 'shipyard';

INSERT INTO defense_requirements (defense_type_id, required_tech_id, required_tech_level)
SELECT d.id, t.id, 6
FROM defense_types d, technology_types t
WHERE d.code = 'gauss_cannon' AND t.code = 'energy_tech';

INSERT INTO defense_requirements (defense_type_id, required_tech_id, required_tech_level)
SELECT d.id, t.id, 3
FROM defense_types d, technology_types t
WHERE d.code = 'gauss_cannon' AND t.code = 'weapons_tech';

INSERT INTO defense_requirements (defense_type_id, required_tech_id, required_tech_level)
SELECT d.id, t.id, 1
FROM defense_types d, technology_types t
WHERE d.code = 'gauss_cannon' AND t.code = 'shielding_tech';

-- Ion Cannon: Shipyard 4, Ion Tech 4
INSERT INTO defense_requirements (defense_type_id, required_building_id, required_building_level)
SELECT d.id, b.id, 4
FROM defense_types d, building_types b
WHERE d.code = 'ion_cannon' AND b.code = 'shipyard';

INSERT INTO defense_requirements (defense_type_id, required_tech_id, required_tech_level)
SELECT d.id, t.id, 4
FROM defense_types d, technology_types t
WHERE d.code = 'ion_cannon' AND t.code = 'ion_tech';

-- Plasma Turret: Shipyard 8, Plasma Tech 7
INSERT INTO defense_requirements (defense_type_id, required_building_id, required_building_level)
SELECT d.id, b.id, 8
FROM defense_types d, building_types b
WHERE d.code = 'plasma_turret' AND b.code = 'shipyard';

INSERT INTO defense_requirements (defense_type_id, required_tech_id, required_tech_level)
SELECT d.id, t.id, 7
FROM defense_types d, technology_types t
WHERE d.code = 'plasma_turret' AND t.code = 'plasma_tech';

-- Small Shield Dome: Shipyard 1, Shielding Tech 2
INSERT INTO defense_requirements (defense_type_id, required_building_id, required_building_level)
SELECT d.id, b.id, 1
FROM defense_types d, building_types b
WHERE d.code = 'small_shield_dome' AND b.code = 'shipyard';

INSERT INTO defense_requirements (defense_type_id, required_tech_id, required_tech_level)
SELECT d.id, t.id, 2
FROM defense_types d, technology_types t
WHERE d.code = 'small_shield_dome' AND t.code = 'shielding_tech';

-- Large Shield Dome: Shipyard 6, Shielding Tech 6
INSERT INTO defense_requirements (defense_type_id, required_building_id, required_building_level)
SELECT d.id, b.id, 6
FROM defense_types d, building_types b
WHERE d.code = 'large_shield_dome' AND b.code = 'shipyard';

INSERT INTO defense_requirements (defense_type_id, required_tech_id, required_tech_level)
SELECT d.id, t.id, 6
FROM defense_types d, technology_types t
WHERE d.code = 'large_shield_dome' AND t.code = 'shielding_tech';

-- Anti-Ballistic Missile: Missile Silo 2
INSERT INTO defense_requirements (defense_type_id, required_building_id, required_building_level)
SELECT d.id, b.id, 2
FROM defense_types d, building_types b
WHERE d.code = 'anti_ballistic_missile' AND b.code = 'missile_silo';

-- Interplanetary Missile: Missile Silo 4, Impulse Drive 1
INSERT INTO defense_requirements (defense_type_id, required_building_id, required_building_level)
SELECT d.id, b.id, 4
FROM defense_types d, building_types b
WHERE d.code = 'interplanetary_missile' AND b.code = 'missile_silo';

INSERT INTO defense_requirements (defense_type_id, required_tech_id, required_tech_level)
SELECT d.id, t.id, 1
FROM defense_types d, technology_types t
WHERE d.code = 'interplanetary_missile' AND t.code = 'impulse_drive';
