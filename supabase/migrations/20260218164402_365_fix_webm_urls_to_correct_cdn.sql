/*
  # Fix all WebM video URLs to use correct CDN domain

  1. Changes
    - Updates all `image_url` fields from `https://falcox.net/xnova/` to `https://cdn.falco-xnova.xyz/videos/`
    - The old domain (falcox.net) returns 404 for all files
    - The correct CDN is `cdn.falco-xnova.xyz/videos/`
    - Also adds WebM videos for items that still had old PNG images where a WebM exists on CDN

  2. Tables Updated
    - `building_types`: All buildings with .webm URLs + deuterium_tank gets new webm
    - `ship_types`: All ships with .webm URLs, fix small_cargo filename with special char
    - `defense_types`: All defenses with .webm URLs
    - `technology_types`: All technologies with .webm URLs

  3. Important Notes
    - CDN file `nave-de-carga-pequeña.webm` has a tilde character in the filename
    - CDN file `nave-rande-de-carga.webm` appears to have a typo (missing 'g')
    - Items without a corresponding .webm on the CDN keep their current images
*/

-- BUILDINGS: Update existing .webm URLs to correct CDN
UPDATE building_types SET image_url = 'https://cdn.falco-xnova.xyz/videos/mina-de-metal.webm' WHERE code = 'metal_mine';
UPDATE building_types SET image_url = 'https://cdn.falco-xnova.xyz/videos/mina-de-cristal.webm' WHERE code = 'crystal_mine';
UPDATE building_types SET image_url = 'https://cdn.falco-xnova.xyz/videos/sintetizador-de-deuterio.webm' WHERE code = 'deuterium_synthesizer';
UPDATE building_types SET image_url = 'https://cdn.falco-xnova.xyz/videos/planta-de-energia-solar.webm' WHERE code = 'solar_plant';
UPDATE building_types SET image_url = 'https://cdn.falco-xnova.xyz/videos/reactor-de-fusion.webm' WHERE code = 'fusion_reactor';
UPDATE building_types SET image_url = 'https://cdn.falco-xnova.xyz/videos/almacen-de-metal.webm' WHERE code = 'metal_storage';
UPDATE building_types SET image_url = 'https://cdn.falco-xnova.xyz/videos/almacen-de-cristal.webm' WHERE code = 'crystal_storage';
UPDATE building_types SET image_url = 'https://cdn.falco-xnova.xyz/videos/almacen-de-deuterio.webm' WHERE code = 'deuterium_tank';
UPDATE building_types SET image_url = 'https://cdn.falco-xnova.xyz/videos/fabrica-de-nanobots.webm' WHERE code = 'nanite_factory';
UPDATE building_types SET image_url = 'https://cdn.falco-xnova.xyz/videos/hangar.webm' WHERE code = 'shipyard';
UPDATE building_types SET image_url = 'https://cdn.falco-xnova.xyz/videos/sensor-phalanx.webm' WHERE code = 'sensor_phalanx';
UPDATE building_types SET image_url = 'https://cdn.falco-xnova.xyz/videos/silo.webm' WHERE code = 'missile_silo';

-- SHIPS: Update existing .webm URLs to correct CDN
UPDATE ship_types SET image_url = 'https://cdn.falco-xnova.xyz/videos/caza-ligero.webm' WHERE code = 'light_fighter';
UPDATE ship_types SET image_url = 'https://cdn.falco-xnova.xyz/videos/caza-pesado.webm' WHERE code = 'heavy_fighter';
UPDATE ship_types SET image_url = 'https://cdn.falco-xnova.xyz/videos/crucero.webm' WHERE code = 'cruiser';
UPDATE ship_types SET image_url = 'https://cdn.falco-xnova.xyz/videos/nave-de-batalla.webm' WHERE code = 'battleship';
UPDATE ship_types SET image_url = 'https://cdn.falco-xnova.xyz/videos/acorazado.webm' WHERE code = 'battlecruiser';
UPDATE ship_types SET image_url = 'https://cdn.falco-xnova.xyz/videos/bombardero.webm' WHERE code = 'bomber';
UPDATE ship_types SET image_url = 'https://cdn.falco-xnova.xyz/videos/destructor.webm' WHERE code = 'destroyer';
UPDATE ship_types SET image_url = 'https://cdn.falco-xnova.xyz/videos/estrella-de-la-muerte.webm' WHERE code = 'deathstar';
UPDATE ship_types SET image_url = 'https://cdn.falco-xnova.xyz/videos/nave-de-carga-pequeña.webm' WHERE code = 'small_cargo';
UPDATE ship_types SET image_url = 'https://cdn.falco-xnova.xyz/videos/nave-rande-de-carga.webm' WHERE code = 'large_cargo';
UPDATE ship_types SET image_url = 'https://cdn.falco-xnova.xyz/videos/colonizador.webm' WHERE code = 'colony_ship';
UPDATE ship_types SET image_url = 'https://cdn.falco-xnova.xyz/videos/reciclador.webm' WHERE code = 'recycler';
UPDATE ship_types SET image_url = 'https://cdn.falco-xnova.xyz/videos/sonda-de-espionaje.webm' WHERE code = 'espionage_probe';
UPDATE ship_types SET image_url = 'https://cdn.falco-xnova.xyz/videos/satelite.webm' WHERE code = 'solar_satellite';

-- DEFENSES: Update existing .webm URLs to correct CDN
UPDATE defense_types SET image_url = 'https://cdn.falco-xnova.xyz/videos/lanza-misiles.webm' WHERE code = 'rocket_launcher';
UPDATE defense_types SET image_url = 'https://cdn.falco-xnova.xyz/videos/laser-pequeno.webm' WHERE code = 'light_laser';
UPDATE defense_types SET image_url = 'https://cdn.falco-xnova.xyz/videos/laser-pesado.webm' WHERE code = 'heavy_laser';
UPDATE defense_types SET image_url = 'https://cdn.falco-xnova.xyz/videos/cupula-pequena.webm' WHERE code = 'small_shield_dome';
UPDATE defense_types SET image_url = 'https://cdn.falco-xnova.xyz/videos/luna-negra.webm' WHERE code = 'large_shield_dome';

-- TECHNOLOGIES: Update existing .webm URLs to correct CDN
UPDATE technology_types SET image_url = 'https://cdn.falco-xnova.xyz/videos/motor-de-combustion.webm' WHERE code = 'combustion_drive';
UPDATE technology_types SET image_url = 'https://cdn.falco-xnova.xyz/videos/red-de-investigacion-intergalactica.webm' WHERE code = 'intergalactic_research_network';
UPDATE technology_types SET image_url = 'https://cdn.falco-xnova.xyz/videos/tecnologia-de-blindaje.webm' WHERE code = 'armour_tech';
UPDATE technology_types SET image_url = 'https://cdn.falco-xnova.xyz/videos/tecnologia-de-escudos.webm' WHERE code = 'shielding_tech';
UPDATE technology_types SET image_url = 'https://cdn.falco-xnova.xyz/videos/tecnologia-de-hiperespacio.webm' WHERE code = 'hyperspace_tech';
UPDATE technology_types SET image_url = 'https://cdn.falco-xnova.xyz/videos/tecnologia-de-plasma.webm' WHERE code = 'plasma_tech';
UPDATE technology_types SET image_url = 'https://cdn.falco-xnova.xyz/videos/tecnologia-laser.webm' WHERE code = 'laser_tech';
