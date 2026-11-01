/*
  # Rebalance Falco-X Clasica (v2):
    - 1 Falco-X destruye 5 Estrellas de la Muerte
    - 6 Estrellas de la Muerte destruyen 1 Falco-X

  Cambios SOLO en `falco_x_clasica` (no se toca `deathstar`):
    - rapid_fire.deathstar: 20 -> 28
    (weapon_power se mantiene en 200,000)

  Calculo (combate por rondas, simultaneo):
    DS golpea Falco con 200,000/ronda (sin RF vs Falco).
    Falco golpea DS con 200,000 * 28 = 5,600,000/ronda.
    Falco HP total = 4,000,000 + 60,000 = 4,060,000.
    DS HP total   = 3,600,000 + 50,000 = 3,650,000.

    1 Falco vs 5 DS:
      - Falco aguanta: 4,060,000 / (5*200,000) = 4.06 rondas.
      - Falco mata 5 DS en: 5*3,650,000 / 5,600,000 = 3.26 rondas.
      => Falco-X GANA con 0.80 rondas de margen.

    6 DS vs 1 Falco:
      - Falco aguanta: 4,060,000 / (6*200,000) = 3.38 rondas.
      - Falco mata 6 DS en: 6*3,650,000 / 5,600,000 = 3.91 rondas.
      => 6 ESTRELLAS GANAN (Falco muere antes de la 6ta) con 0.53 rondas de margen.
*/

UPDATE ship_types
SET rapid_fire = COALESCE(rapid_fire, '{}'::jsonb) || jsonb_build_object('deathstar', 28)
WHERE code = 'falco_x_clasica';
