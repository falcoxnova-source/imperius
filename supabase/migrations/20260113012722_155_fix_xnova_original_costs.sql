/*
  # Fix costs to match original XNova/OGame values

  1. Buildings - Fix cost factors
    - Metal Mine: 1.5 (was 1.60)
    - Deuterium Synthesizer: 1.5 (was 1.60)
    - Solar Plant: 1.5 (was 1.55)

  2. Ships - Fix resource costs
    - Espionage Probe: 0 metal, 1000 crystal, 0 deuterium (was 500, 250, 0)
    - Solar Satellite: 0 metal, 2000 crystal, 500 deuterium (was 1500, 500, 0)

  3. Defenses - Fix resource costs
    - Anti-Ballistic Missile: 8000 metal, 0 crystal, 2000 deuterium (was 12500, 2500, 10000)
*/

UPDATE building_types SET cost_factor = 1.5 WHERE code = 'metal_mine';
UPDATE building_types SET cost_factor = 1.5 WHERE code = 'deuterium_synthesizer';
UPDATE building_types SET cost_factor = 1.5 WHERE code = 'solar_plant';

UPDATE ship_types SET metal_cost = 0, crystal_cost = 1000, deuterium_cost = 0 WHERE code = 'espionage_probe';
UPDATE ship_types SET metal_cost = 0, crystal_cost = 2000, deuterium_cost = 500 WHERE code = 'solar_satellite';

UPDATE defense_types SET metal_cost = 8000, crystal_cost = 0, deuterium_cost = 2000 WHERE code = 'anti_ballistic_missile';
