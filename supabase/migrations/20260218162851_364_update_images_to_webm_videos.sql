/*
  # Update item images to WebM video format

  1. Changes
    - Updates `image_url` for building_types, ship_types, defense_types, and technology_types
    - Replaces static PNG/JPG images with animated WebM videos from falcox.net CDN
    - Only updates items that have a corresponding WebM file available

  2. Items Updated
    - Buildings: 11 items (mina de metal, mina de cristal, sintetizador, solar plant, fusion reactor, metal storage, crystal storage, nanite factory, hangar, sensor phalanx, missile silo)
    - Ships: 14 items (all ships)
    - Defenses: 5 items (rocket launcher, light laser, heavy laser, small shield dome, large shield dome)
    - Technologies: 7 items (combustion drive, intergalactic research network, armour tech, shielding tech, hyperspace tech, plasma tech, laser tech)

  3. Important Notes
    - Items without a WebM file keep their current PNG/JPG images
    - Frontend components need to render <video> tags for .webm URLs instead of <img>
*/

-- BUILDINGS
UPDATE building_types SET image_url = 'https://falcox.net/xnova/mina-de-metal.webm' WHERE code = 'metal_mine';
UPDATE building_types SET image_url = 'https://falcox.net/xnova/mina-de-cristal.webm' WHERE code = 'crystal_mine';
UPDATE building_types SET image_url = 'https://falcox.net/xnova/sintetizador-de-deuterio.webm' WHERE code = 'deuterium_synthesizer';
UPDATE building_types SET image_url = 'https://falcox.net/xnova/planta-de-energia-solar.webm' WHERE code = 'solar_plant';
UPDATE building_types SET image_url = 'https://falcox.net/xnova/reactor-de-fusion.webm' WHERE code = 'fusion_reactor';
UPDATE building_types SET image_url = 'https://falcox.net/xnova/almacen-de-metal.webm' WHERE code = 'metal_storage';
UPDATE building_types SET image_url = 'https://falcox.net/xnova/almacen-de-cristal.webm' WHERE code = 'crystal_storage';
UPDATE building_types SET image_url = 'https://falcox.net/xnova/fabrica-de-nanobots.webm' WHERE code = 'nanite_factory';
UPDATE building_types SET image_url = 'https://falcox.net/xnova/hangar.webm' WHERE code = 'shipyard';
UPDATE building_types SET image_url = 'https://falcox.net/xnova/sensor-phalanx.webm' WHERE code = 'sensor_phalanx';
UPDATE building_types SET image_url = 'https://falcox.net/xnova/silo.webm' WHERE code = 'missile_silo';

-- SHIPS
UPDATE ship_types SET image_url = 'https://falcox.net/xnova/caza-ligero.webm' WHERE code = 'light_fighter';
UPDATE ship_types SET image_url = 'https://falcox.net/xnova/caza-pesado.webm' WHERE code = 'heavy_fighter';
UPDATE ship_types SET image_url = 'https://falcox.net/xnova/crucero.webm' WHERE code = 'cruiser';
UPDATE ship_types SET image_url = 'https://falcox.net/xnova/nave-de-batalla.webm' WHERE code = 'battleship';
UPDATE ship_types SET image_url = 'https://falcox.net/xnova/acorazado.webm' WHERE code = 'battlecruiser';
UPDATE ship_types SET image_url = 'https://falcox.net/xnova/bombardero.webm' WHERE code = 'bomber';
UPDATE ship_types SET image_url = 'https://falcox.net/xnova/destructor.webm' WHERE code = 'destroyer';
UPDATE ship_types SET image_url = 'https://falcox.net/xnova/estrella-de-la-muerte.webm' WHERE code = 'deathstar';
UPDATE ship_types SET image_url = 'https://falcox.net/xnova/nave-de-carga-pequena.webm' WHERE code = 'small_cargo';
UPDATE ship_types SET image_url = 'https://falcox.net/xnova/nave-grande-de-carga.webm' WHERE code = 'large_cargo';
UPDATE ship_types SET image_url = 'https://falcox.net/xnova/colonizador.webm' WHERE code = 'colony_ship';
UPDATE ship_types SET image_url = 'https://falcox.net/xnova/reciclador.webm' WHERE code = 'recycler';
UPDATE ship_types SET image_url = 'https://falcox.net/xnova/sonda-de-espionaje.webm' WHERE code = 'espionage_probe';
UPDATE ship_types SET image_url = 'https://falcox.net/xnova/satelite.webm' WHERE code = 'solar_satellite';

-- DEFENSES
UPDATE defense_types SET image_url = 'https://falcox.net/xnova/lanza-misiles.webm' WHERE code = 'rocket_launcher';
UPDATE defense_types SET image_url = 'https://falcox.net/xnova/laser-pequeno.webm' WHERE code = 'light_laser';
UPDATE defense_types SET image_url = 'https://falcox.net/xnova/laser-pesado.webm' WHERE code = 'heavy_laser';
UPDATE defense_types SET image_url = 'https://falcox.net/xnova/cupula-pequena.webm' WHERE code = 'small_shield_dome';
UPDATE defense_types SET image_url = 'https://falcox.net/xnova/luna-negra.webm' WHERE code = 'large_shield_dome';

-- TECHNOLOGIES
UPDATE technology_types SET image_url = 'https://falcox.net/xnova/motor-de-combustion.webm' WHERE code = 'combustion_drive';
UPDATE technology_types SET image_url = 'https://falcox.net/xnova/red-de-investigacion-intergalactica.webm' WHERE code = 'intergalactic_research_network';
UPDATE technology_types SET image_url = 'https://falcox.net/xnova/tecnologia-de-blindaje.webm' WHERE code = 'armour_tech';
UPDATE technology_types SET image_url = 'https://falcox.net/xnova/tecnologia-de-escudos.webm' WHERE code = 'shielding_tech';
UPDATE technology_types SET image_url = 'https://falcox.net/xnova/tecnologia-de-hiperespacio.webm' WHERE code = 'hyperspace_tech';
UPDATE technology_types SET image_url = 'https://falcox.net/xnova/tecnologia-de-plasma.webm' WHERE code = 'plasma_tech';
UPDATE technology_types SET image_url = 'https://falcox.net/xnova/tecnologia-laser.webm' WHERE code = 'laser_tech';
