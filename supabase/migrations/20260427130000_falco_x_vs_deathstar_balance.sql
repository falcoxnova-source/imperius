/*
  # Rebalance Falco-X Clásica para que:
    - 1 Falco-X destruya 4 Estrellas de la Muerte
    - 5 Estrellas de la Muerte destruyan 1 Falco-X

  Cambios SOLO en `falco_x_clasica` (no se toca `deathstar`):
    - weapon_power: 175,000 -> 200,000
    - rapid_fire.deathstar: 2 -> 20

  Justificacion (combate por rondas, simultaneo, sin RF de DS hacia Falco):
    DS golpea Falco con 200k por ronda (1 disparo/ronda contra Falco-X).
    Falco golpea DS con 200,000 * 20 = 4,000,000 por ronda (RF avg ~20).

    1 Falco vs 4 DS:
      - Falco aguanta: (4,000,000 + 60,000) / (4 * 200,000) = 5.08 rondas
      - Falco mata 4 DS en: 4 * (3,600,000 + 50,000) / 4,000,000 = 3.65 rondas
      => Falco-X gana con margen.

    5 DS vs 1 Falco:
      - Falco aguanta: 4,060,000 / (5 * 200,000) = 4.06 rondas
      - Falco mata 5 DS en: 5 * 3,650,000 / 4,000,000 = 4.56 rondas
      => 5 Estrellas ganan (Falco muere antes de matar a la 5ta).
*/

-- 1) Ajustar weapon_power
UPDATE ship_types
SET weapon_power = 200000
WHERE code = 'falco_x_clasica';

-- 2) Ajustar rapid_fire.deathstar de la Falco-X (NO se toca rapid_fire de la DS)
UPDATE ship_types
SET rapid_fire = COALESCE(rapid_fire, '{}'::jsonb) || jsonb_build_object('deathstar', 20)
WHERE code = 'falco_x_clasica';
