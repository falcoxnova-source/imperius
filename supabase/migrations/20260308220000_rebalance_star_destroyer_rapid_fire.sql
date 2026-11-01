-- =============================================================================
-- Rebalance: Rapid Fire del Destructor de Estrellas (star_destroyer)
-- =============================================================================
-- Los valores anteriores eran exagerados (x500, x150, x100) - nivel Estrella
-- de la Muerte. Se reducen a valores proporcionales (~3x del Destructor normal)
-- para que sea la nave de combate más poderosa sin romper el balance del juego.
-- =============================================================================

UPDATE ship_types
SET rapid_fire = '{
  "bomber": 3,
  "cruiser": 3,
  "recycler": 8,
  "battleship": 3,
  "large_cargo": 5,
  "small_cargo": 8,
  "heavy_fighter": 4,
  "light_fighter": 8,
  "espionage_probe": 15,
  "solar_satellite": 15
}'::jsonb
WHERE code = 'star_destroyer';
