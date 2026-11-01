/*
  # Update images for new ships

  1. Changes
    - Set image_url for Nova
    - Set image_url for Fragata Grande (large_frigate)
    - Set image_url for Destruccion Masiva
*/

UPDATE ship_types
SET image_url = 'https://photos.pinksale.finance/file/pinksale-logo-upload/1772161106215-e3255ef9a718881881974bffd9053311.png'
WHERE code = 'nova';

UPDATE ship_types
SET image_url = 'https://photos.pinksale.finance/file/pinksale-logo-upload/1772161688315-f5741ee808da404ba974e10fdc4f34f6.png'
WHERE code = 'large_frigate';

UPDATE ship_types
SET image_url = 'https://photos.pinksale.finance/file/pinksale-logo-upload/1772161947553-d10a478403f32771c3d8c726509e978e.png'
WHERE code = 'destruccion_masiva';
