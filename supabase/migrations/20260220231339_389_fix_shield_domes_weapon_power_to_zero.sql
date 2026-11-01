/*
  # Fix shield domes weapon power - set to 0 (XNova authentic)

  1. Problem
    - Both `small_shield_dome` and `large_shield_dome` have `weapon_power = 1`
    - In classic XNova/OGame, shield domes NEVER attack - they only provide shields
    - This gave an unfair advantage to defenders as domes were dealing damage in combat

  2. Changes
    - Set `weapon_power = 0` for both `small_shield_dome` and `large_shield_dome`
    - The combat engine already handles weapon = 0 correctly (shots bounce or deal 0 damage)

  3. Impact
    - Shield domes will still absorb damage with their shield_power (2000 / 10000)
    - Shield domes will still have structural_integrity (20000 / 100000)
    - Shield domes will simply not deal any damage to attackers, matching XNova classic behavior
*/

UPDATE defense_types
SET weapon_power = 0
WHERE code IN ('small_shield_dome', 'large_shield_dome');
