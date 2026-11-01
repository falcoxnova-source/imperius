DROP VIEW IF EXISTS hero_ship_ranking_view CASCADE;

CREATE VIEW hero_ship_ranking_view AS
WITH wins AS (
  SELECT winner_id AS user_id, COUNT(*)::bigint AS cnt
  FROM hero_duels WHERE status = 'completed'
  GROUP BY winner_id
), losses AS (
  SELECT loser_id AS user_id, COUNT(*)::bigint AS cnt
  FROM hero_duels WHERE status = 'completed'
  GROUP BY loser_id
), agg AS (
  SELECT
    COALESCE(w.user_id, l.user_id) AS user_id,
    COALESCE(w.cnt, 0::bigint) AS wins,
    COALESCE(l.cnt, 0::bigint) AS losses,
    COALESCE(w.cnt, 0::bigint) + COALESCE(l.cnt, 0::bigint) AS total_battles,
    CASE
      WHEN COALESCE(w.cnt, 0::bigint) + COALESCE(l.cnt, 0::bigint) > 0
      THEN round((COALESCE(w.cnt, 0::bigint)::numeric / (COALESCE(w.cnt, 0::bigint) + COALESCE(l.cnt, 0::bigint))::numeric) * 100::numeric, 1)
      ELSE 0::numeric
    END AS win_rate
  FROM wins w FULL JOIN losses l ON l.user_id = w.user_id
)
SELECT
  row_number() OVER (ORDER BY a.wins DESC, a.win_rate DESC, a.total_battles DESC)::integer AS rank,
  a.user_id,
  p.username,
  p.avatar_url,
  a.wins,
  a.losses,
  a.total_battles,
  a.win_rate,
  s.level,
  s.xp,
  s.hp,
  s.hp_max,
  s.attack_points,
  s.defense_points,
  s.shield_points,
  s.speed_points,
  w.name AS weapon_name,
  w.rarity AS weapon_rarity,
  sh.name AS shield_name,
  sh.rarity AS shield_rarity,
  m.name AS module_name,
  m.rarity AS module_rarity,
  r.name AS reactor_name,
  r.rarity AS reactor_rarity
    FROM agg a
    LEFT JOIN profiles p ON p.id = a.user_id
    LEFT JOIN user_hero_ships s ON s.user_id = a.user_id
    WHERE (p.is_admin IS NOT TRUE OR p.is_admin IS NULL)
LEFT JOIN hero_ship_items w ON w.id = s.weapon_slot
LEFT JOIN hero_ship_items sh ON sh.id = s.shield_slot
LEFT JOIN hero_ship_items m ON m.id = s.module_slot
LEFT JOIN hero_ship_items r ON r.id = s.reactor_slot
ORDER BY a.wins DESC, a.win_rate DESC, a.total_battles DESC;
