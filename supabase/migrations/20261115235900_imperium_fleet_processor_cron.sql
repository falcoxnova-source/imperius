/*
  Imperium: procesamiento global de flotas en servidor.

  Problema: imperium-db no tenia ningun disparador para process_all_pending_fleets()
  (el crontab del host solo lo ejecuta contra xnova-database). Las flotas solo se
  resolvian cuando el cliente del atacante llamaba process_user_pending_fleets, asi
  que si el atacante se desconectaba el ataque quedaba en 00:00 indefinidamente.

  Solucion: programar la funcion existente (sin cambios de logica) con pg_cron.
  pg_cron no solapa ejecuciones del mismo job y process_fleet_arrival usa FOR UPDATE,
  por lo que convive con las llamadas del cliente.
*/
SELECT cron.schedule('process-pending-fleets', '30 seconds', 'SELECT public.process_all_pending_fleets()');
