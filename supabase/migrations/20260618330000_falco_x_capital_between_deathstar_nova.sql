/*
  # Falco-X Clasica: mover a naves capitales y reposicionar entre Deathstar y Nova

  Referencias:
    Estrella de la Muerte: atk 200k, shield 50k, HP 3.6M, cargo 1M, speed 200, cost 5M/4M/1M
    Nova:                  atk 150k, shield 70k, HP 4.4M, cargo 15M, speed 900, cost 6M/5M/2M

  Falco-X queda en el punto medio (mas cara que Deathstar, mas barata que Nova).
*/

UPDATE ship_types
SET
  category = 'special',
  weapon_power = 175000,           -- (200k + 150k) / 2
  shield_power = 60000,             -- (50k + 70k) / 2
  structural_integrity = 4000000,   -- (3.6M + 4.4M) / 2
  cargo_capacity = 8000000,         -- (1M + 15M) / 2
  base_speed = 550,                 -- (200 + 900) / 2
  metal_cost = 5500000,             -- (5M + 6M) / 2
  crystal_cost = 4500000,           -- (4M + 5M) / 2
  deuterium_cost = 1500000          -- (1M + 2M) / 2
WHERE code = 'falco_x_clasica';
