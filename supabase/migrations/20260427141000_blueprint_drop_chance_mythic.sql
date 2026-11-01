/*
  # Reducir tasa de drop de planos en expediciones a nivel MITICO
  Tasa anterior: 0.001 (0.1%)
  Tasa nueva:    0.0001 (0.01%) -> ~1 plano cada 10,000 expediciones que regresan.
*/

UPDATE expedition_blueprint_drop_config
SET drop_chance = 0.0001,
    updated_at = now()
WHERE id = 1;
