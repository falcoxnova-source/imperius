-- Los permisos venian del GRANT implicito a PUBLIC, por eso el REVOKE a
-- anon/authenticated no bastaba. Se retira de PUBLIC en las funciones que
-- ningun cliente debe invocar (no usadas por src/, ni por cron, ni por
-- ninguna otra funcion de la BD).
--
-- Las llamadas internas no se ven afectadas: son funciones SECURITY DEFINER
-- y se ejecutan con el rol propietario.
--
-- NO se tocan las que el frontend si usa:
--   process_completed_shipyard_queue(uuid)  y  instant_complete_shipyard_item(uuid)

BEGIN;

REVOKE EXECUTE ON FUNCTION public.process_next_shipyard_unit(uuid)
  FROM PUBLIC, anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.global_process_all_expired_queues()
  FROM PUBLIC, anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.instant_complete_shipyard(uuid, uuid)
  FROM PUBLIC, anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.process_shipyard_queue_internal(uuid, uuid)
  FROM PUBLIC, anon, authenticated;

-- process_all_user_shipyard_queues ya es correcta (delega en el procesador
-- por unidad), pero anon no tiene por que llamarla.
REVOKE EXECUTE ON FUNCTION public.process_all_user_shipyard_queues() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.process_all_user_shipyard_queues() TO authenticated;

-- Garantizar explicitamente lo que el frontend necesita.
GRANT EXECUTE ON FUNCTION public.process_completed_shipyard_queue(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.instant_complete_shipyard_item(uuid)   TO authenticated;

COMMIT;

SELECT p.proname, r.rolname, has_function_privilege(r.rolname, p.oid, 'EXECUTE') AS puede
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
CROSS JOIN (SELECT rolname FROM pg_roles WHERE rolname IN ('authenticated','anon')) r
WHERE n.nspname='public'
  AND p.proname IN ('process_next_shipyard_unit','global_process_all_expired_queues',
                    'process_all_user_shipyard_queues','process_completed_shipyard_queue',
                    'instant_complete_shipyard','instant_complete_shipyard_item',
                    'process_shipyard_queue_internal')
ORDER BY 1,2;
