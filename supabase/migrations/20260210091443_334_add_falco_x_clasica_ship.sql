/*
  # Add Falco-X Clasica Ship (Coming Soon)

  1. New Ship
    - `falco_x_clasica` added to `ship_types` table
    - Category: special
    - Stats: 500,000 attack, 150,000 shield, 20,000,000 hull
    - Speed: 5,000 | Cargo: 3,000,000
    - Cost: 15M metal, 12M crystal, 5M deuterium
    - Build time: 500,000 seconds (~5.8 days)
    - Massive rapid fire against most units

  2. Requirements (10 total - extremely demanding)
    - Hangar level 15
    - Propulsor Hiperespacial level 15
    - Tecnologia de Hiperespacio level 12
    - Tecnologia de Graviton level 3
    - Motor de Impulso level 12
    - Tecnologia Laser level 15
    - Tecnologia Ionica level 10
    - Tecnologia de Plasma level 10
    - Tecnologia de Blindaje level 12
    - Tecnologia de Armas level 12

  3. Notes
    - Stored as "special" category in DB
    - Coming soon status handled in frontend by ship code
    - Will require NFT ownership in a future update
    - No existing data is modified
*/

INSERT INTO ship_types (
  id, code, name, description, category,
  metal_cost, crystal_cost, deuterium_cost,
  build_time_seconds, structural_integrity, shield_power, weapon_power,
  cargo_capacity, base_speed, fuel_consumption,
  rapid_fire, image_url
)
VALUES (
  17,
  'falco_x_clasica',
  'Falco-X Clasica',
  'La nave mas poderosa jamas construida. Una maquina de guerra definitiva que requiere tecnologia de punta y un NFT exclusivo para ser ensamblada. Una sola Falco-X Clasica puede cambiar el curso de cualquier batalla.',
  'special',
  15000000, 12000000, 5000000,
  500000,
  20000000,
  150000,
  500000,
  3000000,
  5000,
  2000,
  '{"light_fighter": 500, "heavy_fighter": 300, "cruiser": 100, "battleship": 50, "battlecruiser": 50, "bomber": 40, "destroyer": 20, "star_destroyer": 5, "black_moon": 3, "deathstar": 2, "small_cargo": 1000, "large_cargo": 500, "recycler": 500, "espionage_probe": 2000, "solar_satellite": 2000, "colony_ship": 500, "rocket_launcher": 1000, "light_laser": 500, "heavy_laser": 200, "gauss_cannon": 50, "ion_cannon": 100, "plasma_turret": 20}'::jsonb,
  'https://photos.pinksale.finance/file/pinksale-logo-upload/1768281226806-7d493aae390e834e9654df6d97b11a99.jpg'
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO ship_requirements (ship_type_id, required_building_id, required_building_level, required_tech_id, required_tech_level)
VALUES
  (17, 11, 15, NULL, NULL),
  (17, NULL, NULL, 8, 15),
  (17, NULL, NULL, 4, 12),
  (17, NULL, NULL, 15, 3),
  (17, NULL, NULL, 7, 12),
  (17, NULL, NULL, 2, 15),
  (17, NULL, NULL, 3, 10),
  (17, NULL, NULL, 5, 10),
  (17, NULL, NULL, 11, 12),
  (17, NULL, NULL, 9, 12);
