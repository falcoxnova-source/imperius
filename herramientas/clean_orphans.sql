-- Fix: planets uses user_id, not owner_id
DELETE FROM public.planets WHERE user_id NOT IN (SELECT id FROM auth.users);
-- Clean any other orphaned data
DELETE FROM public.fleets WHERE owner_id NOT IN (SELECT id FROM auth.users);
DELETE FROM public.building_queue WHERE user_id NOT IN (SELECT id FROM auth.users);
DELETE FROM public.research_queue WHERE user_id NOT IN (SELECT id FROM auth.users);
DELETE FROM public.shipyard_queue WHERE user_id NOT IN (SELECT id FROM auth.users);
DELETE FROM public.defenses WHERE user_id NOT IN (SELECT id FROM auth.users);
DELETE FROM public.alliance_members WHERE user_id NOT IN (SELECT id FROM auth.users);
-- Show counts
SELECT 'users' as tbl, count(*) FROM auth.users
UNION ALL SELECT 'profiles', count(*) FROM public.profiles
UNION ALL SELECT 'planets', count(*) FROM public.planets;
