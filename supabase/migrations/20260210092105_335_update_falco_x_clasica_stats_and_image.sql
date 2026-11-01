/*
  # Update Falco-X Clasica Stats and Image

  1. Changes
    - New image URL
    - Attack: 500,000 -> 1,500,000
    - Shield: 150,000 -> 1,200,000
    - Cargo: 3,000,000 -> 500,000
    - Speed: 5,000 -> 35,000

  2. Notes
    - No other data modified
*/

UPDATE ship_types
SET
  image_url = 'https://photos.pinksale.finance/file/pinksale-logo-upload/1770714305421-e92fafc9777f9b43ae15adb556175ae3.jpg',
  weapon_power = 1500000,
  shield_power = 1200000,
  cargo_capacity = 500000,
  base_speed = 35000
WHERE code = 'falco_x_clasica';
