/*
  # Falco-X Universo - Datos Iniciales del Juego

  ## Descripcion
  Esta migracion inserta todos los datos de configuracion del juego:
  - 14 tipos de edificios (minas, almacenes, facilidades)
  - 15 tipos de tecnologias (basicas, propulsion, militares, avanzadas)
  - 14 tipos de naves (civiles, combate, especiales)
  - 10 tipos de defensas
  - Configuraciones iniciales del juego

  ## Balanceo
  Los costos y tiempos estan balanceados segun la formula clasica de OGame/XNova
*/

-- ============================================
-- TIPOS DE EDIFICIOS
-- ============================================
INSERT INTO building_types (code, name, description, category, base_metal, base_crystal, base_deuterium, base_energy, cost_factor, base_time_seconds) VALUES
-- Minas de Recursos
('metal_mine', 'Mina de Metal', 'Extrae metal del subsuelo del planeta. El metal es el recurso mas basico y abundante.', 'resources', 60, 15, 0, 10, 1.5, 60),
('crystal_mine', 'Mina de Cristal', 'Extrae cristal de las formaciones geologicas. Esencial para electronica y tecnologia.', 'resources', 48, 24, 0, 10, 1.6, 60),
('deuterium_synthesizer', 'Sintetizador de Deuterio', 'Extrae deuterio pesado de la atmosfera. Combustible para naves y reactores.', 'resources', 225, 75, 0, 20, 1.5, 60),
('solar_plant', 'Planta de Energia Solar', 'Genera energia mediante paneles solares. La base energetica de tu colonia.', 'resources', 75, 30, 0, 0, 1.5, 60),
('fusion_reactor', 'Reactor de Fusion', 'Genera energia mediante fusion nuclear. Consume deuterio pero es muy eficiente.', 'resources', 900, 360, 180, 0, 1.8, 120),

-- Almacenamiento
('metal_storage', 'Almacen de Metal', 'Aumenta la capacidad de almacenamiento de metal.', 'storage', 1000, 0, 0, 0, 2.0, 60),
('crystal_storage', 'Almacen de Cristal', 'Aumenta la capacidad de almacenamiento de cristal.', 'storage', 1000, 500, 0, 0, 2.0, 60),
('deuterium_tank', 'Deposito de Deuterio', 'Aumenta la capacidad de almacenamiento de deuterio.', 'storage', 1000, 1000, 0, 0, 2.0, 60),

-- Facilidades
('robotics_factory', 'Fabrica de Robots', 'Produce robots que aceleran la construccion de edificios.', 'facilities', 400, 120, 200, 0, 2.0, 120),
('nanite_factory', 'Fabrica de Nanobots', 'Nanobots microscopicos que aceleran drasticamente las construcciones.', 'facilities', 1000000, 500000, 100000, 0, 2.0, 600),
('shipyard', 'Hangar', 'Construye naves y defensas. Niveles mas altos permiten construcciones mas rapidas.', 'facilities', 400, 200, 100, 0, 2.0, 120),
('research_lab', 'Laboratorio de Investigacion', 'Permite investigar nuevas tecnologias. Esencial para el progreso.', 'facilities', 200, 400, 200, 0, 2.0, 120),
('missile_silo', 'Silo de Misiles', 'Almacena misiles de intercepcion y misiles interplanetarios.', 'facilities', 20000, 20000, 1000, 0, 2.0, 180),
('terraformer', 'Terraformador', 'Aumenta el numero de campos disponibles en el planeta.', 'facilities', 0, 50000, 100000, 1000, 2.0, 300);

-- ============================================
-- TIPOS DE TECNOLOGIAS
-- ============================================
INSERT INTO technology_types (code, name, description, category, base_metal, base_crystal, base_deuterium, cost_factor, base_time_seconds) VALUES
-- Tecnologias Basicas
('energy_tech', 'Tecnologia de Energia', 'Mejora la eficiencia de todas las plantas de energia.', 'basic', 0, 800, 400, 2.0, 120),
('laser_tech', 'Tecnologia Laser', 'Permite el desarrollo de armas y escudos basados en laser.', 'basic', 200, 100, 0, 2.0, 120),
('ion_tech', 'Tecnologia Ionica', 'Tecnologia avanzada para armas y escudos ionicos.', 'basic', 1000, 300, 100, 2.0, 180),
('hyperspace_tech', 'Tecnologia de Hiperespacio', 'Permite viajes mas rapidos a traves del hiperespacio.', 'basic', 0, 4000, 2000, 2.0, 240),
('plasma_tech', 'Tecnologia de Plasma', 'La tecnologia mas avanzada para armas de alta energia.', 'basic', 2000, 4000, 1000, 2.0, 300),

-- Tecnologias de Propulsion
('combustion_drive', 'Motor de Combustion', 'Motor basico para naves pequenas. Bajo consumo pero poca velocidad.', 'propulsion', 400, 0, 600, 2.0, 120),
('impulse_drive', 'Motor de Impulso', 'Motor intermedio con mejor velocidad y eficiencia.', 'propulsion', 2000, 4000, 600, 2.0, 180),
('hyperspace_drive', 'Propulsor Hiperespacial', 'El motor mas rapido. Permite viajes intergalacticos.', 'propulsion', 10000, 20000, 6000, 2.0, 300),

-- Tecnologias Militares
('weapons_tech', 'Tecnologia de Armas', 'Aumenta el poder de ataque de todas las unidades en 10% por nivel.', 'military', 800, 200, 0, 2.0, 120),
('shielding_tech', 'Tecnologia de Escudos', 'Aumenta la resistencia de escudos en 10% por nivel.', 'military', 200, 600, 0, 2.0, 120),
('armour_tech', 'Tecnologia de Blindaje', 'Aumenta la integridad estructural en 10% por nivel.', 'military', 1000, 0, 0, 2.0, 120),

-- Tecnologias Avanzadas
('espionage_tech', 'Tecnologia de Espionaje', 'Mejora la capacidad de espionaje y contra-espionaje.', 'advanced', 200, 1000, 200, 2.0, 120),
('computer_tech', 'Tecnologia de Computacion', 'Permite controlar mas flotas simultaneamente (+1 por nivel).', 'advanced', 0, 400, 600, 2.0, 120),
('astrophysics', 'Astrofisica', 'Permite colonizar mas planetas y enviar expediciones.', 'advanced', 4000, 8000, 4000, 1.75, 240),
('graviton_tech', 'Tecnologia de Graviton', 'Permite construir la Estrella de la Muerte.', 'advanced', 0, 0, 0, 3.0, 600);

-- ============================================
-- TIPOS DE NAVES
-- ============================================
INSERT INTO ship_types (code, name, description, category, metal_cost, crystal_cost, deuterium_cost, build_time_seconds, structural_integrity, shield_power, weapon_power, cargo_capacity, base_speed, fuel_consumption, rapid_fire) VALUES
-- Naves Civiles
('small_cargo', 'Nave Pequena de Carga', 'Nave de transporte basica con capacidad de 5,000 unidades.', 'civil', 2000, 2000, 0, 60, 4000, 10, 5, 5000, 5000, 10, '{"espionage_probe": 5, "solar_satellite": 5}'),
('large_cargo', 'Nave Grande de Carga', 'Nave de transporte pesada con capacidad de 25,000 unidades.', 'civil', 6000, 6000, 0, 120, 12000, 25, 5, 25000, 7500, 50, '{"espionage_probe": 5, "solar_satellite": 5}'),
('colony_ship', 'Nave Colonizadora', 'Permite establecer nuevas colonias en planetas deshabitados.', 'civil', 10000, 20000, 10000, 300, 30000, 100, 50, 7500, 2500, 1000, '{"espionage_probe": 5, "solar_satellite": 5}'),
('recycler', 'Reciclador', 'Recoge recursos de campos de escombros tras las batallas.', 'civil', 10000, 6000, 2000, 180, 16000, 10, 1, 20000, 2000, 300, '{"espionage_probe": 5, "solar_satellite": 5}'),
('espionage_probe', 'Sonda de Espionaje', 'Nave rapida para obtener informacion de planetas enemigos.', 'civil', 0, 1000, 0, 15, 1000, 0, 0, 5, 100000000, 1, '{}'),
('solar_satellite', 'Satelite Solar', 'Genera energia en orbita. Vulnerable a ataques.', 'civil', 0, 2000, 500, 30, 2000, 1, 1, 0, 0, 0, '{}'),

-- Naves de Combate
('light_fighter', 'Cazador Ligero', 'Nave de combate basica. Rapida pero fragil.', 'combat', 3000, 1000, 0, 45, 4000, 10, 50, 50, 12500, 20, '{"espionage_probe": 5, "solar_satellite": 5}'),
('heavy_fighter', 'Cazador Pesado', 'Version mejorada del cazador ligero con mejor blindaje.', 'combat', 6000, 4000, 0, 90, 10000, 25, 150, 100, 10000, 75, '{"espionage_probe": 5, "solar_satellite": 5, "small_cargo": 3}'),
('cruiser', 'Crucero', 'Nave versatil con fuego rapido contra cazadores.', 'combat', 20000, 7000, 2000, 180, 27000, 50, 400, 800, 15000, 300, '{"espionage_probe": 5, "solar_satellite": 5, "light_fighter": 6, "rocket_launcher": 10}'),
('battleship', 'Nave de Batalla', 'Nave de guerra pesada con gran poder de fuego.', 'combat', 45000, 15000, 0, 300, 60000, 200, 1000, 1500, 10000, 500, '{"espionage_probe": 5, "solar_satellite": 5}'),
('battlecruiser', 'Acorazado', 'Nave de combate equilibrada entre ataque y defensa.', 'combat', 30000, 40000, 15000, 360, 70000, 400, 700, 750, 10000, 250, '{"espionage_probe": 5, "solar_satellite": 5, "small_cargo": 3, "large_cargo": 3, "heavy_fighter": 4, "cruiser": 4, "battleship": 7}'),
('bomber', 'Bombardero', 'Especializado en destruir defensas planetarias.', 'combat', 50000, 25000, 15000, 420, 75000, 500, 1000, 500, 4000, 1000, '{"espionage_probe": 5, "solar_satellite": 5, "rocket_launcher": 20, "light_laser": 20, "heavy_laser": 10, "ion_cannon": 10, "gauss_cannon": 5, "plasma_turret": 5}'),
('destroyer', 'Destructor', 'Nave capital con fuego rapido contra naves de batalla.', 'combat', 60000, 50000, 15000, 480, 110000, 500, 2000, 2000, 5000, 1000, '{"espionage_probe": 5, "solar_satellite": 5, "light_laser": 10, "battlecruiser": 2}'),
('deathstar', 'Estrella de la Muerte', 'La nave mas poderosa. Puede destruir lunas.', 'special', 5000000, 4000000, 1000000, 3600, 9000000, 50000, 200000, 1000000, 100, 1, '{"espionage_probe": 1250, "solar_satellite": 1250, "small_cargo": 250, "large_cargo": 250, "light_fighter": 200, "heavy_fighter": 100, "cruiser": 33, "battleship": 30, "colony_ship": 250, "recycler": 250, "bomber": 25, "destroyer": 5, "battlecruiser": 15, "rocket_launcher": 200, "light_laser": 200, "heavy_laser": 100, "gauss_cannon": 50, "ion_cannon": 100}');

-- ============================================
-- TIPOS DE DEFENSAS
-- ============================================
INSERT INTO defense_types (code, name, description, metal_cost, crystal_cost, deuterium_cost, build_time_seconds, structural_integrity, shield_power, weapon_power) VALUES
('rocket_launcher', 'Lanzamisiles', 'Defensa basica y economica contra invasores.', 2000, 0, 0, 15, 2000, 20, 80),
('light_laser', 'Laser Ligero', 'Torreta laser basica con buen poder de fuego.', 1500, 500, 0, 20, 2000, 25, 100),
('heavy_laser', 'Laser Pesado', 'Torreta laser mejorada con mayor alcance y poder.', 6000, 2000, 0, 45, 8000, 100, 250),
('gauss_cannon', 'Canon de Gauss', 'Proyectiles de alta velocidad con gran penetracion.', 20000, 15000, 2000, 120, 35000, 200, 1100),
('ion_cannon', 'Canon Ionico', 'Desactiva sistemas electronicos enemigos.', 5000, 3000, 0, 60, 8000, 500, 150),
('plasma_turret', 'Torreta de Plasma', 'La defensa mas poderosa. Devastadora contra flotas.', 50000, 50000, 30000, 300, 100000, 300, 3000),
('small_shield_dome', 'Cupula Pequena de Escudo', 'Genera un campo de escudo sobre el planeta.', 10000, 10000, 0, 180, 20000, 2000, 1),
('large_shield_dome', 'Cupula Grande de Escudo', 'Campo de escudo avanzado con mayor cobertura.', 50000, 50000, 0, 300, 100000, 10000, 1),
('anti_ballistic_missile', 'Misil de Intercepcion', 'Intercepta misiles interplanetarios enemigos.', 8000, 0, 2000, 30, 8000, 1, 1),
('interplanetary_missile', 'Misil Interplanetario', 'Destruye defensas enemigas a distancia.', 12500, 2500, 10000, 60, 15000, 1, 12000);

-- ============================================
-- CONFIGURACION DEL JUEGO
-- ============================================
INSERT INTO game_settings (key, value, description) VALUES
('game_name', 'Falco-X Universo', 'Nombre del juego'),
('game_speed', '1', 'Multiplicador de velocidad del juego'),
('fleet_speed', '1', 'Multiplicador de velocidad de flotas'),
('resource_speed', '1', 'Multiplicador de produccion de recursos'),
('max_galaxies', '5', 'Numero maximo de galaxias'),
('max_systems', '499', 'Sistemas por galaxia'),
('max_planets_per_system', '15', 'Posiciones por sistema'),
('max_colonies', '9', 'Maximo de colonias por jugador'),
('debris_factor', '0.3', 'Porcentaje de recursos en escombros'),
('newbie_protection_points', '5000', 'Puntos maximos para proteccion de novatos'),
('vacation_mode_days', '2', 'Dias minimos en modo vacaciones'),
('dark_matter_start', '0', 'Materia oscura inicial');
