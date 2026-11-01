/*
  # Actualizar casco (structural_integrity) de naves

  Solo se actualizan las naves que difieren del valor deseado:
  - Destructor de Estrellas (star_destroyer): 308000 → 300000
  - Luna Negra (black_moon): 792000 → 800000
  - Estrella de la Muerte (deathstar): 9000000 → 3150000
  - Nova (nova): 10100000 → 11000000
  - Destrucción Masiva (destruccion_masiva): 525000000 → 630000000
*/

UPDATE ship_types SET structural_integrity = 300000 WHERE code = 'star_destroyer';
UPDATE ship_types SET structural_integrity = 800000 WHERE code = 'black_moon';
UPDATE ship_types SET structural_integrity = 3150000 WHERE code = 'deathstar';
UPDATE ship_types SET structural_integrity = 11000000 WHERE code = 'nova';
UPDATE ship_types SET structural_integrity = 630000000 WHERE code = 'destruccion_masiva';
