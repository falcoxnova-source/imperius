/*
  # Remove expedition extra fee

  1. Changes
    - Sets `expedition_extra_fee_fxu` to 0 in `game_settings`
    - All expeditions are now free regardless of how many are active simultaneously

  2. Notes
    - The fee logic in `secure_send_fleet` checks this setting value
    - Setting it to 0 means the fee check passes without charging anything
    - No functions need to be modified
*/

UPDATE game_settings
SET value = '0'
WHERE key = 'expedition_extra_fee_fxu';
