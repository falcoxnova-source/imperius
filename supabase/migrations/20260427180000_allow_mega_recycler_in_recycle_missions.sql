/*
  # Permitir reciclar con Mega Reciclador (no solo el Reciclador clasico)

  La validacion en `secure_send_fleet` para mission_type='recycle'
  exigia que la flota llevara obligatoriamente al menos 1 nave del
  ship_type code='recycler'. Eso hacia imposible reciclar usando solo
  el Mega Reciclador (code='mega_recycler'), aunque tenga 1000x mas
  cargo y este pensado precisamente para recoger escombros.

  Este parche reescribe esa validacion en sitio, conservando todo lo
  demas, para que sea valido si la flota lleva >=1 reciclador clasico
  O >=1 mega reciclador.
*/

DO $$
DECLARE
  v_def text;
  v_new text;
BEGIN
  SELECT pg_get_functiondef(oid) INTO v_def
  FROM pg_proc
  WHERE proname = 'secure_send_fleet'
  LIMIT 1;

  IF v_def IS NULL THEN
    RAISE NOTICE 'secure_send_fleet no existe, abortando';
    RETURN;
  END IF;

  -- Reemplazar declaracion: añadir mega_recycler_type_id
  v_new := replace(
    v_def,
    'v_recycler_type_id int;',
    E'v_recycler_type_id int;\n  v_mega_recycler_type_id int;'
  );

  -- Reemplazar SELECT del recycler para añadir el otro lookup
  v_new := replace(
    v_new,
    E'SELECT id INTO v_recycler_type_id FROM ship_types WHERE code = ''recycler'';',
    E'SELECT id INTO v_recycler_type_id FROM ship_types WHERE code = ''recycler'';\n  SELECT id INTO v_mega_recycler_type_id FROM ship_types WHERE code = ''mega_recycler'';'
  );

  -- Reemplazar la condicion del WHERE para aceptar ambos tipos
  v_new := replace(
    v_new,
    'WHERE x.ship_type_id = v_recycler_type_id AND x.quantity >= 1;',
    'WHERE x.ship_type_id IN (v_recycler_type_id, v_mega_recycler_type_id) AND x.quantity >= 1;'
  );

  -- Mensaje de error mas claro
  v_new := replace(
    v_new,
    'Recycling requires a Recycler',
    'Recycling requires a Recycler or Mega Recycler'
  );

  IF v_new = v_def THEN
    RAISE NOTICE 'No se pudo aplicar el parche: las cadenas no coinciden';
    RETURN;
  END IF;

  EXECUTE v_new;
  RAISE NOTICE 'secure_send_fleet parcheada para aceptar Mega Reciclador';
END;
$$;
