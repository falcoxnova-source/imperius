/*
  # Swap images between Deathstar and Star Destroyer

  1. Issue
    - The images for "Estrella de la Muerte" (deathstar) and "Destructor de Estrellas" (star_destroyer) were incorrectly assigned

  2. Fix
    - Swap the image_url values between these two ships
*/

UPDATE ship_types
SET image_url = CASE
  WHEN code = 'deathstar' THEN (SELECT image_url FROM ship_types WHERE code = 'star_destroyer')
  WHEN code = 'star_destroyer' THEN (SELECT image_url FROM ship_types WHERE code = 'deathstar')
END
WHERE code IN ('deathstar', 'star_destroyer');