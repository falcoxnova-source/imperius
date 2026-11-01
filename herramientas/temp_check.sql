SELECT proname, proargnames::text FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND proname='resolve_hero_duel';
SELECT has_function_privilege('authenticated', 'resolve_hero_duel(uuid)', 'execute');
