#!/bin/bash
docker exec -i xnova-database psql -U postgres -d postgres -v ON_ERROR_STOP=1 <<'SQL'
BEGIN;
-- pick a real human planet
WITH p AS (
  SELECT id, user_id FROM public.planets
  WHERE planet_type='planet' AND NOT is_destroyed
  ORDER BY created_at LIMIT 1
)
SELECT id AS planet_id, user_id FROM p \gset

\echo '--- Set planet role to custom (constraint test) ---'
UPDATE public.planets SET autopilot_role='custom' WHERE id = :'planet_id';

\echo '--- Insert custom orders (buildings only, harmless) ---'
INSERT INTO public.ai_planet_custom_orders (id, planet_id, user_id, buildings, ships, defenses, research)
VALUES (gen_random_uuid(), :'planet_id', :'user_id',
        '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb)
ON CONFLICT DO NOTHING;

\echo '--- Enable autopilot on that user so tick reaches custom block ---'
UPDATE public.profiles SET autopilot_active=true WHERE id = :'user_id';

\echo '--- Run bot_ai_tick (should process the custom planet without error) ---'
SELECT public.bot_ai_tick();

\echo '--- Rolling back (no production change) ---'
ROLLBACK;
SQL
echo "EXIT: $?"
