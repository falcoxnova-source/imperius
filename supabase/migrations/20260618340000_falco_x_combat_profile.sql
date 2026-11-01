/*
  # Falco-X Clasica: ajuste perfil de combate
  - Carga reducida tipo Estrella de la Muerte (poca, es nave de combate)
  - Velocidad al menos 10x la Estrella (Deathstar=200 -> Falco=2500)
*/

UPDATE ship_types
SET
  cargo_capacity = 7000000,   -- igual que Deathstar (poca carga, perfil combate)
  base_speed = 2500           -- 12.5x mas rapida que la Estrella de la Muerte
WHERE code = 'falco_x_clasica';
