/*
  Imperium: los jobs de Batalla Naval fallaban con "unauthorized".

  battleship_tournament_tick() y battleship_daily_pool_payout() exigen
  session_user = 'postgres', pero sus jobs de pg_cron estaban registrados con
  username = 'supabase_admin'. Se corrige solo el usuario de ejecucion de esos
  jobs; las funciones y su guarda de seguridad no cambian.
*/
UPDATE cron.job
   SET username = 'postgres'
 WHERE jobname IN ('battleship-daily-pool', 'battleship-tournament-tick');
