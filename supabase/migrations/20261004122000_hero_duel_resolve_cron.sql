-- [HEROAUDIT1c] Resolver duelos de heroe vencidos aunque ningun participante abra la UI
SELECT cron.schedule('hero-duel-resolve', '* * * * *',
  $$SELECT public.resolve_hero_duel(id) FROM public.hero_duels WHERE status = 'accepted' AND resolves_at <= now()$$);
