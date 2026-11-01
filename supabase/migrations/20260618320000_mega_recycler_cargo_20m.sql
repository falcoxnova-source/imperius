/*
  # Mega Reciclador: capacidad de carga 20M
*/
UPDATE ship_types
SET cargo_capacity = 20000000
WHERE code = 'mega_recycler';
