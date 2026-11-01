-- BPFALCO1: retirar de la venta (tienda) el plano Falco-X.
-- No se toca is_active (significa "esta unidad usa planos" en el astillero).
-- Nueva bandera is_for_sale: controla solo la compra en tienda.

SET lock_timeout = '5s';

ALTER TABLE public.ship_blueprints
  ADD COLUMN IF NOT EXISTS is_for_sale boolean NOT NULL DEFAULT true;

UPDATE public.ship_blueprints
SET is_for_sale = false
WHERE code = 'bp_falco_x_clasica';

DO $$
DECLARE
  v_def text;
  v_old text := 'WHERE code = p_blueprint_code AND is_active = true;';
  v_new text := 'WHERE code = p_blueprint_code AND is_active = true AND is_for_sale = true;';
  v_n int;
BEGIN
  SELECT replace(pg_get_functiondef('public.purchase_ship_blueprint(text,uuid)'::regprocedure), chr(13), '')
  INTO v_def;

  v_n := (length(v_def) - length(replace(v_def, v_old, ''))) / length(v_old);
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'BPFALCO1: anchor count = % (esperado 1)', v_n;
  END IF;

  EXECUTE replace(v_def, v_old, v_new);
END $$;

NOTIFY pgrst, 'reload schema';
