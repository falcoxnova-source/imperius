SELECT cron.schedule('cleanup_old_broadcast_messages', '0 3 * * *', 'DELETE FROM public.messages WHERE message_type = ''broadcast'' AND created_at < NOW() - INTERVAL ''7 days''');
SELECT cron.schedule('fetch-twitter-missions', '*/5 * * * *', '
  SELECT net.http_post(
    url := c.supabase_project_url || ''/functions/v1/fetch-twitter-missions'',
    headers := jsonb_build_object(
      ''Content-Type'', ''application/json'',
      ''Authorization'', ''Bearer '' || c.supabase_anon_key
    ),
    body := ''{}''::jsonb
  )
  FROM twitter_social_config c
  WHERE c.supabase_project_url IS NOT NULL
    AND c.supabase_anon_key IS NOT NULL
  LIMIT 1;
  ');
SELECT cron.schedule('cleanup-http-response', '0 4 * * *', 'DELETE FROM net._http_response WHERE created < now() - interval ''24 hours''');
SELECT cron.schedule('cleanup-old-completed-fleets', '0 5 * * 0', 'DELETE FROM fleets WHERE is_completed = true AND arrival_time < now() - interval ''30 days''');
SELECT cron.schedule('cleanup-cron-run-details', '30 4 * * *', 'DELETE FROM cron.job_run_details WHERE end_time < now() - interval ''7 days''');
SELECT cron.schedule('cleanup-old-game-messages', '30 3 * * *', 'DELETE FROM public.messages 
    WHERE (
      (message_type IN (''expedition'', ''espionage'') AND created_at < now() - interval ''7 days'')
      OR (message_type = ''system'' AND created_at < now() - interval ''7 days'')
      OR (message_type = ''combat'' AND created_at < now() - interval ''7 days'')
    )');
SELECT cron.schedule('p2p_expire_offers_every_15min', '*/15 * * * *', 'SELECT public.p2p_expire_stale_offers();');
SELECT cron.schedule('auto-cancel-insufficient-listings', '*/3 * * * *', 'SELECT public.auto_cancel_insufficient_market_listings();');
SELECT cron.schedule('clean_expired_cosmetics_every_5min', '*/5 * * * *', 'SELECT public.clean_all_expired_cosmetics();');
SELECT cron.schedule('distribute-treasure-pool', '5 0 * * *', 'SELECT admin_distribute_treasure_pool()');
SELECT cron.schedule('lottery-auto-draw', '10 0 * * *', 'SELECT public.cron_execute_lottery_draw();');
SELECT cron.schedule('distribute-top50-pool', '15 0 * * *', 'SELECT public.admin_distribute_monthly_pool()');
SELECT cron.schedule('enforce-alliance-member-limits', '*/10 * * * *', 'SELECT public.cron_enforce_alliance_member_limits();');
SELECT cron.schedule('research-orphan-tick', '* * * * *', 'SELECT public.cron_promote_orphan_research();');
SELECT cron.schedule('expire-market-offers-24h', '*/5 * * * *', 'SELECT public.cron_expire_market_offers();');
SELECT cron.schedule('bot_tick_worker', '10 seconds', 'SELECT public.bot_tick_worker();');
SELECT cron.schedule('raffle-auto-draw', '* * * * *', 'SELECT public.cron_execute_raffle_draws();');
SELECT cron.schedule('update-player-rankings', '* * * * *', 'SELECT public.update_all_rankings();');
SELECT cron.schedule('hero-duel-resolve', '* * * * *', 'SELECT public.resolve_hero_duel(id) FROM public.hero_duels WHERE status = ''accepted'' AND resolves_at <= now()');
SELECT cron.schedule('battleship-tick', '10 seconds', 'SELECT public.battleship_tick()');
SELECT cron.schedule('sports-football-tick', '* * * * *', 'SELECT public._sports_cron_tick()');
SELECT cron.schedule('battleship-daily-pool', '1 0 * * *', 'SELECT public.battleship_daily_pool_payout()');
SELECT cron.schedule('occupation-build-tick', '* * * * *', 'SELECT public._occ_cron_tick()');
SELECT cron.schedule('online-players-cache', '30 seconds', 'SELECT public._refresh_online_players_cache()');
SELECT cron.schedule('enforce_depot_defense', '* * * * *', 'SELECT public._cron_enforce_depot_defense()');
SELECT cron.schedule('battleship-tournament-tick', '10 seconds', 'SELECT public.battleship_tournament_tick()');
