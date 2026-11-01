/*
  # Rebalanceo de costos: Mega Reciclador y Falco-X Clásica
  
  Objetivo: que cada una sea la más cara de su categoría según su capacidad/poder.

  Mega Reciclador (civil): escalado x50 del Reciclador base (cargo 20k → 1M).
    Reciclador: M 10k / C 6k / D 2k = 18,000
    Mega x50:   M 500k / C 300k / D 100k = 900,000 total
    → 5x más cara que Fragata Grande (siguiente civil).

  Falco-X Clásica (combat): cost/weapon ratio ~67 (vs 56-90 de Star Destroyer y Black Moon).
    M 4,000,000 / C 3,000,000 / D 1,000,000 = 8,000,000 total
    → 8.9x más cara que Black Moon. Stats: weapon 120k, integrity 1.2M, shield 12k.

  Tiempos de construcción ajustados proporcionalmente.
*/

UPDATE ship_types
SET
  metal_cost     = 500000,
  crystal_cost   = 300000,
  deuterium_cost = 100000,
  build_time_seconds = 54000  -- 15 horas
WHERE code = 'mega_recycler';

UPDATE ship_types
SET
  metal_cost     = 4000000,
  crystal_cost   = 3000000,
  deuterium_cost = 1000000,
  build_time_seconds = 144000  -- 40 horas
WHERE code = 'falco_x_clasica';
