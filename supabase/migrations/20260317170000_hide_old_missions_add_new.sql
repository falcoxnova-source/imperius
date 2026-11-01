/*
  # Hide old Twitter missions and add new one

  1. Deactivate ALL existing twitter missions (is_active = false)
  2. Insert new mission: "GN, #NovaArmy..."
  
  Only this new mission (and any future ones) will be visible to players.
*/

-- 1. Hide all missions EXCEPT the one we want to keep active
UPDATE twitter_missions
SET is_active = false
WHERE is_active = true
  AND tweet_id != '2033753282175209924';

-- 2. Add the new mission (if it doesn't exist yet)
INSERT INTO twitter_missions (tweet_id, tweet_url, description, hashtag, is_active)
VALUES (
  '2033753282175209924',
  'https://x.com/FalcoX_universe/status/2033753282175209924',
  'GN, #NovaArmy Although, I don''t know... because something tells me that they''re most active at night...',
  '#NovaArmy',
  true
)
ON CONFLICT (tweet_id) DO UPDATE SET is_active = true;
