/*
  # Update defense and building images batch 3

  1. Changes
    - rocket_launcher (Lanzamisiles): new PNG image
    - light_laser (Laser Ligero): new PNG image
    - heavy_laser (Laser Pesado): new PNG image
    - solar_plant (Planta de Energia Solar): new PNG image
*/

UPDATE defense_types SET image_url = 'https://photos.pinksale.finance/file/pinksale-logo-upload/1772006344340-a8042ea1241bbf465bd2e5ca5c3e8902.png' WHERE code = 'rocket_launcher';
UPDATE defense_types SET image_url = 'https://photos.pinksale.finance/file/pinksale-logo-upload/1772006374438-d0b593df91e3aba625971bdff9a51c8c.png' WHERE code = 'light_laser';
UPDATE defense_types SET image_url = 'https://photos.pinksale.finance/file/pinksale-logo-upload/1772006408958-c6948eb218f3cc54ae1d93a92c2507f7.png' WHERE code = 'heavy_laser';
UPDATE building_types SET image_url = 'https://photos.pinksale.finance/file/pinksale-logo-upload/1772006511680-d642ce045f08302b0d01562208da4763.png' WHERE code = 'solar_plant';
