-- Delete all users except the 2 keepers
-- First delete dependent data
DELETE FROM public.planets WHERE owner_id IN (SELECT id FROM auth.users WHERE email NOT IN ('falcoxcorp@gmail.com', 'jennierfs@gmail.com'));
DELETE FROM public.profiles WHERE id IN (SELECT id FROM auth.users WHERE email NOT IN ('falcoxcorp@gmail.com', 'jennierfs@gmail.com'));
DELETE FROM public.wallet_transactions WHERE user_id IN (SELECT id FROM auth.users WHERE email NOT IN ('falcoxcorp@gmail.com', 'jennierfs@gmail.com'));
-- Finally delete users
DELETE FROM auth.users WHERE email NOT IN ('falcoxcorp@gmail.com', 'jennierfs@gmail.com');
-- Show remaining
SELECT email FROM auth.users ORDER BY created_at;
