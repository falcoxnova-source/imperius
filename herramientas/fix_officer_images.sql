-- Fix officer image_url values to match actual files in public/Imagenes/oficiales/
SET client_encoding TO 'UTF8';

BEGIN;

UPDATE officer_types SET image_url = '/Imagenes/oficiales/Androide AI.webp' WHERE code = 'android';
UPDATE officer_types SET image_url = '/Imagenes/oficiales/Comandante.webp' WHERE code = 'commander';
UPDATE officer_types SET image_url = '/Imagenes/oficiales/Armirante.webp' WHERE code = 'admiral';
UPDATE officer_types SET image_url = '/Imagenes/oficiales/Ingeniero.webp' WHERE code = 'engineer';
UPDATE officer_types SET image_url = '/Imagenes/oficiales/Geologo.webp' WHERE code = 'geologist';
UPDATE officer_types SET image_url = '/Imagenes/oficiales/Tecnocrata.webp' WHERE code = 'technocrat';

SELECT code, image_url FROM officer_types ORDER BY sort_order;

COMMIT;
