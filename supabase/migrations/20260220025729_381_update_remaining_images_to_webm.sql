/*
  # Update remaining static images to webm videos

  1. Changes
    - Update all remaining building_types with static PNG/JPG images to use webm videos from CDN
    - Update all remaining ship_types with static PNG/JPG images to use webm videos from CDN
    - Update all remaining defense_types with static PNG/JPG images to use webm videos from CDN
    - Update all remaining technology_types with static PNG/JPG images to use webm videos from CDN

  2. Affected Items
    - Buildings: Fabrica de Robots, Laboratorio de Investigacion, Terraformador, Base Lunar, Portal de Salto
    - Ships: Destructor de Estrellas, Luna Negra, Falco-X Clasica
    - Defenses: Canon de Gauss, Canon Ionico, Torreta de Plasma, Misil de Intercepcion, Misil Interplanetario
    - Technologies: Tecnologia de Energia, Tecnologia Ionica, Motor de Impulso, Propulsor Hiperespacial,
      Tecnologia de Armas, Tecnologia de Espionaje, Tecnologia de Computacion, Astrofisica, Tecnologia de Graviton

  3. Notes
    - Only updates items that currently have non-webm URLs
    - Items already using webm videos are left untouched
*/

-- Building types
UPDATE building_types SET image_url = 'https://cdn.falco-xnova.xyz/videos/fabrica-de-robots.webm' WHERE id = 9 AND image_url NOT LIKE '%.webm';
UPDATE building_types SET image_url = 'https://cdn.falco-xnova.xyz/videos/laboratorio-de-investigacion.webm' WHERE id = 12 AND image_url NOT LIKE '%.webm';
UPDATE building_types SET image_url = 'https://cdn.falco-xnova.xyz/videos/terraformador.webm' WHERE id = 14 AND image_url NOT LIKE '%.webm';
UPDATE building_types SET image_url = 'https://cdn.falco-xnova.xyz/videos/base-lunar.webm' WHERE id = 15 AND image_url NOT LIKE '%.webm';
UPDATE building_types SET image_url = 'https://cdn.falco-xnova.xyz/videos/portal-de-salto.webm' WHERE id = 17 AND image_url NOT LIKE '%.webm';

-- Ship types
UPDATE ship_types SET image_url = 'https://cdn.falco-xnova.xyz/videos/destructor-de-estrellas.webm' WHERE id = 15 AND image_url NOT LIKE '%.webm';
UPDATE ship_types SET image_url = 'https://cdn.falco-xnova.xyz/videos/luna-negra.webm' WHERE id = 16 AND image_url NOT LIKE '%.webm';
UPDATE ship_types SET image_url = 'https://cdn.falco-xnova.xyz/videos/falco-x-clasica.webm' WHERE id = 17 AND image_url NOT LIKE '%.webm';

-- Defense types
UPDATE defense_types SET image_url = 'https://cdn.falco-xnova.xyz/videos/canon-de-gauss.webm' WHERE id = 4 AND image_url NOT LIKE '%.webm';
UPDATE defense_types SET image_url = 'https://cdn.falco-xnova.xyz/videos/canon-ionico.webm' WHERE id = 5 AND image_url NOT LIKE '%.webm';
UPDATE defense_types SET image_url = 'https://cdn.falco-xnova.xyz/videos/torreta-de-plasma.webm' WHERE id = 6 AND image_url NOT LIKE '%.webm';
UPDATE defense_types SET image_url = 'https://cdn.falco-xnova.xyz/videos/misil-de-intercepcion.webm' WHERE id = 9 AND image_url NOT LIKE '%.webm';
UPDATE defense_types SET image_url = 'https://cdn.falco-xnova.xyz/videos/misil-interplanetario.webm' WHERE id = 10 AND image_url NOT LIKE '%.webm';

-- Technology types
UPDATE technology_types SET image_url = 'https://cdn.falco-xnova.xyz/videos/tecnologia-de-energia.webm' WHERE id = 1 AND image_url NOT LIKE '%.webm';
UPDATE technology_types SET image_url = 'https://cdn.falco-xnova.xyz/videos/tecnologia-ionica.webm' WHERE id = 3 AND image_url NOT LIKE '%.webm';
UPDATE technology_types SET image_url = 'https://cdn.falco-xnova.xyz/videos/motor-de-impulso.webm' WHERE id = 7 AND image_url NOT LIKE '%.webm';
UPDATE technology_types SET image_url = 'https://cdn.falco-xnova.xyz/videos/propulsor-hiperespacial.webm' WHERE id = 8 AND image_url NOT LIKE '%.webm';
UPDATE technology_types SET image_url = 'https://cdn.falco-xnova.xyz/videos/tecnologia-de-armas.webm' WHERE id = 9 AND image_url NOT LIKE '%.webm';
UPDATE technology_types SET image_url = 'https://cdn.falco-xnova.xyz/videos/tecnologia-de-espionaje.webm' WHERE id = 12 AND image_url NOT LIKE '%.webm';
UPDATE technology_types SET image_url = 'https://cdn.falco-xnova.xyz/videos/tecnologia-de-computacion.webm' WHERE id = 13 AND image_url NOT LIKE '%.webm';
UPDATE technology_types SET image_url = 'https://cdn.falco-xnova.xyz/videos/astrofisica.webm' WHERE id = 14 AND image_url NOT LIKE '%.webm';
UPDATE technology_types SET image_url = 'https://cdn.falco-xnova.xyz/videos/tecnologia-de-graviton.webm' WHERE id = 15 AND image_url NOT LIKE '%.webm';
