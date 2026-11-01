/*
  # Rebalancear Luna Negra

  Las stats actuales son desproporcionadas respecto a su costo (7.2x el Destructor).
  Se ajustan stats proporcionalmente al ratio de costo, con velocidad baja (tanque lento)
  y el excedente de velocidad transferido a cargo.

  - Ataque: 150000 → 16000
  - Escudo: 35000 → 3600
  - Casco: ? → 792000
  - Cargo: 750000 → 15900
  - Velocidad: 120 → 400
  - Consumo: 10000 → 7200
*/

UPDATE ship_types
SET weapon_power = 16000,
    shield_power = 3600,
    structural_integrity = 792000,
    cargo_capacity = 15900,
    base_speed = 400,
    fuel_consumption = 7200
WHERE code = 'black_moon';
