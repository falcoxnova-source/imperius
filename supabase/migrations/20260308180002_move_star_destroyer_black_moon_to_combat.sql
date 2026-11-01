/*
  # Mover Star Destroyer y Black Moon a categoría combat

  Cambia la categoría de 'special' a 'combat' para que aparezcan
  en la sección "Naves de Combate" del astillero.
*/

UPDATE ship_types SET category = 'combat' WHERE code = 'star_destroyer';
UPDATE ship_types SET category = 'combat' WHERE code = 'black_moon';
