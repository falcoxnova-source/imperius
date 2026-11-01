/*
  # Reducir casco de la Estrella de la Muerte a 2,700,000

  Objetivo: Que 3 Estrellas de la Muerte puedan destruir 1 en 6 rondas.
  
  Cálculo: 3 × (200,000 ataque - 50,000 escudo) × 6 rondas = 2,700,000

  Solo se cambia structural_integrity. Todo lo demás queda igual:
  - weapon_power: 200,000 (sin cambio)
  - shield_power: 50,000 (sin cambio)
  - cargo_capacity: 1,000,000 (sin cambio)
  - base_speed: 200 (sin cambio)
  - fuel_consumption: 1 (sin cambio)
  - rapid_fire: sin cambio
*/

UPDATE ship_types
SET structural_integrity = 2700000
WHERE code = 'deathstar';
