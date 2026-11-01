-- =============================================================================
-- Rebalance: Black Moon - Rol anti-defensas
-- =============================================================================
-- Se bajan stats base para que 1 Star Destroyer gane vs 1 Black Moon.
-- Se le da rapid_fire anti-defensas (como un mega-Bombardero).
-- El Star Destroyer queda como anti-naves, la Black Moon como anti-defensas.
--
-- Stats: weapon_power 16000→4800, shield_power 3600→1200, casco 792000→280000
-- Rapid Fire: fuerte contra todas las defensas, sin RF contra naves
-- =============================================================================

UPDATE ship_types
SET weapon_power = 4800,
    shield_power = 1200,
    structural_integrity = 280000,
    rapid_fire = '{
      "rocket_launcher": 20,
      "light_laser": 20,
      "heavy_laser": 10,
      "gauss_cannon": 5,
      "ion_cannon": 10,
      "plasma_turret": 5,
      "espionage_probe": 15,
      "solar_satellite": 15
    }'::jsonb
WHERE code = 'black_moon';
