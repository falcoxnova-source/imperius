-- Dedicated least-privilege login role for the TUNG telegram bot.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'tung_bot') THEN
    CREATE ROLE tung_bot LOGIN;
  END IF;
END$$;

ALTER ROLE tung_bot WITH PASSWORD 'tbot_9f3Kx7Qw';
ALTER ROLE tung_bot BYPASSRLS;

GRANT EXECUTE ON FUNCTION public.complete_telegram_link(text, bigint, text) TO tung_bot;
GRANT EXECUTE ON FUNCTION public.process_telegram_join(bigint) TO tung_bot;
GRANT EXECUTE ON FUNCTION public.process_telegram_leave(bigint) TO tung_bot;

GRANT USAGE ON SCHEMA public TO tung_bot;
GRANT SELECT ON public.telegram_config, public.telegram_links, public.telegram_task_rewards TO tung_bot;
