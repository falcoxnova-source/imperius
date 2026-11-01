/*
  # Actualizar imágenes de defensas

  - Cúpula Pequeña de Escudo (small_shield_dome): nueva imagen PNG
  - Cúpula Grande de Escudo (large_shield_dome): nueva imagen PNG
  - Misil de Intercepción (anti_ballistic_missile): nueva imagen PNG
  - Misil Interplanetario (interplanetary_missile): nueva imagen PNG
*/

UPDATE defense_types SET image_url = 'https://photos.pinksale.finance/file/pinksale-logo-upload/1773846095217-5353927895c2bdac39271080f143f555.png' WHERE code = 'small_shield_dome';
UPDATE defense_types SET image_url = 'https://photos.pinksale.finance/file/pinksale-logo-upload/1773846155115-a056cb04d7940e362015b7741cef9d51.png' WHERE code = 'large_shield_dome';
UPDATE defense_types SET image_url = 'https://photos.pinksale.finance/file/pinksale-logo-upload/1773846392291-6a9787882dbffc02f59157f80230a63b.png' WHERE code = 'anti_ballistic_missile';
UPDATE defense_types SET image_url = 'https://photos.pinksale.finance/file/pinksale-logo-upload/1773846392291-6a9787882dbffc02f59157f80230a63b.png' WHERE code = 'interplanetary_missile';
