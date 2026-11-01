-- =============================================================================
-- Buff: Black Moon - Duplicar fuego rápido contra defensas
-- =============================================================================
-- La Black Moon tenía los mismos valores RF que el Bombardero, pero su coste
-- es muy superior. Se duplican los valores para que sea un verdadero
-- "mega-Bombardero" anti-defensas como está diseñada.
--
-- Cambios:
--   rocket_launcher: 20 → 40
--   light_laser:     20 → 40
--   heavy_laser:     10 → 20
--   ion_cannon:      10 → 20
--   gauss_cannon:     5 → 10
--   plasma_turret:    5 → 10
-- =============================================================================

UPDATE ship_types
SET rapid_fire = '{
  "rocket_launcher": 40,
  "light_laser": 40,
  "heavy_laser": 20,
  "gauss_cannon": 10,
  "ion_cannon": 20,
  "plasma_turret": 10,
  "espionage_probe": 15,
  "solar_satellite": 15
}'::jsonb
WHERE code = 'black_moon';
