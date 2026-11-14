-- Telegram: vincular / unirse / salir solo lo ejecuta el bot (rol tung_bot) o la edge function (service_role).
REVOKE EXECUTE ON FUNCTION public.complete_telegram_link(text, bigint, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.process_telegram_join(bigint) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.process_telegram_leave(bigint) FROM PUBLIC, anon, authenticated;
