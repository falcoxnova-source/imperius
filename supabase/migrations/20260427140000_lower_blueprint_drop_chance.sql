/*
  # Reducir tasa de drop de planos en expediciones
  Tasa anterior: 0.01 (1%)  -> demasiado generosa segun feedback de jugadores.
  Tasa nueva:    0.001 (0.1%) -> ~1 plano cada 1,000 expediciones que regresan.

  Solo cambia la configuracion en `expedition_blueprint_drop_config`.
  No se modifica la funcion ni el trigger.
*/

UPDATE expedition_blueprint_drop_config
SET drop_chance = 0.001,
    updated_at = now()
WHERE id = 1;
