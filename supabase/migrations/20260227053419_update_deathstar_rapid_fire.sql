/*
  # Update Death Star (Estrella de la Muerte) rapid fire

  1. Changes
    - Add plasma_turret rapid fire value (25) that was missing
    - All other stats remain unchanged as they already match the requested values:
      - structural_integrity: 26,000,000
      - shield_power: 50,000
      - weapon_power: 200,000
      - cargo_capacity: 1,000,000
      - base_speed: 200
      - fuel_consumption: 1

  2. Rapid fire values (complete set):
    - small_cargo: 250, large_cargo: 250
    - light_fighter: 200, heavy_fighter: 100
    - cruiser: 33, battleship: 30
    - colony_ship: 250, recycler: 250
    - espionage_probe: 1250, bomber: 25
    - solar_satellite: 1250, destroyer: 5
    - battlecruiser: 15, plasma_turret: 25
    - rocket_launcher: 200, light_laser: 200
    - heavy_laser: 100, gauss_cannon: 50
    - ion_cannon: 100
*/

UPDATE ship_types
SET rapid_fire = '{
  "small_cargo": 250,
  "large_cargo": 250,
  "light_fighter": 200,
  "heavy_fighter": 100,
  "cruiser": 33,
  "battleship": 30,
  "colony_ship": 250,
  "recycler": 250,
  "espionage_probe": 1250,
  "bomber": 25,
  "solar_satellite": 1250,
  "destroyer": 5,
  "battlecruiser": 15,
  "plasma_turret": 25,
  "rocket_launcher": 200,
  "light_laser": 200,
  "heavy_laser": 100,
  "gauss_cannon": 50,
  "ion_cannon": 100
}'::jsonb
WHERE code = 'deathstar';
