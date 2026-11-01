/*
  # Fix duplicate declarations in secure_send_fleet

  Al aplicar dos veces el parche de Mega Reciclador, quedaron duplicadas:
    - DECLARE v_mega_recycler_type_id int;
    - SELECT id INTO v_mega_recycler_type_id FROM ship_types ...
    - "Recycler or Mega Recycler or Mega Recycler" en el mensaje

  Este parche limpia esas duplicaciones reescribiendo en sitio.
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
    RAISE NOTICE 'secure_send_fleet no existe';
    RETURN;
  END IF;

  v_new := v_def;

  -- Quitar declaracion duplicada
  v_new := replace(
    v_new,
    E'v_mega_recycler_type_id int;\n  v_mega_recycler_type_id int;',
    'v_mega_recycler_type_id int;'
  );

  -- Quitar SELECT duplicado
  v_new := replace(
    v_new,
    E'SELECT id INTO v_mega_recycler_type_id FROM ship_types WHERE code = ''mega_recycler'';\n  SELECT id INTO v_mega_recycler_type_id FROM ship_types WHERE code = ''mega_recycler'';',
    'SELECT id INTO v_mega_recycler_type_id FROM ship_types WHERE code = ''mega_recycler'';'
  );

  -- Quitar duplicacion del mensaje
  v_new := replace(
    v_new,
    'Recycler or Mega Recycler or Mega Recycler',
    'Recycler or Mega Recycler'
  );

  IF v_new = v_def THEN
    RAISE NOTICE 'Nada que limpiar';
    RETURN;
  END IF;

  EXECUTE v_new;
  RAISE NOTICE 'secure_send_fleet limpiada (sin duplicados)';
END;
$$;
