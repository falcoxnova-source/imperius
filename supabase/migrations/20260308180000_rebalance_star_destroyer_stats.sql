/*
  # Rebalancear Destructor de Estrellas

  Las stats actuales son ~50x las del Destructor normal, pero solo cuesta 2.8x más.
  Se ajustan todas las stats de combate a 2.8x las del Destructor para que sea proporcional al costo.

  - Ataque: 100000 → 5600
  - Escudo: 25000 → 1400
  - Casco: ? → 308000
  - Cargo: 500000 → 5600
  - Velocidad: 150 → 14000
  - Consumo: 5000 → 2800
*/

UPDATE ship_types
SET weapon_power = 5600,
    shield_power = 1400,
    structural_integrity = 308000,
    cargo_capacity = 5600,
    base_speed = 14000,
    fuel_consumption = 2800
WHERE code = 'star_destroyer';
