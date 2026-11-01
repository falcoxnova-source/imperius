/*
  # Loteria: sorteo AUTOMATICO semanal (wrapper para pg_cron)

  ## Problema
  - `execute_lottery_draw` exige `is_admin` via `auth.uid()`. Un cron corriendo como
    `postgres` no tiene JWT -> `auth.uid()` = NULL -> devolveria 'No autorizado'.
  - No existia NINGUN cron de loteria: los sorteos se ejecutaban a mano desde el panel
    admin, con retrasos de 4 a 8 dias (sorteo #6 cerro el 2-ago y se sorteo el 6-ago).

  ## Solucion
  - Wrapper `cron_execute_lottery_draw()` SECURITY DEFINER que:
    1. Verifica que la loteria este habilitada (`game_settings.lottery_enabled`).
    2. Busca SOLO sorteos `status='open'` cuyo `closes_at` YA VENCIO (nunca adelanta un sorteo).
    3. Inyecta el claim JWT del admin mas antiguo de forma LOCAL a la transaccion
       (`set_config(..., is_local => true)`) para que `auth.uid()` resuelva y el guard pase.
    4. Llama a `execute_lottery_draw(v_draw_id)` TAL CUAL. Cero duplicacion de logica.
    5. Restaura el claim previo pase lo que pase.
  - NO se otorga a `anon`/`authenticated`: solo el dueño de la BD (pg_cron) puede llamarla.
  - Cron diario 00:10 UTC: los sorteos cierran domingo 23:59 UTC, asi que se resuelven
    ~11 minutos despues. Si un dia falla, al dia siguiente se recupera solo.

  ## NO se modifica `execute_lottery_draw` ni la logica de premios.
*/

SET client_encoding TO 'UTF8';

CREATE OR REPLACE FUNCTION public.cron_execute_lottery_draw()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $fn$
DECLARE
  v_enabled     text;
  v_draw_id     uuid;
  v_draw_number integer;
  v_admin_id    uuid;
  v_prev_claims text;
  v_result      jsonb;
BEGIN
  -- 1) ¿Loteria habilitada?
  SELECT value INTO v_enabled FROM game_settings WHERE key = 'lottery_enabled';
  IF COALESCE(v_enabled, 'true') <> 'true' THEN
    RETURN jsonb_build_object('success', true, 'skipped', true,
                              'reason', 'Loteria deshabilitada en game_settings');
  END IF;

  -- 2) Solo sorteos ABIERTOS que YA CERRARON (nunca adelanta un sorteo en curso)
  SELECT id, draw_number INTO v_draw_id, v_draw_number
  FROM lottery_draws
  WHERE status = 'open' AND closes_at <= now()
  ORDER BY closes_at ASC
  LIMIT 1;

  IF v_draw_id IS NULL THEN
    RETURN jsonb_build_object('success', true, 'skipped', true,
                              'reason', 'No hay sorteo vencido pendiente');
  END IF;

  -- 3) Admin mas antiguo (el guard de execute_lottery_draw usa auth.uid())
  SELECT id INTO v_admin_id
  FROM profiles
  WHERE is_admin = true
  ORDER BY created_at ASC
  LIMIT 1;

  IF v_admin_id IS NULL THEN
    RETURN jsonb_build_object('success', false,
                              'error', 'No hay ninguna cuenta admin para autorizar el sorteo');
  END IF;

  v_prev_claims := COALESCE(current_setting('request.jwt.claims', true), '');
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', v_admin_id::text, 'role', 'authenticated')::text,
    true   -- LOCAL a la transaccion: se descarta al terminar
  );

  -- 4) Ejecutar el sorteo real (logica de premios INTACTA)
  BEGIN
    v_result := public.execute_lottery_draw(v_draw_id);
  EXCEPTION WHEN OTHERS THEN
    PERFORM set_config('request.jwt.claims', v_prev_claims, true);
    RAISE;
  END;

  -- 5) Restaurar contexto
  PERFORM set_config('request.jwt.claims', v_prev_claims, true);

  RETURN COALESCE(v_result, '{}'::jsonb)
         || jsonb_build_object('auto', true, 'executed_draw_number', v_draw_number);
END;
$fn$;

-- Solo el dueño de la BD / pg_cron. Los clientes NO pueden dispararlo.
REVOKE ALL ON FUNCTION public.cron_execute_lottery_draw() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.cron_execute_lottery_draw() FROM anon;
REVOKE ALL ON FUNCTION public.cron_execute_lottery_draw() FROM authenticated;

-- Cron diario 00:10 UTC (upsert por nombre)
SELECT cron.schedule(
  'lottery-auto-draw',
  '10 0 * * *',
  'SELECT public.cron_execute_lottery_draw();'
);

NOTIFY pgrst, 'reload schema';
