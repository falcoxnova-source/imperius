--
-- PostgreSQL database dump
--

-- Dumped from database version 15.1 (Ubuntu 15.1-1.pgdg20.04+1)
-- Dumped by pg_dump version 15.7 (Ubuntu 15.7-1.pgdg20.04+1)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Data for Name: schema_migrations; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--

SET SESSION AUTHORIZATION DEFAULT;

ALTER TABLE auth.schema_migrations DISABLE TRIGGER ALL;

COPY auth.schema_migrations (version) FROM stdin;
20171026211738
20171026211808
20171026211834
20180103212743
20180108183307
20180119214651
20180125194653
00
20210710035447
20210722035447
20210730183235
20210909172000
20210927181326
20211122151130
20211124214934
20211202183645
20220114185221
20220114185340
20220224000811
20220323170000
20220429102000
20220531120530
20220614074223
20220811173540
20221003041349
20221003041400
20221011041400
20221020193600
20221021073300
20221021082433
20221027105023
20221114143122
20221114143410
20221125140132
20221208132122
20221215195500
20221215195800
20221215195900
20230116124310
20230116124412
20230131181311
20230322519590
20230402418590
20230411005111
20230508135423
20230523124323
20230818113222
20230914180801
20231027141322
20231114161723
20231117164230
20240115144230
20240214120130
20240306115329
20240314092811
20240427152123
20240612123726
20240729123726
20240802193726
20240806073726
20241009103726
20250717082212
20250731150234
20250804100000
20250901200500
20250903112500
20250904133000
20250925093508
20251007112900
20251104100000
20251111201300
20251201000000
20260115000000
20260121000000
20260219120000
20260302000000
\.


ALTER TABLE auth.schema_migrations ENABLE TRIGGER ALL;

--
-- Data for Name: admin_config; Type: TABLE DATA; Schema: public; Owner: postgres
--

ALTER TABLE public.admin_config DISABLE TRIGGER ALL;

COPY public.admin_config (key, value, created_at) FROM stdin;
\.


ALTER TABLE public.admin_config ENABLE TRIGGER ALL;

--
-- Data for Name: admin_smtp_settings; Type: TABLE DATA; Schema: public; Owner: postgres
--

ALTER TABLE public.admin_smtp_settings DISABLE TRIGGER ALL;

COPY public.admin_smtp_settings (id, smtp_host, smtp_port, smtp_user, smtp_password, smtp_from_email, smtp_from_name, is_enabled, updated_at) FROM stdin;
1	smtp.resend.com	587	resend		noreply@falcoxnova.com	Falco-X Universo	t	2026-07-10 14:23:39.787416+00
\.


ALTER TABLE public.admin_smtp_settings ENABLE TRIGGER ALL;

--
-- Data for Name: admin_telegram_config; Type: TABLE DATA; Schema: public; Owner: postgres
--

ALTER TABLE public.admin_telegram_config DISABLE TRIGGER ALL;

COPY public.admin_telegram_config (id, bot_token_reference, group_chat_id, is_enabled, created_at, updated_at) FROM stdin;
893ba892-a4fc-4843-9f84-a7114230b22b	TELEGRAM_BOT_TOKEN	\N	f	2026-06-14 20:05:51.998146+00	2026-06-14 20:05:51.998146+00
\.


ALTER TABLE public.admin_telegram_config ENABLE TRIGGER ALL;

--
-- Data for Name: alliance_war_reserve_pool; Type: TABLE DATA; Schema: public; Owner: postgres
--

ALTER TABLE public.alliance_war_reserve_pool DISABLE TRIGGER ALL;

COPY public.alliance_war_reserve_pool (id, amount_fxu, updated_at) FROM stdin;
\.


ALTER TABLE public.alliance_war_reserve_pool ENABLE TRIGGER ALL;

--
-- Data for Name: battleship_config; Type: TABLE DATA; Schema: public; Owner: postgres
--

ALTER TABLE public.battleship_config DISABLE TRIGGER ALL;

COPY public.battleship_config (id, enabled, min_stake, max_stake, pool_pending, total_matches, total_wagered, total_fees, total_paid, updated_at, daily_pool, daily_pool_total_in, daily_pool_total_paid, daily_pool_last_day) FROM stdin;
1	t	0.10	1000	7.830000000000000000	137	3816.6600000000000000	424.884000000000000000	3391.776000000000000000	2026-10-22 00:01:00.097506+00	0.87200000000000000000	84.61200000	83.74000000000000000000	2026-10-21
\.


ALTER TABLE public.battleship_config ENABLE TRIGGER ALL;

--
-- Data for Name: building_types; Type: TABLE DATA; Schema: public; Owner: postgres
--

ALTER TABLE public.building_types DISABLE TRIGGER ALL;

COPY public.building_types (id, code, name, description, category, base_metal, base_crystal, base_deuterium, base_energy, cost_factor, base_time_seconds, max_level, image_url) FROM stdin;
4	solar_plant	Planta de Energia Solar	Genera energia mediante paneles solares. La base energetica de tu colonia.	resources	75	30	0	0	1.50	60	50	/Imagenes/edificios/PLANTA DE ENERGIA SOLAR.webp
21	university	Universidad	Estructura civil donde se forman los científicos de tu imperio. Cuanto mayor sea su nivel, más investigadores colaboran en el desarrollo tecnológico. Cada nivel de la Universidad reduce el tiempo de investigación en un 8%.	facilities	500000	300000	100000	0	2.00	3600	12	/Imagenes/edificios/Universidad.webp
1	metal_mine	Mina de Metal	Extrae metal del subsuelo del planeta. El metal es el recurso mas basico y abundante.	resources	60	15	0	10	1.50	60	50	/Imagenes/edificios/MINA DE METAL.webp
2	crystal_mine	Mina de Cristal	Extrae cristal de las formaciones geologicas. Esencial para electronica y tecnologia.	resources	48	24	0	10	1.60	60	50	/Imagenes/edificios/MINA DE CRYSTAL.webp
18	alliance_depot	Deposito de la Alianza	Permite que flotas aliadas puedan estacionar en tu planeta para ataques coordinados (ACS). Cada nivel aumenta los slots disponibles para flotas aliadas.	facilities	20000	40000	0	0	2.00	180	10	/Imagenes/edificios/Embajada.webp
5	fusion_reactor	Reactor de Fusion	Genera energia mediante fusion nuclear. Consume deuterio pero es muy eficiente.	resources	900	360	180	0	1.80	120	50	/Imagenes/edificios/PLANTA DE FUSION.webp
17	jump_gate	Portal de Salto	El portal de salto permite teleportar flotas instantaneamente entre lunas que tengan este edificio.	facilities	2000000	4000000	2000000	0	2.00	600	1	/Imagenes/edificios/Salto Cuantico.webp
15	lunar_base	Base Lunar	La base lunar es la instalacion principal necesaria para construir en una luna. Cada nivel proporciona campos adicionales.	facilities	20000	40000	20000	0	2.00	300	8	/Imagenes/edificios/Base Lunar.webp
6	metal_storage	Almacen de Metal	Aumenta la capacidad de almacenamiento de metal.	storage	1000	0	0	0	2.00	60	50	/Imagenes/edificios/ALMACEN DE METAL.webp
7	crystal_storage	Almacen de Cristal	Aumenta la capacidad de almacenamiento de cristal.	storage	1000	500	0	0	2.00	60	50	/Imagenes/edificios/ALMACEND DE CRISTAL .webp
8	deuterium_tank	Deposito de Deuterio	Aumenta la capacidad de almacenamiento de deuterio.	storage	1000	1000	0	0	2.00	60	50	/Imagenes/edificios/Almacen de de Deuterio.webp
10	nanite_factory	Fabrica de Nanobots	Nanobots microscopicos que aceleran drasticamente las construcciones.	facilities	1000000	500000	100000	0	2.00	600	50	/Imagenes/edificios/FABRICA DE NANOBOT.webp
11	shipyard	Hangar	Construye naves y defensas. Niveles mas altos permiten construcciones mas rapidas.	facilities	400	200	100	0	2.00	120	50	/Imagenes/edificios/HANGAR.webp
12	research_lab	Laboratorio de Investigacion	Permite investigar nuevas tecnologias. Esencial para el progreso.	facilities	200	400	200	0	2.00	120	50	/Imagenes/edificios/LABORATORIO DE INVESTIGACION.webp
9	robotics_factory	Fabrica de Robots	Produce robots que aceleran la construccion de edificios.	facilities	400	120	200	0	2.00	120	50	/Imagenes/edificios/FABRICA DE ROBOT.webp
3	deuterium_synthesizer	Sintetizador de Deuterio	Extrae deuterio pesado de la atmosfera. Combustible para naves y reactores.	resources	225	75	0	20	1.50	60	50	/Imagenes/edificios/SINTETISADOR DE DEUTERIO.webp
13	missile_silo	Silo de Misiles	Almacena misiles de intercepcion y misiles interplanetarios.	facilities	20000	20000	1000	0	2.00	180	50	/Imagenes/edificios/Silo.webp
16	sensor_phalanx	Sensor Phalanx	El sensor Phalanx permite detectar movimientos de flotas enemigas en un rango determinado.	facilities	20000	40000	20000	0	2.00	180	7	/Imagenes/edificios/Sensor Phalanx.webp
14	terraformer	Terraformador	Aumenta el numero de campos disponibles en el planeta.	facilities	0	50000	100000	1000	2.00	300	50	/Imagenes/edificios/Terraformer.webp
\.


ALTER TABLE public.building_types ENABLE TRIGGER ALL;

--
-- Data for Name: technology_types; Type: TABLE DATA; Schema: public; Owner: postgres
--

ALTER TABLE public.technology_types DISABLE TRIGGER ALL;

COPY public.technology_types (id, code, name, description, category, base_metal, base_crystal, base_deuterium, cost_factor, base_time_seconds, max_level, image_url, energy_required) FROM stdin;
22	metal_production	Producción de Metales	Aumenta un 2% la producción de tu mina de metal por cada nivel investigado.	basic	2000	1000	0	2.00	120	20	/Imagenes/investigaciones/Produccion_Metales.webp	0
23	crystal_production	Producción de Cristales	Aumenta un 2% la producción de tu mina de cristal por cada nivel investigado.	basic	2000	1000	0	2.00	120	20	/Imagenes/investigaciones/Produccion_Cristales.webp	0
24	deuterium_production	Producción de Hidrógenos	Aumenta un 2% la producción de tu sintetizador de deuterio (hidrógeno) por cada nivel investigado.	basic	2000	1000	0	2.00	120	20	/Imagenes/investigaciones/Produccion_Hidrogenos.webp	0
12	espionage_tech	Tecnologia de Espionaje	Mejora la capacidad de espionaje y contra-espionaje.	advanced	200	1000	200	2.00	120	20	/Imagenes/investigaciones/ESPIONAJE.webp	0
25	matter_manipulation	Manipulación de la Materia	Permite extraer y almacenar Materia Oscura de las lunas. Requerida para construir los Recolectores de Materia Oscura.	advanced	120000	80000	40000	2.00	3600	20	/Imagenes/investigaciones/Manipulación de la Materia.webp	0
15	graviton_tech	Tecnologia de Graviton	Permite construir la Estrella de la Muerte.	advanced	0	0	0	3.00	600	20	/Imagenes/investigaciones/GRAVITON.webp	300000
21	expedition	Expedición	Investigación que mejora tus expediciones. Cada nivel reduce la probabilidad de sufrir eventos negativos (agujeros negros, piratas, tormentas iónicas) durante las expediciones. Nivel máximo 10. Nota: para enviar expediciones sigues necesitando Astrofísica según la distancia; esto es independiente.	advanced	4000	8000	4000	2.00	240	10	/Imagenes/investigaciones/Expedicion.webp	0
11	armour_tech	Tecnologia de Blindaje	Aumenta la integridad estructural en 10% por nivel.	military	1000	0	0	2.00	120	25	/Imagenes/investigaciones/Blindaje.webp	0
10	shielding_tech	Tecnologia de Escudos	Aumenta la resistencia de escudos en 10% por nivel.	military	200	600	0	2.00	120	20	/Imagenes/investigaciones/Defensa.webp	0
4	hyperspace_tech	Tecnologia de Hiperespacio	Permite viajes mas rapidos a traves del hiperespacio.	basic	0	4000	2000	2.00	240	20	/Imagenes/investigaciones/Hiperespacio.webp	0
13	computer_tech	Tecnologia de Computacion	Permite controlar mas flotas simultaneamente (+1 por nivel).	advanced	0	400	600	2.00	120	20	/Imagenes/investigaciones/Computación.webp	0
1	energy_tech	Tecnologia de Energia	Aumenta un 5% la energía generada por cada Satélite Solar por cada nivel investigado. También es requisito de investigaciones y naves avanzadas.	basic	0	800	400	2.00	120	20	/Imagenes/investigaciones/Energía.webp	0
3	ion_tech	Tecnologia Ionica	Tecnologia avanzada para armas y escudos ionicos.	basic	1000	300	100	2.00	180	20	/Imagenes/investigaciones/Iónica.webp	0
2	laser_tech	Tecnologia Laser	Permite el desarrollo de armas y escudos basados en laser.	basic	200	100	0	2.00	120	20	/Imagenes/investigaciones/LASER.webp	0
9	weapons_tech	Tecnologia de Armas	Aumenta el poder de ataque de todas las unidades en 10% por nivel.	military	800	200	0	2.00	120	25	/Imagenes/investigaciones/Militar.webp	0
6	combustion_drive	Motor de Combustion	Motor basico para naves pequenas. Bajo consumo pero poca velocidad.	propulsion	400	0	600	2.00	120	20	/Imagenes/investigaciones/Motores de combustión.webp	0
7	impulse_drive	Motor de Impulso	Motor intermedio con mejor velocidad y eficiencia.	propulsion	2000	4000	600	2.00	180	20	/Imagenes/investigaciones/Motores de impulso.webp	0
5	plasma_tech	Tecnologia de Plasma	La tecnologia mas avanzada para armas de alta energia.	basic	2000	4000	1000	2.00	300	20	/Imagenes/investigaciones/Plasma.webp	0
14	astrophysics	Astrofisica	Permite colonizar mas planetas y enviar expediciones.	advanced	4000	8000	4000	1.75	240	20	/Imagenes/investigaciones/Expedicion.webp	0
8	hyperspace_drive	Propulsor Hiperespacial	El motor mas rapido. Permite viajes intergalacticos.	propulsion	10000	20000	6000	2.00	300	20	/Imagenes/investigaciones/Propulsores hiperespaciales.webp	0
16	intergalactic_research_network	Red de Investigacion Intergalactica	Permite conectar los laboratorios de investigacion de diferentes planetas para aumentar la velocidad de investigacion.	advanced	240000	400000	160000	2.00	600	10	/Imagenes/investigaciones/Redes Intergalácticas.webp	0
\.


ALTER TABLE public.technology_types ENABLE TRIGGER ALL;

--
-- Data for Name: building_requirements; Type: TABLE DATA; Schema: public; Owner: postgres
--

ALTER TABLE public.building_requirements DISABLE TRIGGER ALL;

COPY public.building_requirements (id, building_type_id, required_building_id, required_building_level, required_tech_id, required_tech_level) FROM stdin;
1	10	9	10	\N	0
2	5	\N	0	1	3
3	13	11	1	\N	0
4	14	\N	0	1	12
5	16	15	1	\N	0
6	17	15	1	4	7
7	11	9	2	\N	0
8	10	\N	0	13	10
9	14	10	1	\N	0
10	5	3	5	\N	0
16	21	9	20	\N	0
17	21	12	22	\N	0
18	21	10	4	\N	0
19	21	\N	0	13	12
20	21	\N	0	16	3
\.


ALTER TABLE public.building_requirements ENABLE TRIGGER ALL;

--
-- Data for Name: casino_dice_bank; Type: TABLE DATA; Schema: public; Owner: postgres
--

ALTER TABLE public.casino_dice_bank DISABLE TRIGGER ALL;

COPY public.casino_dice_bank (id, balance, pool_pending, enabled, total_seeded, total_withdrawn, total_wagered, total_fees, total_paid, total_rolls, day_date, day_start, day_loss, updated_at, difficulty_mid) FROM stdin;
1	1866.19	1.50	t	2000	51	3915	783.00	3214.81	680	2026-10-28	1869.23	3.04	2026-10-28 17:16:31.436925+00	2000
\.


ALTER TABLE public.casino_dice_bank ENABLE TRIGGER ALL;

--
-- Data for Name: casino_roulette_bank; Type: TABLE DATA; Schema: public; Owner: postgres
--

ALTER TABLE public.casino_roulette_bank DISABLE TRIGGER ALL;

COPY public.casino_roulette_bank (id, balance, pool_pending, enabled, total_seeded, total_withdrawn, total_wagered, total_fees, total_paid, total_spins, updated_at, difficulty_mid) FROM stdin;
1	5189.48	9.50	t	5000	585	19195	3839.00	14581.52	1096	2026-10-28 01:31:24.487386+00	5000
\.


ALTER TABLE public.casino_roulette_bank ENABLE TRIGGER ALL;

--
-- Data for Name: casino_slots_bank; Type: TABLE DATA; Schema: public; Owner: postgres
--

ALTER TABLE public.casino_slots_bank DISABLE TRIGGER ALL;

COPY public.casino_slots_bank (id, balance, pool_pending, enabled, total_seeded, total_withdrawn, total_wagered, total_fees, total_paid, total_spins, day_date, day_start, day_loss, updated_at, difficulty_mid) FROM stdin;
1	2411.15	7.80	t	6000	2399	12278	2455.60	11012.25	3626	2026-10-28	2407.63	-3.52	2026-10-28 06:23:38.623537+00	2500
\.


ALTER TABLE public.casino_slots_bank ENABLE TRIGGER ALL;

--
-- Data for Name: cosmetic_items; Type: TABLE DATA; Schema: public; Owner: postgres
--

ALTER TABLE public.cosmetic_items DISABLE TRIGGER ALL;

COPY public.cosmetic_items (id, code, cosmetic_type, name_es, description_es, icon, fxu_cost, duration_days, rarity, is_active, sort_order, created_at, usd_cost) FROM stdin;
1d9de81e-ce51-43cd-bd00-a4b3fae19044	badge_wolf	badge	🐺 Lobo Carmesí	Brillo rojo pulsante — ferocidad pura	🔴	800	7	rare	t	1	2026-06-14 22:55:11.295972+00	0.1000
7157059c-612d-45ee-a6c4-74149fadd917	badge_wings	badge	🦅 Alas del Cazador	Dorado con partículas — majestuosidad alada	🟡	1200	7	epic	t	2	2026-06-14 22:55:11.295972+00	0.1000
86f00db0-30a1-4a24-a3d8-7c07bb2925c1	badge_dragon	badge	🐉 Dragón Ancestral	Fuego animado — poder milenario	🔥	2000	14	legendary	t	3	2026-06-14 22:55:11.295972+00	0.1000
7e7d4951-f1fd-4dff-b38f-b6a90e9b524d	badge_swords	badge	⚔️ Espadas del Caos	Cruzadas en acero azul — equilibrio letal	🔵	500	7	common	t	4	2026-06-14 22:55:11.295972+00	0.1000
9aafe735-81c9-4ad8-ad2e-701d30e9264f	badge_crystal	badge	💎 Cristal de Poder	Gira y refleja — energía pura concentrada	💎	1500	7	epic	t	5	2026-06-14 22:55:11.295972+00	0.1000
4c20ad07-1490-42dd-8ef0-4670d6186633	badge_storm	badge	🌪️ Tormenta Eterna	Rayos animados — caos controlado	⚡	1000	7	rare	t	6	2026-06-14 22:55:11.295972+00	0.1000
c4bee149-68e3-476f-b5ea-8614592ebe23	battle_crimson	battle_effect	💥 Explosión Carmesí	Explosiones rojas — cada impacto es un espectáculo	💥	1000	7	rare	t	1	2026-06-14 22:55:11.295972+00	0.5000
1cf01702-67c6-4d7a-b676-39b7f220c805	battle_lightning	battle_effect	⚡ Estela de Rayos	Estela eléctrica — velocidad pura	⚡	2500	7	epic	t	2	2026-06-14 22:55:11.295972+00	0.5000
0d74f78a-db30-4fbd-b807-44dd2b59bd8b	battle_stardust	battle_effect	🌌 Rastro Estelar	Polvo de estrellas — belleza cósmica	🌌	5000	14	legendary	t	3	2026-06-14 22:55:11.295972+00	0.5000
bd833b99-d110-4d30-97d4-103bd3e47654	skin_obsidian	hero_skin	⚫ Obsidiana	Negra con bordes rojos — sigilo letal	⚫	3000	7	rare	t	1	2026-06-14 22:55:11.295972+00	0.2000
e98cc66b-77d1-4b41-bb1a-1ee94cd1ea97	skin_golden	hero_skin	🟡 Dorada Imperial	Brillo cegador — riqueza sin límites	🟡	10000	14	legendary	t	2	2026-06-14 22:55:11.295972+00	0.2000
5b908aff-2c3e-437c-b980-f2dff5e2c4bb	skin_spectral	hero_skin	💀 Espectral	Semi-transparente azul — entre dos mundos	💀	25000	14	legendary	t	3	2026-06-14 22:55:11.295972+00	1.0000
26f3648d-f270-4c7a-8280-bfe9f3fe35ab	skin_phoenix	hero_skin	🔥 Fénix	Llamas vivas — renaces de cada batalla	🔥	50000	30	mythic	t	4	2026-06-14 22:55:11.295972+00	2.0000
1ce8fd5d-a422-4dc6-b8a0-896ea119f95e	planet_fire	planet_effect	🔥 Aureola de Fuego	Llamas rodean tu mundo — inconfundible	🔥	2000	7	rare	t	1	2026-06-14 22:55:11.295972+00	0.5000
67285600-f0b9-4e6d-95a8-20accefcdfff	planet_ice	planet_effect	❄️ Tormenta de Hielo	Ventisca perpetua — frío calculador	❄️	2000	7	rare	t	2	2026-06-14 22:55:11.295972+00	0.5000
939763ad-b77b-4e44-ab55-8f63f5c8ae2c	planet_golden	planet_effect	🟡 Anillos Dorados	Anillos como Saturno — riqueza visible	🟡	5000	14	epic	t	3	2026-06-14 22:55:11.295972+00	0.5000
1411f314-ed74-49b2-a635-9bad14187c9d	title_alpha	title	🐺 Alfa de la Manada	Domina la galaxia con autoridad suprema	🐺	1000	7	rare	t	1	2026-06-14 22:55:11.295972+00	0.3741
037619df-ac42-4b86-9edb-a76eacebbc91	title_annihilator	title	⚡ Aniquilador Estelar	Tu nombre impone respeto en cada sistema	⚡	2500	7	legendary	t	2	2026-06-14 22:55:11.295972+00	0.9353
1f44e1c7-29d7-42e5-a20f-56c65b22c9de	title_hawk	title	🦅 Ojo del Halcón	Ves lo que otros no pueden ni imaginar	🦅	1500	7	epic	t	3	2026-06-14 22:55:11.295972+00	0.5612
6b5d214a-88ae-4fb8-9c4e-8ba2c85dac8c	title_reaper	title	💀 Segador de Almas	Cada batalla deja su huella en tu leyenda	💀	3500	7	legendary	t	4	2026-06-14 22:55:11.295972+00	1.3094
86ef5118-2978-41ac-98ac-134ec5d87721	title_emperor	title	👑 Emperador del Vacío	No hay corona sin oscuridad	👑	5000	14	mythic	t	5	2026-06-14 22:55:11.295972+00	1.8705
28aeae5b-5cae-4cdb-aa4a-27253a52a140	title_forged	title	🔥 Forjado en Plasma	Templado en mil combates, irrompible	🔥	2000	7	epic	t	6	2026-06-14 22:55:11.295972+00	0.7482
869e424a-0094-47f1-9331-f6f323302e88	planet_dark	planet_effect	🟣 Pulso de Energía Oscura	Ondas violetas — poder oculto	🟣	7500	14	legendary	t	4	2026-06-14 22:55:11.295972+00	0.5000
a82e0d96-a1b5-4586-8e39-155ff20ede0a	planet_nebula	planet_effect	🌈 Nebulosa Radiante	Multicolor hipnótico — todos te miran	🌈	10000	30	mythic	t	5	2026-06-14 22:55:11.295972+00	0.5000
\.


ALTER TABLE public.cosmetic_items ENABLE TRIGGER ALL;

--
-- Data for Name: daily_missions; Type: TABLE DATA; Schema: public; Owner: postgres
--

ALTER TABLE public.daily_missions DISABLE TRIGGER ALL;

COPY public.daily_missions (id, code, mission_type, target_count, reward_type, reward_value, reward_duration_hours, title_es, desc_es, icon, is_active, cost_fxu, cost_usd) FROM stdin;
4	spy_5	spy	5	speed_bonus	2	12	Maestro del Espionaje	Realiza 10 misiones de espionaje para +2% velocidad en investigaciones	Eye	f	0	\N
6	expedition_4	expedition	4	speed_bonus	4	12	Conquistador del Universo	8 expediciones para obtener +4% velocidad en todo	Compass	f	0	\N
8	build_5	build	5	speed_bonus	2	12	Constructo Imparable	10 niveles de edificios para +2% velocidad en tu imperio	Building2	f	0	\N
10	research_3	research	3	speed_bonus	3	12	Mente Brillante	8 investigaciones para +3% velocidad tecnol??gica	Microscope	f	0	\N
3	spy_3	spy	3	speed_bonus	3	24	Ojos en Todas Partes	Esp??a 5 planetas enemigos y obt??n +3% producci??n por 24h	Eye	f	0	\N
18	collect_metal_1m	collect_metal	1000000	production_bonus	5	24	Titan de la Mineria	Recolecta 1,000,000 de metal para activar +5% velocidad de produccion durante 24h.	Pickaxe	t	0	\N
19	build_12	build	12	construction_speed_bonus	5	24	Arquitecto Supremo	Construye 12 niveles de edificios para activar +5% velocidad de construccion durante 24h.	Building	t	0	\N
20	research_8	research	8	research_speed_bonus	5	24	Mente Maestra	Investiga 8 niveles de tecnologias para activar +5% velocidad de investigacion durante 24h.	FlaskConical	t	0	\N
21	attack_15	attack	15	fleet_speed_bonus	5	24	Senor de la Guerra	Ataca 15 flotas enemigas para activar +5% velocidad de vuelo durante 24h.	Swords	t	0	\N
11	collect_metal_500k	collect_metal	500000	speed_bonus	2	24	Minero Incansable	Extrae 2M de metal para obtener +2% velocidad de construcci??n	Pickaxe	f	0	\N
13	premium_destroy_10	attack	10	production_bonus	6	72	Senor de la Guerra Premium	Destruye 10 flotas enemigas. Obtain +6% produccion por 72h.	Sword	t	5000	1
14	premium_expedition_8	expedition	8	speed_bonus	7	36	Flota Acelerada Premium	Realiza 8 expediciones. Obtain +7% velocidad por 36h.	Compass	t	4000	0.5
16	premium_research_5	research	5	speed_bonus	9	24	Genio Cientifico Premium	Investiga 5 tecnologias. Obtain +9% velocidad por 24h.	Microscope	t	4500	0.3
5	expedition_2	expedition	2	speed_bonus	5	24	Explorador Estelar	Completa 4 expediciones y obt??n +5% producci??n por 24h	Compass	f	0	\N
12	collect_crystal_250k	collect_crystal	250000	speed_bonus	5	24	Cazador de Cristal	Acumula 1M de cristal y obt??n +5% producci??n en minas	Gem	f	0	\N
1	collect_resources_500k	collect_resources	500000	production_bonus	5	24	Recolector Incansable	Recolecta 500k de cada recurso. Obtain +5% produccion por 24h.	Sword	f	0	\N
2	destroy_5	attack	5	fleet_speed_bonus	4	12	Flota Imparable	Destruye 5 flotas enemigas. Obtain +4% velocidad de vuelo por 12h.	Sword	f	0	\N
7	build_3	build	3	construction_speed_bonus	3	24	Arquitecto Galactico	Construye 3 niveles de edificios. Obtain +3% velocidad de construccion por 24h.	Building2	f	0	\N
9	research_2	research	2	research_speed_bonus	4	24	Cientifico Estelar	Investiga 2 tecnologias. Obtain +4% velocidad de investigacion por 24h.	Microscope	f	0	\N
15	premium_build_10	build	10	production_bonus	10	48	Megaconstructor Premium	Construye 10 niveles de edificios. Obtain +10% produccion por 48h.	Building2	f	3500	2.00
17	premium_collect_5m	collect_metal	5000000	speed_bonus	5	48	Magnate Industrial Premium	Recolecta 5M de metal. Obtain +5% velocidad por 48h.	Pickaxe	t	6000	2.00
\.


ALTER TABLE public.daily_missions ENABLE TRIGGER ALL;

--
-- Data for Name: defense_types; Type: TABLE DATA; Schema: public; Owner: postgres
--

ALTER TABLE public.defense_types DISABLE TRIGGER ALL;

COPY public.defense_types (id, code, name, description, metal_cost, crystal_cost, deuterium_cost, build_time_seconds, structural_integrity, shield_power, weapon_power, image_url, max_per_planet) FROM stdin;
7	small_shield_dome	Cupula Pequena de Escudo	Genera un campo de escudo sobre el planeta.	10000	10000	0	7200	8000	2000	0	https://photos.pinksale.finance/file/pinksale-logo-upload/1773846095217-5353927895c2bdac39271080f143f555.png	1
8	large_shield_dome	Cupula Grande de Escudo	Campo de escudo avanzado con mayor cobertura.	50000	50000	0	21600	40000	10000	0	https://photos.pinksale.finance/file/pinksale-logo-upload/1773846155115-a056cb04d7940e362015b7741cef9d51.png	1
11	outer_protection_dome	Cupula externa de proteccion	Barrera que cubre todo el planeta. Activa sus escudos cuando hay un ataque e intenta proteger en lo posible las defensas planetarias.	5000000	4000000	2000000	172800	15000000	1000000	1	/Imagenes/defensa/C%C3%BApula%20externas.webp	1
13	orbital_defense_platform	Plataforma de Defensa Orbital	La fortaleza defensiva definitiva. Colosal plataforma orbital con enorme integridad estructural y potencia de fuego. Solo puedes tener una por planeta.	5000000000	2000000000	800000000	604800	7800000000	2000000000	400000000	/Imagenes/defensa/Plataforma_Defensa_Orbital.webp	1
1	rocket_launcher	Lanzamisiles	Defensa basica y economica contra invasores.	2000	0	0	480	800	20	80	/Imagenes/defensa/lanza%20misiles%20.webp	\N
2	light_laser	Laser Ligero	Torreta laser basica con buen poder de fuego.	1500	500	0	600	800	25	100	/Imagenes/defensa/laser%20peque%C3%B1o.webp	\N
3	heavy_laser	Laser Pesado	Torreta laser mejorada con mayor alcance y poder.	6000	2000	0	2400	3200	100	250	/Imagenes/defensa/L%C3%A1sers%20grandes.webp	\N
4	gauss_cannon	Canon de Gauss	Proyectiles de alta velocidad con gran penetracion.	20000	15000	2000	10800	14000	200	1100	/Imagenes/defensa/Ca%C3%B1ones%20Gauss.webp	\N
6	plasma_turret	Torreta de Plasma	La defensa mas poderosa. Devastadora contra flotas.	50000	50000	30000	28800	40000	300	3000	/Imagenes/defensa/Ca%C3%B1ones%20de%20plasma.webp	\N
15	graviton_cannon	Cañón de Gravitón	Tras años de investigación sobre la fuerza gravitatoria, los ingenieros lograron concentrar un campo de gravitón y dispararlo contra las flotas enemigas. Su descomunal estructura y potencia de fuego lo convierten en una de las defensas más devastadoras del universo.	3000000	1500000	800000	14400	30000000	80000	500000	/Imagenes/defensa/Cañones de Gravitón.webp	\N
5	ion_cannon	Canon Ionico	Desactiva sistemas electronicos enemigos.	5000	3000	0	3600	3200	500	150	/Imagenes/defensa/Cañones iónicos.webp	\N
9	anti_ballistic_missile	Misil de Intercepcion	Intercepta misiles interplanetarios enemigos.	8000	0	2000	1800	8000	1	1	/Imagenes/defensa/Misil de intercepción.webp	\N
10	interplanetary_missile	Misil Interplanetario	Destruye defensas enemigas a distancia.	12500	2500	10000	3600	15000	1	12000	/Imagenes/defensa/Misil interplanetario.webp	\N
\.


ALTER TABLE public.defense_types ENABLE TRIGGER ALL;

--
-- Data for Name: defense_requirements; Type: TABLE DATA; Schema: public; Owner: postgres
--

ALTER TABLE public.defense_requirements DISABLE TRIGGER ALL;

COPY public.defense_requirements (id, defense_type_id, required_building_id, required_building_level, required_tech_id, required_tech_level) FROM stdin;
1	1	11	1	\N	0
2	2	11	2	\N	0
3	2	\N	0	1	1
4	2	\N	0	2	3
5	3	11	4	\N	0
6	3	\N	0	1	3
7	3	\N	0	2	6
8	4	11	6	\N	0
9	4	\N	0	1	6
10	4	\N	0	9	3
11	4	\N	0	10	1
12	5	11	4	\N	0
13	5	\N	0	3	4
14	6	11	8	\N	0
15	6	\N	0	5	7
16	7	11	1	\N	0
17	7	\N	0	10	2
18	8	11	6	\N	0
19	8	\N	0	10	6
20	9	13	2	\N	0
21	10	13	4	\N	0
22	10	\N	0	7	1
23	11	11	14	\N	0
24	11	10	1	\N	0
25	11	\N	0	10	16
33	13	\N	0	15	10
34	13	\N	0	9	22
35	13	\N	0	5	20
36	13	\N	0	13	15
37	13	\N	0	11	25
38	13	\N	0	1	20
39	13	11	20	\N	0
43	15	\N	0	15	7
44	15	11	18	\N	0
45	15	\N	0	9	20
\.


ALTER TABLE public.defense_requirements ENABLE TRIGGER ALL;

--
-- Data for Name: expedition_blueprint_drop_config; Type: TABLE DATA; Schema: public; Owner: postgres
--

ALTER TABLE public.expedition_blueprint_drop_config DISABLE TRIGGER ALL;

COPY public.expedition_blueprint_drop_config (id, drop_chance, only_unowned, is_enabled, updated_at) FROM stdin;
1	0.01	f	t	2026-06-14 22:57:52.176237+00
\.


ALTER TABLE public.expedition_blueprint_drop_config ENABLE TRIGGER ALL;

--
-- Data for Name: forum_categories; Type: TABLE DATA; Schema: public; Owner: postgres
--

ALTER TABLE public.forum_categories DISABLE TRIGGER ALL;

COPY public.forum_categories (id, name, description, sort_order, is_active, created_at) FROM stdin;
e0e25e24-1278-417e-a302-0d705e25b450	General	Discusiones generales del juego	1	t	2026-06-15 02:03:12.535025+00
aa8b6226-7c3e-4e75-b11b-eff5daaee872	Estrategia	T??cticas y consejos	2	t	2026-06-15 02:03:12.535025+00
de0ee952-eb55-4ff2-91a4-b1b5930e7277	Alianzas	Reclutamiento y diplomacia	3	t	2026-06-15 02:03:12.535025+00
e73973d8-c825-4725-9388-bc8c5e4c44cd	Mercado	Compra/venta de recursos	4	t	2026-06-15 02:03:12.535025+00
f53676f5-c82b-470f-83f2-1a1dfeda508b	Soporte	Ayuda y reportes de bugs	5	t	2026-06-15 02:03:12.535025+00
\.


ALTER TABLE public.forum_categories ENABLE TRIGGER ALL;

--
-- Data for Name: game_settings; Type: TABLE DATA; Schema: public; Owner: postgres
--

ALTER TABLE public.game_settings DISABLE TRIGGER ALL;

COPY public.game_settings (id, key, value, description, updated_at) FROM stdin;
1	game_name	Falco-X Universo	Nombre del juego	2026-06-14 19:59:51.525516+00
5	max_galaxies	5	Numero maximo de galaxias	2026-06-14 19:59:51.525516+00
6	max_systems	499	Sistemas por galaxia	2026-06-14 19:59:51.525516+00
7	max_planets_per_system	15	Posiciones por sistema	2026-06-14 19:59:51.525516+00
8	max_colonies	9	Maximo de colonias por jugador	2026-06-14 19:59:51.525516+00
9	debris_factor	0.3	Porcentaje de recursos en escombros	2026-06-14 19:59:51.525516+00
12	dark_matter_start	0	Materia oscura inicial	2026-06-14 19:59:51.525516+00
14	max_acs_fleets	5	Maximo de flotas en un ataque ACS	2026-06-14 20:00:39.109718+00
15	market_fee_percent	10	Porcentaje de comision del mercado P2P	2026-06-14 20:04:13.991272+00
24	fleet_acceleration_min_cost	10	Minimum base FXU cost for fleet acceleration	2026-06-14 20:10:06.827707+00
25	attack_cooldown_end	2026-06-15 12:15:20.843848+00	\N	2026-06-14 20:15:20.843848+00
21	expedition_extra_fee_fxu	1000	Costo en FXU por cada expedicion extra simultanea	2026-06-19 03:44:22.425356+00
26	galaxy_navigation_cost	10	Deuterium cost per galaxy system navigation	2026-06-14 20:18:57.603992+00
27	transfer_fee_percent	10	Fee percentage charged on internal transfers (goes to admin)	2026-06-14 20:19:33.706934+00
28	transfers_enabled	true	Whether internal token transfers are enabled	2026-06-14 20:19:33.706934+00
33	monthly_limit_fxu_multiplier	10	Multiplier for lifetime FXU spent in monthly market limit formula	2026-06-14 20:31:01.842937+00
36	market_listing_cooldown_minutes	5	Tiempo en minutos que una oferta de venta debe esperar antes de poder ser comprada	2026-06-14 20:32:11.349107+00
52	fxu_usd_rate	0.0001	Valor en USD de 1 FXU. Tasa fija para convertir fees USDT->FXU.	2026-06-14 20:38:26.823997+00
53	p2p_max_open_orders_per_user	3	M??ximo de ??rdenes abiertas (pending_payment/paid/disputed) por usuario	2026-06-14 20:38:49.233804+00
54	p2p_max_daily_volume_fxu	1000000	M??ximo volumen P2P (FXU equivalente) por usuario en ??ltimas 24h	2026-06-14 20:38:49.233804+00
55	p2p_autoban_lost_disputes_7d	3	N?? de disputas perdidas en 7d que activan auto-ban P2P	2026-06-14 20:38:49.233804+00
56	p2p_dispute_cooldown_minutes	2	Minutos m??nimos tras marcar la orden como pagada antes de poder abrir disputa	2026-06-14 20:38:50.529397+00
57	p2p_evidence_retention_days	90	D??as que se conserva la evidencia f??sica de disputas en storage tras resolverlas.	2026-06-14 20:39:01.487522+00
58	p2p_usdt_fxu_peg	10000	Cu??ntos FXU equivalen a 1 USDT para c??lculos antifraude de volumen diario P2P.	2026-06-14 20:39:03.32661+00
59	hero_item_common_prob	50	Probabilidad base item comun (%)	2026-06-14 20:39:19.140732+00
60	hero_item_rare_prob	25	Probabilidad base item raro (%)	2026-06-14 20:39:19.140732+00
61	hero_item_epic_prob	15	Probabilidad base item epico (%)	2026-06-14 20:39:19.140732+00
62	hero_item_legendary_prob	5	Probabilidad base item legendario (%)	2026-06-14 20:39:19.140732+00
63	hero_repair_kit_25_prob	25	Probabilidad kit reparacion 25%	2026-06-14 20:39:19.140732+00
64	hero_repair_kit_50_prob	15	Probabilidad kit reparacion 50%	2026-06-14 20:39:19.140732+00
65	hero_repair_kit_75_prob	8	Probabilidad kit reparacion 75%	2026-06-14 20:39:19.140732+00
66	hero_repair_kit_100_prob	3	Probabilidad kit reparacion 100%	2026-06-14 20:39:19.140732+00
76	telegram_bot_enabled	true	Enable Telegram Bot	2026-06-15 03:56:58.718805+00
86	fxu_cost_ratio_shipyard	5000	FXU cost ratio for shipyard - higher = cheaper	2026-06-15 06:12:02.69575+00
111	depletion_energy_bonus_percent	20	Solar energy bonus for positions 1-3	2026-06-15 14:36:12.335666+00
112	depletion_pos_1_3_metal	1.5	Metal multiplier for positions 1-3	2026-06-15 14:36:12.335666+00
113	depletion_pos_1_3_crystal	1.1	Crystal multiplier for positions 1-3	2026-06-15 14:36:12.335666+00
114	depletion_pos_1_3_deuterium	0.2	Deuterium multiplier for positions 1-3	2026-06-15 14:36:12.335666+00
115	depletion_pos_4_6_metal	1.3	Metal multiplier for positions 4-6	2026-06-15 14:36:12.335666+00
116	depletion_pos_4_6_crystal	1.2	Crystal multiplier for positions 4-6	2026-06-15 14:36:12.335666+00
117	depletion_pos_4_6_deuterium	0.5	Deuterium multiplier for positions 4-6	2026-06-15 14:36:12.335666+00
118	depletion_pos_7_9_metal	1.0	Metal multiplier for positions 7-9	2026-06-15 14:36:12.335666+00
34	fxu_demolish_fee	0	FXU fee charged per building demolition	2026-06-14 20:31:58.307821+00
48	p2p_fee_percent	0.03	Fee P2P total sobre cada orden (%)	2026-07-10 01:28:45.033182+00
11	vacation_mode_days	3	Dias minimos en modo vacaciones	2026-06-14 19:59:51.525516+00
45	fxu_rename_planet_cost	0	Costo en FXU para renombrar un planeta (primera vez gratis)	2026-06-14 20:35:37.43883+00
17	fxu_cost_ratio_building	50	Resource value per 1 FXU for buildings	2026-10-26 01:19:43.715278+00
46	fxu_rename_alliance_cost	500	Costo en FXU para renombrar una alianza (primera vez gratis)	2026-06-14 20:35:37.43883+00
22	fxu_cost_ratio_fleet	40	FXU por cada minuto de viaje (ej: 1 = 1 FXU/min, 2 = 2 FXU/min)	2026-06-14 20:09:54.97491+00
23	fleet_acceleration_jackpot_percent	49	Percentage of fleet acceleration FXU that goes to jackpot (0-100)	2026-06-14 20:09:54.97491+00
10	newbie_protection_points	1000	Puntos maximos para proteccion de novatos	2026-06-14 19:59:51.525516+00
13	bashing_protection	true	Habilitar proteccion contra bashing (max 6 ataques/24h)	2026-06-14 20:00:39.109718+00
49	p2p_fee_admin_share	50	Porcentaje del fee P2P que va al admin	2026-07-10 04:46:29.883642+00
51	p2p_fee_pool_share	30	Porcentaje del fee P2P que va al pool/jackpot	2026-07-10 04:46:29.883642+00
50	p2p_fee_referrer_share	20	Porcentaje del fee P2P que va al referrer del vendedor	2026-07-10 04:46:29.883642+00
16	referral_commission_percent	20	Porcentaje de comision para referidos	2026-07-10 17:42:08.810236+00
29	recaptcha_site_key	6LePCPYtAAAAAHw2FC80x7-hVzV-qST_dhQsHjJS	\N	2026-06-14 20:19:39.714744+00
30	recaptcha_secret_key	6LePCPYtAAAAAJRc5-hsOs7W1JQdk-OM-ZQ38inD	\N	2026-06-14 20:19:39.714744+00
31	recaptcha_enabled	true	\N	2026-06-14 20:19:39.714744+00
37	lottery_ticket_cost	50	Costo en FXU por ticket de loter??a	2026-06-14 20:34:57.754719+00
38	lottery_max_tickets	10	M??ximo de tickets por usuario por sorteo	2026-06-14 20:34:57.754719+00
39	lottery_prize_pool_pct	50	Porcentaje del ticket que va al pozo de premios	2026-06-14 20:34:57.754719+00
40	lottery_admin_pct	30	Porcentaje del ticket que va al admin	2026-06-14 20:34:57.754719+00
32	recaptcha_min_score	0.5	\N	2026-06-14 20:19:39.714744+00
119	depletion_pos_7_9_crystal	1.0	Crystal multiplier for positions 7-9	2026-06-15 14:36:12.335666+00
120	depletion_pos_7_9_deuterium	1.0	Deuterium multiplier for positions 7-9	2026-06-15 14:36:12.335666+00
121	depletion_pos_10_12_metal	0.7	Metal multiplier for positions 10-12	2026-06-15 14:36:12.335666+00
122	depletion_pos_10_12_crystal	0.8	Crystal multiplier for positions 10-12	2026-06-15 14:36:12.335666+00
123	depletion_pos_10_12_deuterium	1.4	Deuterium multiplier for positions 10-12	2026-06-15 14:36:12.335666+00
124	depletion_pos_13_15_metal	0.3	Metal multiplier for positions 13-15	2026-06-15 14:36:12.335666+00
125	depletion_pos_13_15_crystal	0.5	Crystal multiplier for positions 13-15	2026-06-15 14:36:12.335666+00
126	depletion_pos_13_15_deuterium	2.0	Deuterium multiplier for positions 13-15	2026-06-15 14:36:12.335666+00
74	telegram_chat_id	-1004204340147	Telegram Group/Chat ID	2026-06-15 03:56:58.309524+00
75	telegram_channel_username	TrungTungMeme	Telegram Channel Username	2026-06-15 03:56:58.550772+00
183	market_fee_admin_share	40	Percentage of market fee that goes to company/admin	2026-06-19 03:27:02.133747+00
184	market_fee_pool_share	30	Percentage of market fee that goes to the jackpot pool	2026-06-19 03:27:02.133747+00
185	market_fee_referral_share	30	Percentage of market fee that goes to the referrer (falls back to pool if no referrer)	2026-06-19 03:27:02.133747+00
174	test_starting_fxu	0	FXU given to new accounts during testing. Set to 0 to disable.	2026-06-17 04:36:44.684256+00
24236	withdrawal_fee_mode	flat	Modo de comision de retiro: flat (monto fijo) o percent (porcentaje)	2026-07-10 01:01:28.906315+00
187	daily_streak_cost	300	Costo diario en TUNG para activar la racha diaria	2026-06-21 15:24:36.963042+00
24170	deposit_gas_buffer_tung	100	\N	2026-07-10 00:00:22.274265+00
2	game_speed	1.00	Multiplicador de velocidad del juego	2026-09-12 07:00:58.813368+00
24171	deposit_gas_buffer_usdt	0.05	\N	2026-07-10 00:00:22.274265+00
24172	withdrawal_fee_usd	1	\N	2026-07-10 00:00:22.274265+00
68	global_android_ai_enabled	false	Toggle global del oficial Androide IA	2026-06-29 00:57:40.016249+00
24173	usdt_withdrawal_fee_flat	1	\N	2026-07-10 00:00:22.274265+00
35	fxu_abandon_colony_fee	0	FXU fee charged to abandon (destroy) a colony	2026-06-22 17:19:57.546347+00
3077	spend_split_referral_share	30	\N	2026-06-24 04:50:12.993928+00
24174	deposit_session_minutes	30	\N	2026-07-10 00:00:22.274265+00
3	fleet_speed	10.00	Multiplicador de velocidad de flotas	2026-09-12 07:00:58.813368+00
3043	withdrawal_fee_admin_share	80	\N	2026-07-10 04:46:29.883642+00
47	fxu_create_alliance_cost	1000	Costo en FXU para crear una alianza. VIP tiene 50% descuento.	2026-06-14 20:35:37.43883+00
28679	fxu_hero_respec_cost	10000	Costo en FXU para reiniciar puntos de la Nave Heroe	2026-07-13 02:22:05.824867+00
28680	hero_repair_kit_price_25	500	Precio en FXU del Kit de Reparacion I (25%)	2026-07-13 02:22:05.824867+00
3044	withdrawal_fee_pool_share	0	\N	2026-07-10 04:46:29.883642+00
3045	withdrawal_fee_referral_share	20	\N	2026-07-10 04:46:29.883642+00
28681	hero_repair_kit_price_50	1500	Precio en FXU del Kit de Reparacion II (50%)	2026-07-13 02:22:05.824867+00
28682	hero_repair_kit_price_75	4000	Precio en FXU del Kit de Reparacion III (75%)	2026-07-13 02:22:05.824867+00
28683	hero_repair_kit_price_100	10000	Precio en FXU del Kit de Reparacion IV (100%)	2026-07-13 02:22:05.824867+00
18	fxu_cost_ratio_research	80	Resource value per 1 FXU for research (more expensive)	2026-10-26 01:19:43.715278+00
3076	spend_split_pool_share	50	\N	2026-07-10 04:46:29.883642+00
3075	spend_split_admin_share	50	\N	2026-07-10 04:46:29.883642+00
24464	spend_referral_of_company_pct	20	Gastos del juego: % de la parte de empresa que gana el referido	2026-07-10 04:46:29.883642+00
107	depletion_enabled	true	Enable/disable resource depletion on colonies	2026-06-15 14:36:12.335666+00
20034	depletion_refill_price_usdt	10	Precio en USDT para recargar una colonia al 100% (costo proporcional al agotamiento)	2026-07-07 02:46:14.804293+00
108	depletion_regeneration_days	60	Days before a depleted abandoned planet regenerates	2026-06-15 14:36:12.335666+00
109	depletion_base_metal_per_field	100000	Base metal deposit per field slot (?? position factor)	2026-06-15 14:36:12.335666+00
39810	protection_ratio	3	Ratio maximo de puntos permitido para atacar (ej: 5 = solo puedes atacar a jugadores con al menos 1/5 de tus puntos). Estilo XNova/OGame.	2026-07-20 18:26:09.649218+00
110	depletion_depleted_production_percent	5	Production percentage when planet is depleted	2026-06-15 14:36:12.335666+00
19	fxu_cost_ratio_ships	60	Resource value per 1 FXU for ships	2026-10-26 01:19:43.715278+00
188	tung_price_usd	0.007175	Live TUNG price in USD (DexScreener, auto-updated by token-price edge function)	2026-10-28 23:14:02.408478+00
4	resource_speed	1.00	Multiplicador de produccion de recursos	2026-09-12 07:00:58.813368+00
147636	hero_repair_cost_usd	1	Costo en USD (cobrado en TUNG) de reparar el 100% de HP de la Nave Heroe en hangar; se cobra proporcional al dano	2026-10-02 20:15:38.629105+00
40098	fxu_cost_ratio_defense_usd	30000	Valor de recursos por 1 USD para acelerar defensa (0 = usar ratio TUNG clasico)	2026-07-20 23:10:12.453143+00
40099	fxu_cost_ratio_fleet_usd	0.01	USD por cada minuto de viaje para acelerar flotas (0 = usar ratio TUNG clasico)	2026-07-20 23:10:12.453143+00
40100	fxu_rename_planet_cost_usd	0.1	Costo en USD para renombrar planeta (0 = usar costo TUNG clasico)	2026-07-20 23:10:12.453143+00
40101	fxu_rename_alliance_cost_usd	0.5	Costo en USD para renombrar alianza (0 = usar costo TUNG clasico)	2026-07-20 23:10:12.453143+00
40102	fxu_create_alliance_cost_usd	1	Costo en USD para crear alianza (0 = usar costo TUNG clasico)	2026-07-20 23:10:12.453143+00
69457	vip_time_speed_multiplier	2	VIP Plus: divisor applied to building/research/shipyard times (2 = twice as fast)	2026-08-09 15:48:07.296371+00
69458	vip_production_bonus_percent	50	VIP Plus: extra resource production in percent (50 = +50%)	2026-08-09 15:48:07.296371+00
101734	alliance_max_members	3	Miembros maximos por alianza (lider SIN VIP Plus)	2026-09-01 05:24:45.958755+00
101735	alliance_max_members_vip	5	Miembros maximos por alianza (lider CON VIP Plus activo)	2026-09-01 05:24:45.958755+00
40103	daily_streak_cost_usd	0.3	Costo en USD para la racha diaria (0 = usar costo TUNG clasico)	2026-07-20 23:10:12.453143+00
147518	hero_ship_public	true	[CASINO1] true = Nave Heroe y viaje al Casino para todos los jugadores	2026-10-02 18:20:47.659613+00
41	lottery_reward_pool_pct	20	Porcentaje del ticket que va a pools de recompensa	2026-06-14 20:34:57.754719+00
42	lottery_3match_prize	500	Premio fijo en FXU por 3 aciertos	2026-06-14 20:34:57.754719+00
43	lottery_2match_prize	50	Premio fijo en FXU por 2 aciertos	2026-06-14 20:34:57.754719+00
44	lottery_enabled	true	Si la loter??a est?? habilitada	2026-06-14 20:34:57.754719+00
64211	lottery_ticket_cost_usd	0.3	Costo ticket lotería en USD (0 = usar TUNG fijo)	2026-08-06 04:31:57.624664+00
64212	lottery_3match_prize_usd	1	Premio 3 aciertos en USD (0 = usar TUNG fijo)	2026-08-06 04:31:57.624664+00
64213	lottery_2match_prize_usd	0.6	Premio 2 aciertos en USD (0 = usar TUNG fijo)	2026-08-06 04:31:57.624664+00
157620	ship_floor_ref_tung_usd	0.007116	[MKTFLOOR1] Precio TUNG/USD de referencia para anclar el minimo de naves en USD	2026-10-09 18:00:54.057949+00
157621	supply_box_market_ratio	0.5	[MKTFLOOR1] Cajas: TUNG pagado = (M+C+D a precio minimo de mercado) x ratio	2026-10-09 18:00:54.057949+00
101560	blueprint_includes_resources	false	\N	2026-10-01 19:05:57.393652+00
146511	colony_min_price_usd	50	Precio minimo (USD) para publicar una colonia en el mercado; se cobra en TUNG al precio en vivo	2026-10-02 02:27:40.987289+00
113083	stronghold_limit_enabled	false	Si es true, cada alianza solo puede controlar una Fortaleza O el Planeta del Tesoro. Si es false, no hay limite.	2026-09-09 00:45:27.3763+00
147519	hero_casino_base_speed	10000	[CASINO1] Velocidad base de la Nave Heroe para viajar al Casino (+1% por punto de velocidad)	2026-10-02 18:20:47.659613+00
157619	ship_floor_factor	0.001	[MKTFLOOR1] Precio minimo nave = coste total (M+C+D) x factor, en TUNG	2026-10-09 18:00:54.057949+00
20	fxu_cost_ratio_defense	60	Resource value per 1 FXU for defense (cheapest)	2026-10-26 01:19:43.715278+00
40095	fxu_cost_ratio_building_usd	35000	Valor de recursos por 1 USD para acelerar edificios (0 = usar ratio TUNG clasico)	2026-07-20 23:10:12.453143+00
40096	fxu_cost_ratio_research_usd	20000	Valor de recursos por 1 USD para acelerar investigacion (0 = usar ratio TUNG clasico)	2026-07-20 23:10:12.453143+00
182662	peace_shield_cooldown_hours	24	Escudo de Paz: horas sin poder recomprar tras perderlo por atacar	2026-10-27 03:56:49.186956+00
182661	peace_shield_packages	[{"hours":24,"usd":2},{"hours":72,"usd":5},{"hours":168,"usd":10},{"hours":360,"usd":20}]	Escudo de Paz: paquetes (horas, precio USD cobrado en TUNG)	2026-10-27 03:56:49.186956+00
40097	fxu_cost_ratio_ships_usd	25000	Valor de recursos por 1 USD para acelerar naves (0 = usar ratio TUNG clasico)	2026-07-20 23:10:12.453143+00
147681	casino_games_require_dock	false	Si es true, para comprar tickets de Loteria y Rifa hay que tener la Nave Insignia estacionada en el Casino Galactico	2026-10-02 20:55:52.693549+00
\.


ALTER TABLE public.game_settings ENABLE TRIGGER ALL;

--
-- Data for Name: hero_market_pool; Type: TABLE DATA; Schema: public; Owner: postgres
--

ALTER TABLE public.hero_market_pool DISABLE TRIGGER ALL;

COPY public.hero_market_pool (id, balance, total_contributed, updated_at) FROM stdin;
1	0	0	2026-07-13 02:22:05.824867+00
\.


ALTER TABLE public.hero_market_pool ENABLE TRIGGER ALL;

--
-- Data for Name: hero_ship_items; Type: TABLE DATA; Schema: public; Owner: postgres
--

ALTER TABLE public.hero_ship_items DISABLE TRIGGER ALL;

COPY public.hero_ship_items (id, name, rarity, base_probability, description, is_repair_kit, repair_amount, attack_bonus, defense_bonus, shield_bonus, speed_bonus, loot_bonus, min_level, slot_type, image_url, created_at) FROM stdin;
af027456-4658-4b6d-801a-46d625fae94c	Kit de Reparacion I	common	25	Repara el 25% del HP maximo	t	25	0	0	0	0	0	1	consumable	\N	2026-06-15 01:56:31.729705+00
03c4d950-9b6c-4c30-929e-3b2f3ec580b2	Kit de Reparacion II	rare	15	Repara el 50% del HP maximo	t	50	0	0	0	0	0	1	consumable	\N	2026-06-15 01:56:31.729705+00
548b1584-ae4c-46b3-bf24-702ed7f9d768	Kit de Reparacion III	epic	8	Repara el 75% del HP maximo	t	75	0	0	0	0	0	1	consumable	\N	2026-06-15 01:56:31.729705+00
c02d3331-e129-462e-a274-9519eec31265	Kit de Reparacion IV	legendary	3	Repara el 100% del HP maximo	t	100	0	0	0	0	0	1	consumable	\N	2026-06-15 01:56:31.729705+00
4d24d48f-79c5-4fa8-b5b3-70457f41d668	Canon Ligero	common	20	Arma ligera. +2 ataque	f	0	2	0	0	0	0	1	weapon	\N	2026-06-15 01:56:31.729705+00
20e38c24-f90d-4fd4-9574-ba1c39aec0c7	Canon de Plasma	rare	12	Arma de plasma. +6 ataque, +2 defensa	f	0	6	2	0	0	0	3	weapon	\N	2026-06-15 01:56:31.729705+00
ee34abd7-b97a-4742-bd6e-d6fd1bf42094	Canon de Iones	epic	6	Arma ionica. +15 ataque, +6 defensa, +3 velocidad	f	0	15	6	0	3	0	5	weapon	\N	2026-06-15 01:56:31.729705+00
f600b92b-ee66-4f4b-9bf8-55bd2c1b1309	Canon de Antimateria	legendary	2	Arma suprema. +40 atq, +15 def, +10 esc, +5 vel, +3 botin	f	0	40	15	10	5	3	10	weapon	\N	2026-06-15 01:56:31.729705+00
d73c4ba7-1f30-40fa-8cbb-a250a5b69fed	Escudo Basico	common	20	Escudo simple. +2 defensa, +1 escudo	f	0	0	2	1	0	0	1	shield	\N	2026-06-15 01:56:31.729705+00
45d38f23-534c-49cc-890c-d067cfa15e4d	Escudo Reforzado	rare	12	Escudo resistente. +2 ataque, +6 defensa, +3 escudo	f	0	2	6	3	0	0	3	shield	\N	2026-06-15 01:56:31.729705+00
d16c43f4-5f6c-4b8f-9a62-7dacf53a1fbb	Escudo de Energia	epic	6	Campo energetico. +5 atq, +15 defensa, +8 escudo, +3 vel	f	0	5	15	8	3	0	5	shield	\N	2026-06-15 01:56:31.729705+00
0466985a-a176-4891-8fe5-99ff12ef4e1c	Escudo Cuantico	legendary	2	Escudo dimensional. +15 atq, +40 def, +25 esc, +8 vel, +5 bot	f	0	15	40	25	8	5	10	shield	\N	2026-06-15 01:56:31.729705+00
02c6a307-99d5-444e-9d85-9ba19d133f86	Turbo Basico	common	20	Acelerador simple. +2 velocidad	f	0	0	0	0	2	0	1	module	\N	2026-06-15 01:56:31.729705+00
6422bf62-65e7-4b2a-8797-e322cecb6261	Turbo Avanzado	rare	12	Acelerador mejorado. +2 atq, +1 def, +6 vel	f	0	2	1	0	6	0	3	module	\N	2026-06-15 01:56:31.729705+00
38bad563-d35a-4286-a9bc-e9b2d0da2594	Turbo Hiperespacial	epic	6	Motor curvatura. +6 atq, +3 def, +2 esc, +15 vel	f	0	6	3	2	15	0	5	module	\N	2026-06-15 01:56:31.729705+00
10b9abcf-99d8-469f-aa64-52529380baef	Turbo Dimensional	legendary	2	Motor interdimensional. +15 atq, +10 def, +5 esc, +40 vel, +5 bot	f	0	15	10	5	40	5	10	module	\N	2026-06-15 01:56:31.729705+00
2042521d-b576-4d63-9639-4dff88cb62bf	Reactor Simple	common	20	Generador simple. +2 botin	f	0	0	0	0	0	2	1	reactor	\N	2026-06-15 01:56:31.729705+00
9bd2e4b3-67e9-4505-9b1c-527816b4a3a7	Reactor de Fusion	rare	12	Fusion nuclear. +1 atq, +3 esc, +2 vel, +6 botin	f	0	1	0	3	2	6	3	reactor	\N	2026-06-15 01:56:31.729705+00
f7a3a758-220b-4206-ba22-cae5e372b94c	Reactor de Materia Oscura	epic	6	Materia oscura. +3 atq, +8 esc, +5 vel, +15 botin	f	0	3	0	8	5	15	5	reactor	\N	2026-06-15 01:56:31.729705+00
8e3e3777-1319-4415-b0bd-5293d5a226e8	Reactor de Singularidad	legendary	2	Singularidad. +5 atq, +5 def, +20 esc, +10 vel, +40 botin	f	0	5	5	20	10	40	10	reactor	\N	2026-06-15 01:56:31.729705+00
\.


ALTER TABLE public.hero_ship_items ENABLE TRIGGER ALL;

--
-- Data for Name: ship_types; Type: TABLE DATA; Schema: public; Owner: postgres
--

ALTER TABLE public.ship_types DISABLE TRIGGER ALL;

COPY public.ship_types (id, code, name, description, category, metal_cost, crystal_cost, deuterium_cost, build_time_seconds, structural_integrity, shield_power, weapon_power, cargo_capacity, base_speed, fuel_consumption, rapid_fire, image_url) FROM stdin;
20	destruccion_masiva	Destruccion Masiva	Nave capital de destruccion masiva. Un ataque de esta nave significa la victoria. Solo los imperios mas poderosos del universo poseen la tecnologia de punta para crearla. Requiere escolta de al menos 10 cruceros y 5 acorazados para enviarla a cualquier mision.	special	350000000	280000000	120000000	500000	252000000	20000000	35000000	50000000	10	10000	{"bomber": 25, "cruiser": 33, "recycler": 250, "deathstar": 55, "destroyer": 5, "battleship": 15, "ion_cannon": 100, "colony_ship": 250, "heavy_laser": 100, "large_cargo": 250, "light_laser": 200, "small_cargo": 250, "gauss_cannon": 50, "battlecruiser": 30, "heavy_fighter": 100, "light_fighter": 200, "espionage_probe": 1250, "falco_x_clasica": 5, "rocket_launcher": 400, "solar_satellite": 1250}	https://photos.pinksale.finance/file/pinksale-logo-upload/1772161947553-d10a478403f32771c3d8c726509e978e.png
13	destroyer	Destructor	Nave capital con fuego rapido contra naves de batalla.	combat	60000	50000	15000	43200	44000	500	2000	2000	5000	1000	{"light_laser": 10, "battlecruiser": 2, "espionage_probe": 5, "solar_satellite": 5}	/Imagenes/Naves/Destructores.webp
3	colony_ship	Nave Colonizadora	Permite establecer nuevas colonias en planetas deshabitados.	civil	10000	20000	10000	14400	21000	85	75	7500	2500	1000	{"espionage_probe": 5, "solar_satellite": 5}	/Imagenes/Naves/Colonizadores.webp
1	small_cargo	Nave Pequena de Carga	Nave de transporte basica con capacidad de 5,000 unidades.	civil	2000	2000	0	1200	2800	8	7	5000	5000	10	{"espionage_probe": 5, "solar_satellite": 5}	/Imagenes/Naves/Fragatas Pequeñas.webp
18	nova	Nova	Nave capital de guerra con escudos increiblemente fuertes. Es extremadamente dura de derribar. Requiere escolta de al menos 10 cruceros y 5 acorazados para enviarla a cualquier mision.	special	30000000	25000000	10000000	90000	8000000	1000000	3650000	15000000	900	250	{"bomber": 25, "cruiser": 33, "recycler": 250, "deathstar": 35, "destroyer": 5, "battleship": 15, "ion_cannon": 100, "colony_ship": 250, "heavy_laser": 100, "large_cargo": 250, "light_laser": 200, "small_cargo": 250, "gauss_cannon": 50, "battlecruiser": 30, "heavy_fighter": 100, "light_fighter": 200, "espionage_probe": 1250, "falco_x_clasica": 5, "rocket_launcher": 400, "solar_satellite": 1250}	/Imagenes/Naves/Novas.png
2	large_cargo	Nave Grande de Carga	Nave de transporte pesada con capacidad de 25,000 unidades.	civil	6000	6000	0	2400	8400	21	7	25000	7500	50	{"espionage_probe": 5, "solar_satellite": 5}	/Imagenes/Naves/Fragatas Medianas.webp
19	large_frigate	Fragata Grande	La fragata mas grande de todas. Posee un gran sistema de produccion y su tamano es realmente grande. El 90% de su estructura esta ocupada por enormes almacenes para contener recursos. Nave necesaria para los imperios mineros extremadamente grandes.	civil	80000	80000	30000	30000	66500	102	75	400000000	6000	90	{"espionage_probe": 5, "solar_satellite": 5}	/Imagenes/Naves/Fragatas Grandes.webp
17	falco_x_clasica	Falco-X Clasica	Nave de combate elite. Mas poderosa que la Estrella de la Muerte y mas accesible que la Nova. Domina cualquier campo de batalla con su devastador armamento.	special	5500000	4500000	1500000	216000	4000000	60000	175000	7000000	2500	2200	{"nova": 1, "bomber": 10, "cruiser": 25, "recycler": 100, "deathstar": 2, "destroyer": 6, "battleship": 12, "black_moon": 2, "ion_cannon": 18, "heavy_laser": 40, "large_cargo": 70, "light_laser": 80, "small_cargo": 120, "gauss_cannon": 10, "battlecruiser": 10, "heavy_fighter": 50, "light_fighter": 80, "plasma_turret": 4, "star_destroyer": 3, "espionage_probe": 300, "falco_x_clasica": 2, "rocket_launcher": 150, "solar_satellite": 300, "destruccion_masiva": 1}	/Imagenes/Naves/falcox_class.png
7	light_fighter	Cazador Ligero	Nave de combate basica. Rapida pero fragil.	combat	3000	1000	0	1080	1600	10	50	50	12500	20	{"espionage_probe": 5, "solar_satellite": 5}	/Imagenes/Naves/Cazadores ligeros.webp
8	heavy_fighter	Cazador Pesado	Version mejorada del cazador ligero con mejor blindaje.	combat	6000	4000	0	3600	4000	25	150	100	10000	75	{"small_cargo": 3, "espionage_probe": 5, "solar_satellite": 5}	/Imagenes/Naves/Cazadores pesados.webp
4	recycler	Reciclador	Recoge recursos de campos de escombros tras las batallas.	civil	10000	6000	2000	7200	11200	8	1	20000	2000	300	{"espionage_probe": 5, "solar_satellite": 5}	/Imagenes/Naves/Recicladores.webp
6	solar_satellite	Satelite Solar	Genera energia en orbita. Vulnerable a ataques.	civil	0	2000	500	600	2000	1	1	0	0	0	{}	/Imagenes/Naves/Satelites solares.webp
5	espionage_probe	Sonda de Espionaje	Nave rapida para obtener informacion de planetas enemigos.	civil	0	1000	0	120	1000	0	0	5	100000000	1	{}	/Imagenes/Naves/Sondas de espionaje.webp
14	deathstar	Estrella de la Muerte	La nave mas poderosa. Puede destruir lunas.	special	5000000	4000000	1000000	259200	3600000	50000	200000	1000000	100	1	{"bomber": 25, "cruiser": 33, "recycler": 250, "destroyer": 5, "battleship": 30, "black_moon": 2, "ion_cannon": 100, "colony_ship": 250, "heavy_laser": 100, "large_cargo": 250, "light_laser": 200, "small_cargo": 250, "gauss_cannon": 50, "battlecruiser": 15, "heavy_fighter": 100, "light_fighter": 200, "star_destroyer": 3, "espionage_probe": 1250, "rocket_launcher": 200, "solar_satellite": 1250}	/Imagenes/Naves/Estrellas de la muerte.png
9	cruiser	Crucero	Nave versatil con fuego rapido contra cazadores.	combat	20000	7000	2000	10800	10800	50	400	800	15000	300	{"light_fighter": 6, "espionage_probe": 5, "rocket_launcher": 10, "solar_satellite": 5}	/Imagenes/Naves/Crucerors Ligeros.webp
21	mega_recycler	Mega Reciclador	Nave civil avanzada de reciclaje masivo. Dise??ada para recuperar grandes campos de escombros con eficiencia extrema.	civil	500000	300000	100000	54000	80000	100	5	20000000	1500	1200	{}	/Imagenes/Naves/Recicladores Grandes.webp
22	dark_matter_collector	Recolectores de Materia Oscura	Nave civil capaz de viajar a tus lunas para extraer y transportar Materia Oscura.	civil	200000	100000	20000	21600	2600	25	5	6000000	100	100000	{"espionage_probe": 5, "solar_satellite": 5}	/Imagenes/Naves/Recolectores_de_Materia_Oscura.webp
11	battlecruiser	Acorazado	Nave de combate equilibrada entre ataque y defensa.	combat	30000	40000	15000	27000	28000	400	700	750	10000	250	{"cruiser": 4, "battleship": 7, "large_cargo": 3, "small_cargo": 3, "heavy_fighter": 4, "espionage_probe": 5, "solar_satellite": 5}	/Imagenes/Naves/Acorazados.webp
10	battleship	Nave de Batalla	Nave de guerra pesada con gran poder de fuego.	combat	45000	15000	0	21600	24000	200	1000	1500	10000	500	{"espionage_probe": 5, "solar_satellite": 5}	/Imagenes/Naves/Cruceros Pesados.webp
12	bomber	Bombardero	Especializado en destruir defensas planetarias.	combat	50000	25000	15000	32400	30000	500	1000	500	4000	1000	{"ion_cannon": 10, "heavy_laser": 10, "light_laser": 20, "gauss_cannon": 5, "plasma_turret": 5, "espionage_probe": 5, "rocket_launcher": 20, "solar_satellite": 5}	/Imagenes/Naves/Bombarderos.webp
24	occupation_ship	Nave de Ocupación	Nave especial para ocupar colonias enemigas. Solo se adquiere con TUNG en el Mercado del sistema. Viaja en una misión de Ataque: si ganas la batalla y sobrevive junto a otra nave, el planeta queda ocupado y tu flota se convierte en su guarnición.	special	10000	20000	10000	14400	21000	85	75	7500	2500	1000	{"espionage_probe": 5, "solar_satellite": 5}	/Imagenes/Naves/Nave de Ocupación.webp
\.


ALTER TABLE public.ship_types ENABLE TRIGGER ALL;

--
-- Data for Name: instant_unit_offers; Type: TABLE DATA; Schema: public; Owner: postgres
--

ALTER TABLE public.instant_unit_offers DISABLE TRIGGER ALL;

COPY public.instant_unit_offers (id, code, item_type, ship_type_id, defense_type_id, name, description, image_url, price_usd, max_per_order, is_active, sort_order, created_at, updated_at) FROM stdin;
5	iu_large_cargo	ship	2	\N	Nave Grande de Carga		/Imagenes/Naves/Fragatas Medianas.webp	10	1000	t	2	2026-10-01 19:05:57.393652+00	2026-10-11 03:00:45.152912+00
8	iu_falco_x_clasica	ship	17	\N	Falco-X Clasica		/Imagenes/Naves/falcox_class.png	250	1000	f	17	2026-10-01 19:05:57.393652+00	2026-10-02 16:10:39.610296+00
14	iu_deathstar	ship	14	\N	Estrella de la Muerte		\N	150	1000	t	14	2026-10-01 19:05:57.393652+00	2026-10-02 16:10:39.610296+00
6	iu_nova	ship	18	\N	Nova		\N	1500	1000	t	18	2026-10-01 19:05:57.393652+00	2026-10-02 16:10:39.610296+00
1	iu_destruccion_masiva	ship	20	\N	Destruccion Masiva		\N	3000	1000	t	20	2026-10-01 19:05:57.393652+00	2026-10-02 16:10:39.610296+00
10	iu_heavy_fighter	ship	8	\N	Cazador Pesado		\N	2	1000	t	8	2026-10-01 19:05:57.393652+00	2026-10-02 16:10:39.610296+00
16	iu_mega_recycler	ship	21	\N	Mega Reciclador		\N	150	1000	t	21	2026-10-01 19:05:57.393652+00	2026-10-02 16:10:39.610296+00
7	iu_large_frigate	ship	19	\N	Fragata Grande		\N	100	1000	t	19	2026-10-01 19:05:57.393652+00	2026-10-02 16:10:39.610296+00
24	iu_rocket_launcher	defense	\N	1	Lanzamisiles		\N	1	1000	t	1	2026-10-01 19:05:57.393652+00	2026-10-02 16:10:39.610296+00
25	iu_light_laser	defense	\N	2	Laser Ligero		\N	3	1000	t	2	2026-10-01 19:05:57.393652+00	2026-10-02 16:10:39.610296+00
31	iu_anti_ballistic_missile	defense	\N	9	Misil de Intercepcion		\N	5	1000	t	9	2026-10-01 19:05:57.393652+00	2026-10-02 16:10:39.610296+00
26	iu_heavy_laser	defense	\N	3	Laser Pesado		\N	8	1000	t	3	2026-10-01 19:05:57.393652+00	2026-10-02 16:10:39.610296+00
30	iu_ion_cannon	defense	\N	5	Canon Ionico		\N	12	1000	t	5	2026-10-01 19:05:57.393652+00	2026-10-02 16:10:39.610296+00
27	iu_gauss_cannon	defense	\N	4	Canon de Gauss		\N	18	1000	t	4	2026-10-01 19:05:57.393652+00	2026-10-02 16:10:39.610296+00
32	iu_interplanetary_missile	defense	\N	10	Misil Interplanetario		\N	25	1000	t	10	2026-10-01 19:05:57.393652+00	2026-10-02 16:10:39.610296+00
20	iu_small_shield_dome	defense	\N	7	Cupula Pequena de Escudo		\N	35	1	t	7	2026-10-01 19:05:57.393652+00	2026-10-02 16:10:39.610296+00
28	iu_plasma_turret	defense	\N	6	Torreta de Plasma		\N	45	1000	t	6	2026-10-01 19:05:57.393652+00	2026-10-02 16:10:39.610296+00
21	iu_large_shield_dome	defense	\N	8	Cupula Grande de Escudo		\N	65	1	t	8	2026-10-01 19:05:57.393652+00	2026-10-02 16:10:39.610296+00
12	iu_solar_satellite	ship	6	\N	Satelite Solar		\N	0.1	1000	t	6	2026-10-01 19:05:57.393652+00	2026-10-02 16:10:39.610296+00
29	iu_graviton_cannon	defense	\N	15	Cañón de Gravitón		\N	500	1000	t	15	2026-10-01 19:05:57.393652+00	2026-10-02 16:10:39.610296+00
11	iu_recycler	ship	4	\N	Reciclador		/Imagenes/Naves/Recicladores.webp	10	1000	t	4	2026-10-01 19:05:57.393652+00	2026-10-11 03:00:57.490249+00
13	iu_espionage_probe	ship	5	\N	Sonda de Espionaje		/Imagenes/Naves/Sondas de espionaje.webp	0.5	1000	t	5	2026-10-01 19:05:57.393652+00	2026-10-11 03:01:07.590248+00
9	iu_light_fighter	ship	7	\N	Cazador Ligero		/Imagenes/Naves/Cazadores ligeros.webp	1	1000	t	7	2026-10-01 19:05:57.393652+00	2026-10-11 03:01:36.486389+00
15	iu_cruiser	ship	9	\N	Crucero		/Imagenes/Naves/Crucerors Ligeros.webp	5	1000	t	9	2026-10-01 19:05:57.393652+00	2026-10-11 03:01:48.705714+00
18	iu_battleship	ship	10	\N	Nave de Batalla		/Imagenes/Naves/Cruceros Pesados.webp	10	1000	t	10	2026-10-01 19:05:57.393652+00	2026-10-11 03:01:56.531819+00
17	iu_battlecruiser	ship	11	\N	Acorazado		/Imagenes/Naves/Acorazados.webp	20	1000	t	11	2026-10-01 19:05:57.393652+00	2026-10-11 03:02:11.754022+00
19	iu_bomber	ship	12	\N	Bombardero		/Imagenes/Naves/Bombarderos.webp	20	1000	t	12	2026-10-01 19:05:57.393652+00	2026-10-11 03:02:17.690955+00
2	iu_destroyer	ship	13	\N	Destructor		/Imagenes/Naves/Destructores.webp	50	1000	t	13	2026-10-01 19:05:57.393652+00	2026-10-11 03:02:29.282908+00
3	iu_colony_ship	ship	3	\N	Nave Colonizadora		/Imagenes/Naves/Colonizadores.webp	5	1000	t	3	2026-10-01 19:05:57.393652+00	2026-10-11 03:02:43.526593+00
4	iu_small_cargo	ship	1	\N	Nave Pequena de Carga		/Imagenes/Naves/Fragatas Pequeñas.webp	5	1000	t	1	2026-10-01 19:05:57.393652+00	2026-10-11 03:06:26.571689+00
23	iu_orbital_defense_platform	defense	\N	13	Plataforma de Defensa Orbital		/Imagenes/defensa/Plataforma_Defensa_Orbital.webp	3000	1	t	13	2026-10-01 19:05:57.393652+00	2026-10-18 16:58:18.684566+00
22	iu_outer_protection_dome	defense	\N	11	Cupula externa de proteccion		\N	300	1	t	11	2026-10-01 19:05:57.393652+00	2026-10-02 16:10:39.610296+00
\.


ALTER TABLE public.instant_unit_offers ENABLE TRIGGER ALL;

--
-- Data for Name: jackpot_config; Type: TABLE DATA; Schema: public; Owner: postgres
--

ALTER TABLE public.jackpot_config DISABLE TRIGGER ALL;

COPY public.jackpot_config (id, contribution_rate, win_chance, min_win_percent, max_win_percent, min_jackpot_for_win, updated_at) FROM stdin;
1	10	1	10	50	1000	2026-06-19 03:44:25.250494+00
\.


ALTER TABLE public.jackpot_config ENABLE TRIGGER ALL;

--
-- Data for Name: jackpot_pools; Type: TABLE DATA; Schema: public; Owner: postgres
--

ALTER TABLE public.jackpot_pools DISABLE TRIGGER ALL;

COPY public.jackpot_pools (id, expedition_balance, expedition_total, monthly_balance, monthly_total, plus_balance, plus_total, expedition_percent, monthly_percent, plus_percent, updated_at, destruction_ranking_reset_at, destruction_balance, destruction_total, destruction_percent) FROM stdin;
1	58	125548	158.00	169403	678	727707	10	10	40	2026-10-28 23:07:02.096144+00	2026-08-01 14:30:24.461579+00	680	647113	40
\.


ALTER TABLE public.jackpot_pools ENABLE TRIGGER ALL;

--
-- Data for Name: market_notification_config; Type: TABLE DATA; Schema: public; Owner: postgres
--

ALTER TABLE public.market_notification_config DISABLE TRIGGER ALL;

COPY public.market_notification_config (id, edge_function_url, is_enabled, created_at, updated_at, anon_key, internal_broadcast_token) FROM stdin;
1		t	2026-06-14 20:06:13.034157+00	2026-06-14 20:06:13.034157+00	eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx2cWFndWR3aWZ2eXRzcHRxanhwIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MTQ0OTMyOCwiZXhwIjoyMDk3MDI1MzI4fQ.z5XsjMXzjz2B31ZekI55omiwoEfWRVRlOh75eDUzMPs	e91886fdeb494c3685953bc03ad43b6576384f4e22194b97b689e34634a1fbc8
\.


ALTER TABLE public.market_notification_config ENABLE TRIGGER ALL;

--
-- Data for Name: market_resource_limits; Type: TABLE DATA; Schema: public; Owner: postgres
--

ALTER TABLE public.market_resource_limits DISABLE TRIGGER ALL;

COPY public.market_resource_limits (id, min_price_metal, min_price_crystal, min_price_deuterium, monthly_limit_metal, monthly_limit_crystal, monthly_limit_deuterium, created_at, updated_at, monthly_limit_enabled, earnings_cutoff_date, weekly_sales_count, weekly_sales_reset_date) FROM stdin;
1	0.001	0.001	0.001	1000000	1000000	1000000	2026-06-14 20:18:58.312132+00	2026-10-12 17:38:37.975407+00	f	\N	0	\N
\.


ALTER TABLE public.market_resource_limits ENABLE TRIGGER ALL;

--
-- Data for Name: officer_types; Type: TABLE DATA; Schema: public; Owner: postgres
--

ALTER TABLE public.officer_types DISABLE TRIGGER ALL;

COPY public.officer_types (id, code, name, description, bonus_type, bonus_value, bonus_secondary_type, bonus_secondary_value, dark_matter_cost_7d, dark_matter_cost_30d, dark_matter_cost_90d, icon, sort_order, created_at, fxu_cost_7d, fxu_cost_30d, fxu_cost_90d, image_url, usdt_cost_7d, usdt_cost_30d, usdt_cost_90d) FROM stdin;
1ed9e374-1a7b-4eda-8b99-7a01350e4b00	android	Androide IA	Activa el Piloto Automatico: gestiona construccion, investigacion, flotas, ataques, defensas y fleet save 24/7 mientras no estas. Se pausa 5 minutos cuando juegas manualmente.	autopilot_access	1	\N	\N	5000	15000	40000	bot	0	2026-07-14 18:12:24.630025+00	5000	30000	80000	/Imagenes/oficiales/Androide AI.webp	2	5	10
dc94b931-dec9-487a-8e4c-2a6708631248	commander	Comandante	Expande la cola de construccion permitiendo 2 edificios adicionales en cola y 2 investigaciones adicionales en cola. Proporciona una vision general mejorada del imperio.	building_queue	2	\N	\N	5000	15000	40000	crown	1	2026-06-14 19:59:56.136696+00	5000	30000	80000	/Imagenes/oficiales/Comandante.webp	2	5	10
23adf9d6-3db3-4884-9d23-f5b9793742f9	admiral	Almirante	Aumenta los slots de flota disponibles en 2. Aumenta la velocidad de las flotas en un 20%.	fleet_slots	2	fleet_speed_bonus	20	5000	15000	40000	anchor	2	2026-06-14 19:59:56.136696+00	5000	50000	130000	/Imagenes/oficiales/Armirante.webp	2	5	10
12db408b-e17f-4b9d-be3e-30401b482af0	engineer	Ingeniero	Reduce las perdidas de defensa en batalla un 50%. Aumenta la produccion de energia un 10%.	defense_loss_reduction	50	energy_bonus	10	7500	22500	60000	wrench	3	2026-06-14 19:59:56.136696+00	7500	49999	120000	/Imagenes/oficiales/Ingeniero.webp	2	5	10
831cca21-6d52-413e-8a30-cbbc0ccdc7ac	geologist	Geologo	Aumenta la produccion de todas las minas (metal, cristal, deuterio) en un 10%.	mine_bonus	10	\N	\N	7500	22500	60000	mountain	4	2026-06-14 19:59:56.136696+00	7500	50000	120000	/Imagenes/oficiales/Geologo.webp	2	6	16
12dec96d-8ba2-439d-8999-f33181a5407d	technocrat	Tecnocrata	Aumenta el nivel efectivo de sondas espias en 2. Reduce el tiempo de investigacion un 25%.	spy_bonus	2	research_time_reduction	25	10000	30000	80000	brain	5	2026-06-14 19:59:56.136696+00	10000	60000	150000	/Imagenes/oficiales/Tecnocrata.webp	2	5	10
\.


ALTER TABLE public.officer_types ENABLE TRIGGER ALL;

--
-- Data for Name: p2p_notification_config; Type: TABLE DATA; Schema: public; Owner: postgres
--

ALTER TABLE public.p2p_notification_config DISABLE TRIGGER ALL;

COPY public.p2p_notification_config (id, edge_function_url, anon_key, is_enabled, min_amount_fxu_eq, updated_at) FROM stdin;
1		eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx2cWFndWR3aWZ2eXRzcHRxanhwIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MTQ0OTMyOCwiZXhwIjoyMDk3MDI1MzI4fQ.z5XsjMXzjz2B31ZekI55omiwoEfWRVRlOh75eDUzMPs	t	0	2026-06-14 20:38:59.361325+00
\.


ALTER TABLE public.p2p_notification_config ENABLE TRIGGER ALL;

--
-- Data for Name: p2p_payment_methods; Type: TABLE DATA; Schema: public; Owner: postgres
--

ALTER TABLE public.p2p_payment_methods DISABLE TRIGGER ALL;

COPY public.p2p_payment_methods (id, code, name, country_code, currency_code, method_type, requires_account, is_enabled, sort_order, icon, notes, created_at) FROM stdin;
1	internal_fxu	Saldo interno FXU	\N	FXU	internal	f	t	1	\N	Fase 1 activa	2026-06-14 20:37:20.348806+00
2	internal_usdt	Saldo interno USDT	\N	USDT	internal	f	t	2	\N	Fase 1 activa	2026-06-14 20:37:20.348806+00
3	bank_usd	Transferencia bancaria USD	\N	USD	bank_transfer	t	f	50	\N	Fase 2	2026-06-14 20:37:20.348806+00
4	bank_eur	Transferencia bancaria EUR	\N	EUR	bank_transfer	t	f	51	\N	Fase 2	2026-06-14 20:37:20.348806+00
5	cash_local	Efectivo local	\N	LOCAL	cash	t	f	90	\N	Fase 2	2026-06-14 20:37:20.348806+00
6	cu_cup_transfer	Transferencia CUP	CU	CUP	bank_transfer	t	t	100	\N	Fase 4 activa (SELL externo)	2026-06-14 20:37:20.348806+00
7	cu_mlc	Transferencia MLC	CU	MLC	bank_transfer	t	t	101	\N	Fase 4 activa (SELL externo)	2026-06-14 20:37:20.348806+00
8	cu_saldomovil	Saldo M??vil	CU	CUP	mobile	t	t	102	\N	Fase 4 activa (SELL externo)	2026-06-14 20:37:20.348806+00
9	generic_aed	Pago / Transferencia (AED)	AE	AED	other	t	t	500	\N	Dirham EAU	2026-06-14 20:38:23.245996+00
10	generic_afn	Pago / Transferencia (AFN)	AF	AFN	other	t	t	500	\N	Afgani	2026-06-14 20:38:23.245996+00
11	generic_all	Pago / Transferencia (ALL)	AL	ALL	other	t	t	500	\N	Lek alban??s	2026-06-14 20:38:23.245996+00
12	generic_amd	Pago / Transferencia (AMD)	AM	AMD	other	t	t	500	\N	Dram armenio	2026-06-14 20:38:23.245996+00
13	generic_ang	Pago / Transferencia (ANG)	CW	ANG	other	t	t	500	\N	Flor??n antillano	2026-06-14 20:38:23.245996+00
14	generic_aoa	Pago / Transferencia (AOA)	AO	AOA	other	t	t	500	\N	Kwanza angole??o	2026-06-14 20:38:23.245996+00
15	generic_ars	Pago / Transferencia (ARS)	AR	ARS	other	t	t	500	\N	Peso argentino	2026-06-14 20:38:23.245996+00
16	generic_aud	Pago / Transferencia (AUD)	AU	AUD	other	t	t	500	\N	D??lar australiano	2026-06-14 20:38:23.245996+00
17	generic_awg	Pago / Transferencia (AWG)	AW	AWG	other	t	t	500	\N	Flor??n arube??o	2026-06-14 20:38:23.245996+00
18	generic_azn	Pago / Transferencia (AZN)	AZ	AZN	other	t	t	500	\N	Manat azerbaiyano	2026-06-14 20:38:23.245996+00
19	generic_bam	Pago / Transferencia (BAM)	BA	BAM	other	t	t	500	\N	Marco convertible	2026-06-14 20:38:23.245996+00
20	generic_bbd	Pago / Transferencia (BBD)	BB	BBD	other	t	t	500	\N	D??lar barbadense	2026-06-14 20:38:23.245996+00
21	generic_bdt	Pago / Transferencia (BDT)	BD	BDT	other	t	t	500	\N	Taka	2026-06-14 20:38:23.245996+00
22	generic_bgn	Pago / Transferencia (BGN)	BG	BGN	other	t	t	500	\N	Lev b??lgaro	2026-06-14 20:38:23.245996+00
23	generic_bhd	Pago / Transferencia (BHD)	BH	BHD	other	t	t	500	\N	Dinar barein??	2026-06-14 20:38:23.245996+00
24	generic_bif	Pago / Transferencia (BIF)	BI	BIF	other	t	t	500	\N	Franco burund??s	2026-06-14 20:38:23.245996+00
25	generic_bmd	Pago / Transferencia (BMD)	BM	BMD	other	t	t	500	\N	D??lar bermude??o	2026-06-14 20:38:23.245996+00
26	generic_bnd	Pago / Transferencia (BND)	BN	BND	other	t	t	500	\N	D??lar de Brun??i	2026-06-14 20:38:23.245996+00
27	generic_bob	Pago / Transferencia (BOB)	BO	BOB	other	t	t	500	\N	Boliviano	2026-06-14 20:38:23.245996+00
28	generic_brl	Pago / Transferencia (BRL)	BR	BRL	other	t	t	500	\N	Real brasile??o (Pix)	2026-06-14 20:38:23.245996+00
29	generic_bsd	Pago / Transferencia (BSD)	BS	BSD	other	t	t	500	\N	D??lar bahame??o	2026-06-14 20:38:23.245996+00
30	generic_btn	Pago / Transferencia (BTN)	BT	BTN	other	t	t	500	\N	Ngultrum	2026-06-14 20:38:23.245996+00
31	generic_bwp	Pago / Transferencia (BWP)	BW	BWP	other	t	t	500	\N	Pula	2026-06-14 20:38:23.245996+00
32	generic_byn	Pago / Transferencia (BYN)	BY	BYN	other	t	t	500	\N	Rublo bielorruso	2026-06-14 20:38:23.245996+00
33	generic_bzd	Pago / Transferencia (BZD)	BZ	BZD	other	t	t	500	\N	D??lar belice??o	2026-06-14 20:38:23.245996+00
34	generic_cad	Pago / Transferencia (CAD)	CA	CAD	other	t	t	500	\N	D??lar canadiense	2026-06-14 20:38:23.245996+00
35	generic_cdf	Pago / Transferencia (CDF)	CD	CDF	other	t	t	500	\N	Franco congole??o	2026-06-14 20:38:23.245996+00
36	generic_chf	Pago / Transferencia (CHF)	CH	CHF	other	t	t	500	\N	Franco suizo	2026-06-14 20:38:23.245996+00
37	generic_clp	Pago / Transferencia (CLP)	CL	CLP	other	t	t	500	\N	Peso chileno	2026-06-14 20:38:23.245996+00
38	generic_cny	Pago / Transferencia (CNY)	CN	CNY	other	t	t	500	\N	Yuan chino	2026-06-14 20:38:23.245996+00
39	generic_cop	Pago / Transferencia (COP)	CO	COP	other	t	t	500	\N	Peso colombiano	2026-06-14 20:38:23.245996+00
40	generic_crc	Pago / Transferencia (CRC)	CR	CRC	other	t	t	500	\N	Col??n costarricense	2026-06-14 20:38:23.245996+00
41	generic_cve	Pago / Transferencia (CVE)	CV	CVE	other	t	t	500	\N	Escudo caboverdiano	2026-06-14 20:38:23.245996+00
42	generic_czk	Pago / Transferencia (CZK)	CZ	CZK	other	t	t	500	\N	Corona checa	2026-06-14 20:38:23.245996+00
43	generic_djf	Pago / Transferencia (DJF)	DJ	DJF	other	t	t	500	\N	Franco yibutiano	2026-06-14 20:38:23.245996+00
44	generic_dkk	Pago / Transferencia (DKK)	DK	DKK	other	t	t	500	\N	Corona danesa	2026-06-14 20:38:23.245996+00
45	generic_dop	Pago / Transferencia (DOP)	DO	DOP	other	t	t	500	\N	Peso dominicano	2026-06-14 20:38:23.245996+00
46	generic_dzd	Pago / Transferencia (DZD)	DZ	DZD	other	t	t	500	\N	Dinar argelino	2026-06-14 20:38:23.245996+00
47	generic_egp	Pago / Transferencia (EGP)	EG	EGP	other	t	t	500	\N	Libra egipcia	2026-06-14 20:38:23.245996+00
48	generic_ern	Pago / Transferencia (ERN)	ER	ERN	other	t	t	500	\N	Nakfa	2026-06-14 20:38:23.245996+00
49	generic_etb	Pago / Transferencia (ETB)	ET	ETB	other	t	t	500	\N	Birr et??ope	2026-06-14 20:38:23.245996+00
50	generic_eur	Pago / Transferencia (EUR)	\N	EUR	other	t	t	500	\N	Euro (SEPA, Revolut, Wise)	2026-06-14 20:38:23.245996+00
51	generic_fjd	Pago / Transferencia (FJD)	FJ	FJD	other	t	t	500	\N	D??lar fiyiano	2026-06-14 20:38:23.245996+00
52	generic_fkp	Pago / Transferencia (FKP)	FK	FKP	other	t	t	500	\N	Libra malvinense	2026-06-14 20:38:23.245996+00
53	generic_gbp	Pago / Transferencia (GBP)	GB	GBP	other	t	t	500	\N	Libra esterlina	2026-06-14 20:38:23.245996+00
54	generic_gel	Pago / Transferencia (GEL)	GE	GEL	other	t	t	500	\N	Lari georgiano	2026-06-14 20:38:23.245996+00
55	generic_ghs	Pago / Transferencia (GHS)	GH	GHS	other	t	t	500	\N	Cedi ghan??s	2026-06-14 20:38:23.245996+00
56	generic_gip	Pago / Transferencia (GIP)	GI	GIP	other	t	t	500	\N	Libra de Gibraltar	2026-06-14 20:38:23.245996+00
57	generic_gmd	Pago / Transferencia (GMD)	GM	GMD	other	t	t	500	\N	Dalasi	2026-06-14 20:38:23.245996+00
58	generic_gnf	Pago / Transferencia (GNF)	GN	GNF	other	t	t	500	\N	Franco guineano	2026-06-14 20:38:23.245996+00
59	generic_gtq	Pago / Transferencia (GTQ)	GT	GTQ	other	t	t	500	\N	Quetzal	2026-06-14 20:38:23.245996+00
60	generic_gyd	Pago / Transferencia (GYD)	GY	GYD	other	t	t	500	\N	D??lar guyan??s	2026-06-14 20:38:23.245996+00
61	generic_hkd	Pago / Transferencia (HKD)	HK	HKD	other	t	t	500	\N	D??lar de Hong Kong	2026-06-14 20:38:23.245996+00
62	generic_hnl	Pago / Transferencia (HNL)	HN	HNL	other	t	t	500	\N	Lempira	2026-06-14 20:38:23.245996+00
63	generic_htg	Pago / Transferencia (HTG)	HT	HTG	other	t	t	500	\N	Gourde haitiano	2026-06-14 20:38:23.245996+00
64	generic_huf	Pago / Transferencia (HUF)	HU	HUF	other	t	t	500	\N	Forinto h??ngaro	2026-06-14 20:38:23.245996+00
65	generic_idr	Pago / Transferencia (IDR)	ID	IDR	other	t	t	500	\N	Rupia indonesia	2026-06-14 20:38:23.245996+00
66	generic_ils	Pago / Transferencia (ILS)	IL	ILS	other	t	t	500	\N	Nuevo sh??quel	2026-06-14 20:38:23.245996+00
67	generic_inr	Pago / Transferencia (INR)	IN	INR	other	t	t	500	\N	Rupia india (UPI)	2026-06-14 20:38:23.245996+00
68	generic_iqd	Pago / Transferencia (IQD)	IQ	IQD	other	t	t	500	\N	Dinar iraqu??	2026-06-14 20:38:23.245996+00
69	generic_irr	Pago / Transferencia (IRR)	IR	IRR	other	t	t	500	\N	Rial iran??	2026-06-14 20:38:23.245996+00
70	generic_isk	Pago / Transferencia (ISK)	IS	ISK	other	t	t	500	\N	Corona islandesa	2026-06-14 20:38:23.245996+00
71	generic_jmd	Pago / Transferencia (JMD)	JM	JMD	other	t	t	500	\N	D??lar jamaiquino	2026-06-14 20:38:23.245996+00
72	generic_jod	Pago / Transferencia (JOD)	JO	JOD	other	t	t	500	\N	Dinar jordano	2026-06-14 20:38:23.245996+00
73	generic_jpy	Pago / Transferencia (JPY)	JP	JPY	other	t	t	500	\N	Yen japon??s	2026-06-14 20:38:23.245996+00
74	generic_kes	Pago / Transferencia (KES)	KE	KES	other	t	t	500	\N	Chel??n keniano (M-Pesa)	2026-06-14 20:38:23.245996+00
75	generic_kgs	Pago / Transferencia (KGS)	KG	KGS	other	t	t	500	\N	Som kirgu??s	2026-06-14 20:38:23.245996+00
76	generic_khr	Pago / Transferencia (KHR)	KH	KHR	other	t	t	500	\N	Riel camboyano	2026-06-14 20:38:23.245996+00
77	generic_kmf	Pago / Transferencia (KMF)	KM	KMF	other	t	t	500	\N	Franco comorense	2026-06-14 20:38:23.245996+00
78	generic_kpw	Pago / Transferencia (KPW)	KP	KPW	other	t	t	500	\N	Won norcoreano	2026-06-14 20:38:23.245996+00
79	generic_krw	Pago / Transferencia (KRW)	KR	KRW	other	t	t	500	\N	Won surcoreano	2026-06-14 20:38:23.245996+00
80	generic_kwd	Pago / Transferencia (KWD)	KW	KWD	other	t	t	500	\N	Dinar kuwait??	2026-06-14 20:38:23.245996+00
81	generic_kyd	Pago / Transferencia (KYD)	KY	KYD	other	t	t	500	\N	D??lar caiman??s	2026-06-14 20:38:23.245996+00
82	generic_kzt	Pago / Transferencia (KZT)	KZ	KZT	other	t	t	500	\N	Tenge kazajo	2026-06-14 20:38:23.245996+00
83	generic_lak	Pago / Transferencia (LAK)	LA	LAK	other	t	t	500	\N	Kip laosiano	2026-06-14 20:38:23.245996+00
84	generic_lbp	Pago / Transferencia (LBP)	LB	LBP	other	t	t	500	\N	Libra libanesa	2026-06-14 20:38:23.245996+00
85	generic_lkr	Pago / Transferencia (LKR)	LK	LKR	other	t	t	500	\N	Rupia de Sri Lanka	2026-06-14 20:38:23.245996+00
86	generic_lrd	Pago / Transferencia (LRD)	LR	LRD	other	t	t	500	\N	D??lar liberiano	2026-06-14 20:38:23.245996+00
87	generic_lsl	Pago / Transferencia (LSL)	LS	LSL	other	t	t	500	\N	Loti lesothense	2026-06-14 20:38:23.245996+00
88	generic_lyd	Pago / Transferencia (LYD)	LY	LYD	other	t	t	500	\N	Dinar libio	2026-06-14 20:38:23.245996+00
89	generic_mad	Pago / Transferencia (MAD)	MA	MAD	other	t	t	500	\N	D??rham marroqu??	2026-06-14 20:38:23.245996+00
90	generic_mdl	Pago / Transferencia (MDL)	MD	MDL	other	t	t	500	\N	Leu moldavo	2026-06-14 20:38:23.245996+00
91	generic_mga	Pago / Transferencia (MGA)	MG	MGA	other	t	t	500	\N	Ariary malgache	2026-06-14 20:38:23.245996+00
92	generic_mkd	Pago / Transferencia (MKD)	MK	MKD	other	t	t	500	\N	Denar macedonio	2026-06-14 20:38:23.245996+00
93	generic_mmk	Pago / Transferencia (MMK)	MM	MMK	other	t	t	500	\N	Kyat birmano	2026-06-14 20:38:23.245996+00
94	generic_mnt	Pago / Transferencia (MNT)	MN	MNT	other	t	t	500	\N	Tugrik mongol	2026-06-14 20:38:23.245996+00
95	generic_mop	Pago / Transferencia (MOP)	MO	MOP	other	t	t	500	\N	Pataca macaense	2026-06-14 20:38:23.245996+00
96	generic_mru	Pago / Transferencia (MRU)	MR	MRU	other	t	t	500	\N	Uguiya mauritana	2026-06-14 20:38:23.245996+00
97	generic_mur	Pago / Transferencia (MUR)	MU	MUR	other	t	t	500	\N	Rupia mauriciana	2026-06-14 20:38:23.245996+00
98	generic_mvr	Pago / Transferencia (MVR)	MV	MVR	other	t	t	500	\N	Rufiyaa	2026-06-14 20:38:23.245996+00
99	generic_mwk	Pago / Transferencia (MWK)	MW	MWK	other	t	t	500	\N	Kwacha malau??	2026-06-14 20:38:23.245996+00
100	generic_mxn	Pago / Transferencia (MXN)	MX	MXN	other	t	t	500	\N	Peso mexicano (SPEI)	2026-06-14 20:38:23.245996+00
101	generic_myr	Pago / Transferencia (MYR)	MY	MYR	other	t	t	500	\N	Ringgit malayo	2026-06-14 20:38:23.245996+00
102	generic_mzn	Pago / Transferencia (MZN)	MZ	MZN	other	t	t	500	\N	Metical mozambique??o	2026-06-14 20:38:23.245996+00
103	generic_nad	Pago / Transferencia (NAD)	NA	NAD	other	t	t	500	\N	D??lar namibio	2026-06-14 20:38:23.245996+00
104	generic_ngn	Pago / Transferencia (NGN)	NG	NGN	other	t	t	500	\N	Naira nigeriana	2026-06-14 20:38:23.245996+00
105	generic_nio	Pago / Transferencia (NIO)	NI	NIO	other	t	t	500	\N	C??rdoba nicarag??ense	2026-06-14 20:38:23.245996+00
106	generic_nok	Pago / Transferencia (NOK)	NO	NOK	other	t	t	500	\N	Corona noruega	2026-06-14 20:38:23.245996+00
107	generic_npr	Pago / Transferencia (NPR)	NP	NPR	other	t	t	500	\N	Rupia nepal??	2026-06-14 20:38:23.245996+00
108	generic_nzd	Pago / Transferencia (NZD)	NZ	NZD	other	t	t	500	\N	D??lar neozeland??s	2026-06-14 20:38:23.245996+00
109	generic_omr	Pago / Transferencia (OMR)	OM	OMR	other	t	t	500	\N	Rial oman??	2026-06-14 20:38:23.245996+00
110	generic_pab	Pago / Transferencia (PAB)	PA	PAB	other	t	t	500	\N	Balboa paname??o	2026-06-14 20:38:23.245996+00
111	generic_pen	Pago / Transferencia (PEN)	PE	PEN	other	t	t	500	\N	Sol peruano	2026-06-14 20:38:23.245996+00
112	generic_pgk	Pago / Transferencia (PGK)	PG	PGK	other	t	t	500	\N	Kina	2026-06-14 20:38:23.245996+00
113	generic_php	Pago / Transferencia (PHP)	PH	PHP	other	t	t	500	\N	Peso filipino (GCash)	2026-06-14 20:38:23.245996+00
114	generic_pkr	Pago / Transferencia (PKR)	PK	PKR	other	t	t	500	\N	Rupia pakistan??	2026-06-14 20:38:23.245996+00
115	generic_pln	Pago / Transferencia (PLN)	PL	PLN	other	t	t	500	\N	Z??oty polaco	2026-06-14 20:38:23.245996+00
116	generic_pyg	Pago / Transferencia (PYG)	PY	PYG	other	t	t	500	\N	Guaran?? paraguayo	2026-06-14 20:38:23.245996+00
117	generic_qar	Pago / Transferencia (QAR)	QA	QAR	other	t	t	500	\N	Rial catar??	2026-06-14 20:38:23.245996+00
118	generic_ron	Pago / Transferencia (RON)	RO	RON	other	t	t	500	\N	Leu rumano	2026-06-14 20:38:23.245996+00
119	generic_rsd	Pago / Transferencia (RSD)	RS	RSD	other	t	t	500	\N	Dinar serbio	2026-06-14 20:38:23.245996+00
120	generic_rub	Pago / Transferencia (RUB)	RU	RUB	other	t	t	500	\N	Rublo ruso	2026-06-14 20:38:23.245996+00
121	generic_rwf	Pago / Transferencia (RWF)	RW	RWF	other	t	t	500	\N	Franco ruand??s	2026-06-14 20:38:23.245996+00
122	generic_sar	Pago / Transferencia (SAR)	SA	SAR	other	t	t	500	\N	Rial saud??	2026-06-14 20:38:23.245996+00
123	generic_sbd	Pago / Transferencia (SBD)	SB	SBD	other	t	t	500	\N	D??lar salomonense	2026-06-14 20:38:23.245996+00
124	generic_scr	Pago / Transferencia (SCR)	SC	SCR	other	t	t	500	\N	Rupia seychellense	2026-06-14 20:38:23.245996+00
125	generic_sdg	Pago / Transferencia (SDG)	SD	SDG	other	t	t	500	\N	Libra sudanesa	2026-06-14 20:38:23.245996+00
126	generic_sek	Pago / Transferencia (SEK)	SE	SEK	other	t	t	500	\N	Corona sueca	2026-06-14 20:38:23.245996+00
127	generic_sgd	Pago / Transferencia (SGD)	SG	SGD	other	t	t	500	\N	D??lar singapurense	2026-06-14 20:38:23.245996+00
128	generic_shp	Pago / Transferencia (SHP)	SH	SHP	other	t	t	500	\N	Libra de Santa Elena	2026-06-14 20:38:23.245996+00
129	generic_sll	Pago / Transferencia (SLL)	SL	SLL	other	t	t	500	\N	Leone sierraleon??s	2026-06-14 20:38:23.245996+00
130	generic_sos	Pago / Transferencia (SOS)	SO	SOS	other	t	t	500	\N	Chel??n somal??	2026-06-14 20:38:23.245996+00
131	generic_srd	Pago / Transferencia (SRD)	SR	SRD	other	t	t	500	\N	D??lar surinam??s	2026-06-14 20:38:23.245996+00
132	generic_ssp	Pago / Transferencia (SSP)	SS	SSP	other	t	t	500	\N	Libra sursudanesa	2026-06-14 20:38:23.245996+00
133	generic_stn	Pago / Transferencia (STN)	ST	STN	other	t	t	500	\N	Dobra	2026-06-14 20:38:23.245996+00
134	generic_syp	Pago / Transferencia (SYP)	SY	SYP	other	t	t	500	\N	Libra siria	2026-06-14 20:38:23.245996+00
135	generic_szl	Pago / Transferencia (SZL)	SZ	SZL	other	t	t	500	\N	Lilangeni	2026-06-14 20:38:23.245996+00
136	generic_thb	Pago / Transferencia (THB)	TH	THB	other	t	t	500	\N	Baht tailand??s	2026-06-14 20:38:23.245996+00
137	generic_tjs	Pago / Transferencia (TJS)	TJ	TJS	other	t	t	500	\N	Somoni tayiko	2026-06-14 20:38:23.245996+00
138	generic_tmt	Pago / Transferencia (TMT)	TM	TMT	other	t	t	500	\N	Manat turcomano	2026-06-14 20:38:23.245996+00
139	generic_tnd	Pago / Transferencia (TND)	TN	TND	other	t	t	500	\N	Dinar tunecino	2026-06-14 20:38:23.245996+00
140	generic_top	Pago / Transferencia (TOP)	TO	TOP	other	t	t	500	\N	Pa??anga	2026-06-14 20:38:23.245996+00
141	generic_try	Pago / Transferencia (TRY)	TR	TRY	other	t	t	500	\N	Lira turca	2026-06-14 20:38:23.245996+00
142	generic_ttd	Pago / Transferencia (TTD)	TT	TTD	other	t	t	500	\N	D??lar trinitense	2026-06-14 20:38:23.245996+00
143	generic_twd	Pago / Transferencia (TWD)	TW	TWD	other	t	t	500	\N	Nuevo d??lar taiwan??s	2026-06-14 20:38:23.245996+00
144	generic_tzs	Pago / Transferencia (TZS)	TZ	TZS	other	t	t	500	\N	Chel??n tanzano	2026-06-14 20:38:23.245996+00
145	generic_uah	Pago / Transferencia (UAH)	UA	UAH	other	t	t	500	\N	Grivna ucraniana	2026-06-14 20:38:23.245996+00
146	generic_ugx	Pago / Transferencia (UGX)	UG	UGX	other	t	t	500	\N	Chel??n ugand??s	2026-06-14 20:38:23.245996+00
147	generic_usd	Pago / Transferencia (USD)	US	USD	other	t	t	500	\N	D??lar USA (Zelle, PayPal, Cash App)	2026-06-14 20:38:23.245996+00
148	generic_uyu	Pago / Transferencia (UYU)	UY	UYU	other	t	t	500	\N	Peso uruguayo	2026-06-14 20:38:23.245996+00
149	generic_uzs	Pago / Transferencia (UZS)	UZ	UZS	other	t	t	500	\N	Som uzbeko	2026-06-14 20:38:23.245996+00
150	generic_ves	Pago / Transferencia (VES)	VE	VES	other	t	t	500	\N	Bol??var (Pago M??vil, Zelle)	2026-06-14 20:38:23.245996+00
151	generic_vnd	Pago / Transferencia (VND)	VN	VND	other	t	t	500	\N	Dong vietnamita	2026-06-14 20:38:23.245996+00
152	generic_vuv	Pago / Transferencia (VUV)	VU	VUV	other	t	t	500	\N	Vatu	2026-06-14 20:38:23.245996+00
153	generic_wst	Pago / Transferencia (WST)	WS	WST	other	t	t	500	\N	Tala samoano	2026-06-14 20:38:23.245996+00
154	generic_xaf	Pago / Transferencia (XAF)	CM	XAF	other	t	t	500	\N	Franco CFA central	2026-06-14 20:38:23.245996+00
155	generic_xcd	Pago / Transferencia (XCD)	AG	XCD	other	t	t	500	\N	D??lar del Caribe Oriental	2026-06-14 20:38:23.245996+00
156	generic_xof	Pago / Transferencia (XOF)	SN	XOF	other	t	t	500	\N	Franco CFA occidental	2026-06-14 20:38:23.245996+00
157	generic_xpf	Pago / Transferencia (XPF)	PF	XPF	other	t	t	500	\N	Franco CFP	2026-06-14 20:38:23.245996+00
158	generic_yer	Pago / Transferencia (YER)	YE	YER	other	t	t	500	\N	Rial yemen??	2026-06-14 20:38:23.245996+00
159	generic_zar	Pago / Transferencia (ZAR)	ZA	ZAR	other	t	t	500	\N	Rand sudafricano	2026-06-14 20:38:23.245996+00
160	generic_zmw	Pago / Transferencia (ZMW)	ZM	ZMW	other	t	t	500	\N	Kwacha zambiano	2026-06-14 20:38:23.245996+00
161	generic_zwl	Pago / Transferencia (ZWL)	ZW	ZWL	other	t	t	500	\N	D??lar zimbabuense	2026-06-14 20:38:23.245996+00
\.


ALTER TABLE public.p2p_payment_methods ENABLE TRIGGER ALL;

--
-- Data for Name: plus_plans; Type: TABLE DATA; Schema: public; Owner: postgres
--

ALTER TABLE public.plus_plans DISABLE TRIGGER ALL;

COPY public.plus_plans (id, name, code, duration_months, price_fxu, price_usdt, commission_share_percent, is_active, created_at, updated_at, duration_days) FROM stdin;
2	VIP Semestral	plus_6months	6	300000	50	1.2	t	2026-06-14 20:06:14.422645+00	2026-06-22 06:03:42.116846+00	\N
3	VIP Anual	plus_annual	12	500000	100	1.5	t	2026-06-14 20:06:14.422645+00	2026-06-22 06:03:51.759976+00	\N
1	VIP Mensual	plus_monthly	1	60000	10	1	t	2026-06-14 20:06:14.422645+00	2026-07-27 04:39:27.832094+00	\N
4	VIP Semanal	plus_weekly	0	35000	4	0.8	f	2026-06-14 20:36:13.391189+00	2026-06-22 06:03:24.99587+00	7
\.


ALTER TABLE public.plus_plans ENABLE TRIGGER ALL;

--
-- Data for Name: premium_missions; Type: TABLE DATA; Schema: public; Owner: postgres
--

ALTER TABLE public.premium_missions DISABLE TRIGGER ALL;

COPY public.premium_missions (id, code, title_es, description_es, reward_fxu, cost_fxu, is_active, created_at) FROM stdin;
\.


ALTER TABLE public.premium_missions ENABLE TRIGGER ALL;

--
-- Data for Name: schema_migrations; Type: TABLE DATA; Schema: public; Owner: postgres
--

ALTER TABLE public.schema_migrations DISABLE TRIGGER ALL;

COPY public.schema_migrations (version) FROM stdin;
00
20210710035447
20210722035447
20210730183235
20210909172000
20210927181326
20211122151130
20211124214934
20211202183645
20220114185221
20220114185340
20220224000811
20220323170000
20220429102000
20220531120530
20220614074223
20220811173540
20221003041349
20221003041400
20221011041400
20221020193600
20221021073300
20221021082433
20221027105023
20221114143122
20221114143410
20221125140132
20221208132122
20221215195500
20221215195800
20221215195900
20230116124310
20230116124412
20230131181311
20230322519590
20230402418590
20230411005111
20230508135423
20230523124323
20230818113222
20230914180801
20231027141322
20231114161723
20231117164230
20240115144230
20240214120130
20240306115329
20240314092811
20240427152123
\.


ALTER TABLE public.schema_migrations ENABLE TRIGGER ALL;

--
-- Data for Name: ship_blueprints; Type: TABLE DATA; Schema: public; Owner: postgres
--

ALTER TABLE public.ship_blueprints DISABLE TRIGGER ALL;

COPY public.ship_blueprints (id, code, ship_type_id, name, description, image_url, price_fxu, is_active, created_at, is_droppable, expedition_drop_chance, drop_cooldown_seconds, last_drop_at, price_usd, defense_type_id, is_for_sale) FROM stdin;
11	bp_destroyer	13	Plano Destructor	Plano permanente de Destructor. Al comprarlo desbloqueas su construccion para siempre: solo necesitas Hangar nivel 1 y los recursos para fabricarla.	\N	100000	t	2026-07-10 05:19:42.126004+00	f	1	86400	\N	52.5000	\N	t
12	bp_deathstar	14	Plano Estrella de la Muerte	Plano permanente de Estrella de la Muerte. Al comprarlo desbloqueas su construccion para siempre: solo necesitas Hangar nivel 1 y los recursos para fabricarla.	\N	100000	t	2026-07-10 05:19:42.126004+00	f	0	86400	\N	105.0000	\N	t
9	bp_nova	18	Plano Nova	Plano permanente de Nova. Al comprarlo desbloqueas su construccion para siempre: solo necesitas Hangar nivel 1 y los recursos para fabricarla.	\N	100000	t	2026-07-10 05:19:42.126004+00	f	0	86400	\N	1050.0000	\N	t
13	bp_destruccion_masiva	20	Plano Destruccion Masiva	Plano permanente de Destruccion Masiva. Al comprarlo desbloqueas su construccion para siempre: solo necesitas Hangar nivel 1 y los recursos para fabricarla.	\N	100000	t	2026-07-10 05:19:42.126004+00	f	0	86400	\N	2100.0000	\N	t
17	bp_heavy_fighter	8	Plano Cazador Pesado	Plano permanente de Cazador Pesado. Al comprarlo desbloqueas su construccion para siempre: solo necesitas Hangar nivel 1 y los recursos para fabricarla.	\N	100000	t	2026-07-10 05:19:42.126004+00	t	10	86400	\N	1.4000	\N	t
19	bp_battleship	10	Plano Nave de Batalla	Plano permanente de Nave de Batalla. Al comprarlo desbloqueas su construccion para siempre: solo necesitas Hangar nivel 1 y los recursos para fabricarla.	\N	100000	t	2026-07-10 05:19:42.126004+00	t	1	86400	\N	28.0000	\N	t
20	bp_battlecruiser	11	Plano Acorazado	Plano permanente de Acorazado. Al comprarlo desbloqueas su construccion para siempre: solo necesitas Hangar nivel 1 y los recursos para fabricarla.	\N	100000	t	2026-07-10 05:19:42.126004+00	f	1	86400	\N	52.5000	\N	t
10	bp_bomber	12	Plano Bombardero	Plano permanente de Bombardero. Al comprarlo desbloqueas su construccion para siempre: solo necesitas Hangar nivel 1 y los recursos para fabricarla.	\N	100000	t	2026-07-10 05:19:42.126004+00	f	1	86400	\N	56.0000	\N	t
18	bp_cruiser	9	Plano Crucero	Plano permanente de Crucero. Al comprarlo desbloqueas su construccion para siempre: solo necesitas Hangar nivel 1 y los recursos para fabricarla.	\N	100000	t	2026-07-10 05:19:42.126004+00	f	0	86400	\N	14.0000	\N	t
1	bp_falco_x_clasica	17	Plano Falco-X Clasica	Plano permanente de ensamblaje de la Falco-X Clasica. Transferible en mercado P2P.	https://falcox.net/assets/blueprints/bp_falco_x_clasica.png	100000	t	2026-06-14 22:57:26.377126+00	f	0	86400	\N	175.0000	\N	f
25	bp_heavy_laser	\N	Plano Laser Pesado	Plano consumible de Laser Pesado. 1 plano = 1 unidad. Transferible en mercado P2P.	\N	50000	t	2026-07-11 00:11:46.934896+00	f	0	86400	\N	5.6000	3	t
26	bp_ion_cannon	\N	Plano Canon Ionico	Plano consumible de Canon Ionico. 1 plano = 1 unidad. Transferible en mercado P2P.	\N	60000	t	2026-07-11 00:11:46.934896+00	f	0	86400	\N	8.4000	5	t
27	bp_gauss_cannon	\N	Plano Canon de Gauss	Plano consumible de Canon de Gauss. 1 plano = 1 unidad. Transferible en mercado P2P.	\N	80000	t	2026-07-11 00:11:46.934896+00	f	0	86400	\N	12.6000	4	t
22	bp_interplanetary_missile	\N	Plano Misil Interplanetario	Plano consumible de Misil Interplanetario. 1 plano = 1 unidad. Transferible en mercado P2P.	\N	90000	t	2026-07-11 00:11:46.934896+00	f	0	86400	\N	17.5000	10	t
29	bp_small_shield_dome	\N	Plano Cupula Pequena de Escudo	Plano consumible de Cupula Pequena de Escudo. 1 plano = 1 unidad. Transferible en mercado P2P.	\N	100000	t	2026-07-11 00:11:46.934896+00	f	0	86400	\N	24.5000	7	t
28	bp_plasma_turret	\N	Plano Torreta de Plasma	Plano consumible de Torreta de Plasma. 1 plano = 1 unidad. Transferible en mercado P2P.	\N	120000	t	2026-07-11 00:11:46.934896+00	f	0	86400	\N	31.5000	6	t
30	bp_large_shield_dome	\N	Plano Cupula Grande de Escudo	Plano consumible de Cupula Grande de Escudo. 1 plano = 1 unidad. Transferible en mercado P2P.	\N	180000	t	2026-07-11 00:11:46.934896+00	f	0	86400	\N	45.5000	8	t
33	bp_orbital_defense_platform	\N	Plano: Plataforma de Defensa Orbital	Plano necesario para poder construir la Plataforma de Defensa Orbital.	/Imagenes/defensa/Plataforma_Defensa_Orbital.webp	100000	t	2026-07-12 15:53:07.841357+00	f	0	86400	\N	4200.0000	13	t
14	bp_solar_satellite	6	Plano Satelite Solar	Plano permanente de Satelite Solar. Al comprarlo desbloqueas su construccion para siempre: solo necesitas Hangar nivel 1 y los recursos para fabricarla.	\N	100000	t	2026-07-10 05:19:42.126004+00	f	5	86400	\N	0.0700	\N	t
34	bp_graviton_cannon	\N	Plano Cañón de Gravitón	Plano del arma defensiva más poderosa. Permite construir el Cañón de Gravitón.	/Imagenes/defensa/Cañones de Gravitón.webp	500000	t	2026-07-13 15:52:42.641223+00	f	0	86400	\N	350.0000	15	t
6	bp_colony_ship	3	Plano Nave Colonizadora	Plano permanente de Nave Colonizadora. Al comprarlo desbloqueas su construccion para siempre: solo necesitas Hangar nivel 1 y los recursos para fabricarla.	\N	100000	t	2026-07-10 05:19:42.126004+00	f	3	86400	\N	14.0000	\N	t
15	bp_espionage_probe	5	Plano Sonda de Espionaje	Plano permanente de Sonda de Espionaje. Al comprarlo desbloqueas su construccion para siempre: solo necesitas Hangar nivel 1 y los recursos para fabricarla.	\N	100000	t	2026-07-10 05:19:42.126004+00	t	1	86400	\N	7.0000	\N	t
2	bp_mega_recycler	21	Plano Mega Reciclador	Plano permanente de ensamblaje del Mega Reciclador. Transferible en mercado P2P.	https://falcox.net/assets/blueprints/bp_mega_recycler.png	50000	t	2026-06-14 22:57:26.377126+00	f	0	86400	\N	105.0000	\N	t
4	bp_small_cargo	1	Plano Nave Pequena de Carga	Plano permanente de Nave Pequena de Carga. Al comprarlo desbloqueas su construccion para siempre: solo necesitas Hangar nivel 1 y los recursos para fabricarla.	\N	100000	t	2026-07-10 05:19:42.126004+00	f	0	86400	\N	0.7000	\N	t
5	bp_large_cargo	2	Plano Nave Grande de Carga	Plano permanente de Nave Grande de Carga. Al comprarlo desbloqueas su construccion para siempre: solo necesitas Hangar nivel 1 y los recursos para fabricarla.	\N	100000	t	2026-07-10 05:19:42.126004+00	f	5	86400	\N	21.0000	\N	t
8	bp_large_frigate	19	Plano Fragata Grande	Plano permanente de Fragata Grande. Al comprarlo desbloqueas su construccion para siempre: solo necesitas Hangar nivel 1 y los recursos para fabricarla.	\N	100000	t	2026-07-10 05:19:42.126004+00	f	0.5	86400	\N	70.0000	\N	t
23	bp_rocket_launcher	\N	Plano Lanzamisiles	Plano consumible de Lanzamisiles. 1 plano = 1 unidad. Transferible en mercado P2P.	\N	25000	t	2026-07-11 00:11:46.934896+00	f	0	86400	\N	0.7000	1	t
24	bp_light_laser	\N	Plano Laser Ligero	Plano consumible de Laser Ligero. 1 plano = 1 unidad. Transferible en mercado P2P.	\N	30000	t	2026-07-11 00:11:46.934896+00	f	0	86400	\N	2.1000	2	t
21	bp_anti_ballistic_missile	\N	Plano Misil de Intercepcion	Plano consumible de Misil de Intercepcion. 1 plano = 1 unidad. Transferible en mercado P2P.	\N	40000	t	2026-07-11 00:11:46.934896+00	f	0	86400	\N	3.5000	9	t
16	bp_light_fighter	7	Plano Cazador Ligero	Plano permanente de Cazador Ligero. Al comprarlo desbloqueas su construccion para siempre: solo necesitas Hangar nivel 1 y los recursos para fabricarla.	\N	100000	t	2026-07-10 05:19:42.126004+00	t	20	86400	\N	10.5000	\N	t
31	bp_outer_protection_dome	\N	Plano Cupula externa de proteccion	Plano consumible de Cupula externa de proteccion. 1 plano = 1 unidad. Transferible en mercado P2P.	\N	300000	t	2026-07-11 00:11:46.934896+00	f	0	86400	\N	210.0000	11	t
7	bp_recycler	4	Plano Reciclador	Plano permanente de Reciclador. Al comprarlo desbloqueas su construccion para siempre: solo necesitas Hangar nivel 1 y los recursos para fabricarla.	\N	100000	t	2026-07-10 05:19:42.126004+00	f	0	86400	\N	10.5000	\N	t
\.


ALTER TABLE public.ship_blueprints ENABLE TRIGGER ALL;

--
-- Data for Name: ship_requirements; Type: TABLE DATA; Schema: public; Owner: postgres
--

ALTER TABLE public.ship_requirements DISABLE TRIGGER ALL;

COPY public.ship_requirements (id, ship_type_id, required_building_id, required_building_level, required_tech_id, required_tech_level) FROM stdin;
1	1	11	2	\N	0
2	1	\N	0	6	2
3	2	11	4	\N	0
4	2	\N	0	6	6
5	7	11	1	\N	0
6	8	11	3	\N	0
7	8	\N	0	11	2
8	8	\N	0	7	2
9	9	11	5	\N	0
10	9	\N	0	3	2
11	9	\N	0	7	4
12	10	11	7	\N	0
13	10	\N	0	8	4
14	3	11	4	\N	0
15	3	\N	0	7	3
16	4	11	4	\N	0
17	4	\N	0	6	6
18	4	\N	0	10	2
19	5	11	3	\N	0
20	5	\N	0	6	3
21	5	\N	0	12	2
22	6	11	1	\N	0
23	12	11	8	\N	0
24	12	\N	0	7	6
25	12	\N	0	5	5
26	13	11	9	\N	0
27	13	\N	0	4	5
28	13	\N	0	8	6
29	14	11	12	\N	0
30	14	\N	0	4	6
31	14	\N	0	8	7
32	14	\N	0	15	1
33	11	11	8	\N	0
34	11	\N	0	4	5
35	11	\N	0	8	5
36	11	\N	0	2	12
65	19	11	14	\N	0
66	19	\N	0	4	10
67	19	\N	0	7	15
84	18	11	15	\N	0
85	18	\N	0	8	15
86	18	\N	0	4	12
87	18	\N	0	15	3
88	18	\N	0	5	12
89	18	\N	0	9	14
90	18	\N	0	11	14
91	18	\N	0	2	14
92	20	11	18	\N	0
93	20	\N	0	9	20
94	20	\N	0	10	20
95	20	\N	0	11	20
96	20	\N	0	4	15
97	20	\N	0	8	20
98	20	\N	0	2	25
99	20	\N	0	15	8
104	21	11	16	\N	\N
105	21	\N	\N	7	12
106	21	\N	\N	8	10
107	21	\N	\N	4	8
126	17	11	14	\N	0
127	17	\N	0	5	8
128	17	\N	0	7	10
129	17	\N	0	8	11
130	17	\N	0	9	12
131	17	\N	0	11	12
132	17	\N	0	2	12
133	17	\N	0	3	8
134	17	\N	0	4	9
135	17	\N	0	15	2
136	22	11	9	\N	0
137	22	\N	0	4	5
138	22	\N	0	8	6
139	22	\N	0	25	5
\.


ALTER TABLE public.ship_requirements ENABLE TRIGGER ALL;

--
-- Data for Name: sports_config; Type: TABLE DATA; Schema: public; Owner: postgres
--

ALTER TABLE public.sports_config DISABLE TRIGGER ALL;

COPY public.sports_config (id, enabled, api_token, competitions, min_bet, max_bet, max_per_match, close_minutes, sync_interval_minutes, pool_pending, pending_request_id, last_request_at, force_sync, last_sync_at, last_sync_status, last_sync_error, last_sync_count, updated_at) FROM stdin;
1	t	6e3d438cd1414f5ea3eafc22296f4e88	{PL,PD,SA,BL1,FL1,CL}	1	1000	5000	5	3	7.80000087	\N	2026-10-28 23:12:00.08538+00	f	2026-10-28 23:13:00.044297+00	200	\N	69	2026-10-28 23:13:00.044297+00
\.


ALTER TABLE public.sports_config ENABLE TRIGGER ALL;

--
-- Data for Name: supply_boxes; Type: TABLE DATA; Schema: public; Owner: postgres
--

ALTER TABLE public.supply_boxes DISABLE TRIGGER ALL;

COPY public.supply_boxes (id, name, code, description, metal_amount, crystal_amount, deuterium_amount, price_fxu, is_active, sort_order, created_at, updated_at, price_usdt, archived_at) FROM stdin;
9	Caja Titán	box_titan	metal, cristal y deuterio	20000000	20000000	20000000	0	t	9	2026-10-03 05:55:54.946688+00	2026-10-12 18:14:18.808684+00	250	\N
1	Caja Inicial	box_starter	Recursos basicos para comenzar	60000	60000	60000	0	t	1	2026-06-14 20:06:16.766257+00	2026-10-12 18:51:27.110977+00	1	\N
2	Caja Media	box_medium	Suministros para expansion	300000	300000	300000	0	t	2	2026-06-14 20:06:16.766257+00	2026-10-12 18:51:33.760251+00	5	\N
3	Caja Grande	box_large	Recursos abundantes	600000	600000	600000	0	t	3	2026-06-14 20:06:16.766257+00	2026-10-12 18:51:40.351804+00	10	\N
4	Caja Premium	box_premium	Para jugadores serios	1000000	1000000	1000000	0	t	4	2026-06-14 20:06:16.766257+00	2026-10-12 18:51:53.757804+00	20	\N
5	Caja Ultimate	box_ultimate	Maximos recursos	3000000	3000000	3000000	0	t	5	2026-06-14 20:06:16.766257+00	2026-10-12 18:51:59.78597+00	40	\N
6	Caja Colosal	box_colossal	metal, cristal y deuterio	5000000	5000000	5000000	0	t	6	2026-10-03 05:55:54.946688+00	2026-10-12 18:52:06.451848+00	75	\N
7	Caja Imperial	box_imperial	metal, cristal y deuterio	6000000	6000000	6000000	0	t	7	2026-10-03 05:55:54.946688+00	2026-10-12 18:52:12.308402+00	100	\N
8	Caja Galáctica	box_galactic	metal, cristal y deuterio	9000000	9000000	9000000	0	t	8	2026-10-03 05:55:54.946688+00	2026-10-12 18:53:22.256225+00	150	\N
10	Caja Leyenda	box_legend	metal, cristal y deuterio	50000000	50000000	50000000	0	t	10	2026-10-03 05:55:54.946688+00	2026-10-12 18:53:36.011195+00	500	\N
\.


ALTER TABLE public.supply_boxes ENABLE TRIGGER ALL;

--
-- Data for Name: technology_requirements; Type: TABLE DATA; Schema: public; Owner: postgres
--

ALTER TABLE public.technology_requirements DISABLE TRIGGER ALL;

COPY public.technology_requirements (id, technology_type_id, required_building_id, required_building_level, required_tech_id, required_tech_level) FROM stdin;
1	1	12	1	\N	0
2	2	12	1	\N	0
3	2	\N	0	1	2
4	3	12	4	\N	0
5	3	\N	0	2	5
6	3	\N	0	1	4
7	4	12	7	\N	0
8	4	\N	0	1	5
9	4	\N	0	10	5
10	5	12	4	\N	0
11	5	\N	0	2	10
12	5	\N	0	3	5
13	5	\N	0	1	8
14	6	12	1	\N	0
15	6	\N	0	1	1
16	7	12	2	\N	0
17	7	\N	0	1	1
18	8	12	7	\N	0
19	8	\N	0	4	3
20	9	12	4	\N	0
21	10	12	6	\N	0
22	10	\N	0	1	3
23	11	12	2	\N	0
24	12	12	3	\N	0
25	13	12	1	\N	0
26	14	12	3	\N	0
27	14	\N	0	12	4
28	14	\N	0	7	3
29	15	12	12	\N	0
30	16	\N	0	4	8
31	16	\N	0	13	8
41	21	12	3	\N	0
42	21	\N	0	12	3
43	21	\N	0	7	3
44	22	12	8	\N	0
45	22	\N	0	1	5
46	23	12	8	\N	0
47	23	\N	0	1	5
48	24	12	8	\N	0
49	24	\N	0	1	5
50	25	12	13	\N	0
51	25	\N	0	1	9
\.


ALTER TABLE public.technology_requirements ENABLE TRIGGER ALL;

--
-- Data for Name: telegram_config; Type: TABLE DATA; Schema: public; Owner: postgres
--

ALTER TABLE public.telegram_config DISABLE TRIGGER ALL;

COPY public.telegram_config (id, group_id, group_title, group_invite_link, created_at, updated_at) FROM stdin;
1	-1004204340147	TUNG	https://t.me/TrungTungMeme	2026-06-15 04:12:26.178342+00	2026-06-15 04:12:26.178342+00
\.


ALTER TABLE public.telegram_config ENABLE TRIGGER ALL;

--
-- Data for Name: telegram_dm_config; Type: TABLE DATA; Schema: public; Owner: postgres
--

ALTER TABLE public.telegram_dm_config DISABLE TRIGGER ALL;

COPY public.telegram_dm_config (id, edge_function_url, anon_key, is_enabled, created_at, updated_at) FROM stdin;
1		eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx2cWFndWR3aWZ2eXRzcHRxanhwIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MTQ0OTMyOCwiZXhwIjoyMDk3MDI1MzI4fQ.z5XsjMXzjz2B31ZekI55omiwoEfWRVRlOh75eDUzMPs	t	2026-06-14 20:14:49.665929+00	2026-06-14 20:14:49.665929+00
\.


ALTER TABLE public.telegram_dm_config ENABLE TRIGGER ALL;

--
-- Data for Name: telegram_groups; Type: TABLE DATA; Schema: public; Owner: postgres
--

ALTER TABLE public.telegram_groups DISABLE TRIGGER ALL;

COPY public.telegram_groups (id, chat_id, title, username, is_enabled, added_at, last_message_at) FROM stdin;
f3154b21-7488-4a67-8a14-03e6e6e28b57	-1004204340147	TUNG	TrungTungMeme	t	2026-06-15 04:01:10.864683+00	2026-10-28 21:46:02.643073+00
d8351d64-94db-49fa-b52c-bb8de1b89b0d	-1003554938981	FalcoX Universe	FalcoX_Universe	t	2026-07-18 05:10:33.647308+00	2026-10-28 21:46:03.351683+00
\.


ALTER TABLE public.telegram_groups ENABLE TRIGGER ALL;

--
-- Data for Name: twitter_missions; Type: TABLE DATA; Schema: public; Owner: postgres
--

ALTER TABLE public.twitter_missions DISABLE TRIGGER ALL;

COPY public.twitter_missions (id, tweet_id, tweet_url, description, hashtag, is_active, created_at) FROM stdin;
e06124a5-1b48-4ccc-924a-989809d56280	2033753282175209924	https://x.com/FalcoX_universe/status/2033753282175209924	GN, #NovaArmy Although, I don't know... because something tells me that they're most active at night...	#NovaArmy	t	2026-06-14 20:33:33.489292+00
\.


ALTER TABLE public.twitter_missions ENABLE TRIGGER ALL;

--
-- Data for Name: twitter_social_config; Type: TABLE DATA; Schema: public; Owner: postgres
--

ALTER TABLE public.twitter_social_config DISABLE TRIGGER ALL;

COPY public.twitter_social_config (id, official_account, default_hashtag, quote_tweet_points, comment_points, link_reward_fxu, created_at, required_hashtags, official_twitter_user_id, last_fetched_tweet_id, supabase_project_url, supabase_anon_key, ranking_reset_at) FROM stdin;
c4aa0223-9567-4f98-ab9e-470c26c9f00f	FalcoX_universe	#FalcoXUniverse	10	5	20	2026-06-14 20:33:31.187114+00	{#FalcoX,#Xnova,#ogames}	\N	\N	\N	\N	2026-06-14 20:35:38.290603+00
\.


ALTER TABLE public.twitter_social_config ENABLE TRIGGER ALL;

--
-- Data for Name: wallet_config; Type: TABLE DATA; Schema: public; Owner: postgres
--

ALTER TABLE public.wallet_config DISABLE TRIGGER ALL;

COPY public.wallet_config (id, deposit_wallet_address, min_deposit, max_withdrawal_daily, withdrawal_fee_percent, required_confirmations, is_deposits_enabled, is_withdrawals_enabled, updated_at, contract_address, chain_id, signature_expiry_seconds, signer_address, usdt_contract_address, is_usdt_deposits_enabled, is_usdt_withdrawals_enabled, usdt_withdrawal_fee_percent, usdt_min_deposit, usdt_max_withdrawal_daily, swap_rate_fxu_per_usdt, is_swap_enabled, swap_min_fxu, swap_min_usdt, swap_fee_percent) FROM stdin;
1	0x387526aa3f94f5C41e6a47D8c98751273e2214A3	0	2000	0	3	t	t	2026-10-28 04:10:23.7545+00	0x09514EcF8270C12101D077B5e8B034B164F71C5f	56	900		0x55d398326f99059fF775485246999027B3197955	t	t	2	1	20	10000	t	1000	0.1	1
\.


ALTER TABLE public.wallet_config ENABLE TRIGGER ALL;

--
-- Data for Name: schema_migrations; Type: TABLE DATA; Schema: realtime; Owner: postgres
--

ALTER TABLE realtime.schema_migrations DISABLE TRIGGER ALL;

COPY realtime.schema_migrations (version, inserted_at) FROM stdin;
20211116024918	2026-06-14 19:11:04
20211116045059	2026-06-14 19:11:04
20211116050929	2026-06-14 19:11:04
20211116051442	2026-06-14 19:11:04
20211116212300	2026-06-14 19:11:04
20211116213355	2026-06-14 19:11:04
20211116213934	2026-06-14 19:11:04
20211116214523	2026-06-14 19:11:04
20211122062447	2026-06-14 19:11:04
20211124070109	2026-06-14 19:11:04
20211202204204	2026-06-14 19:11:04
20211202204605	2026-06-14 19:11:04
20211210212804	2026-06-14 19:11:04
20211228014915	2026-06-14 19:11:05
20220107221237	2026-06-14 19:11:05
20220228202821	2026-06-14 19:11:05
20220312004840	2026-06-14 19:11:05
20220603231003	2026-06-14 19:11:05
20220603232444	2026-06-14 19:11:05
20220615214548	2026-06-14 19:11:05
20220712093339	2026-06-14 19:11:05
20220908172859	2026-06-14 19:11:05
20220916233421	2026-06-14 19:11:05
20230119133233	2026-06-14 19:11:05
20230128025114	2026-06-14 19:11:05
20230128025212	2026-06-14 19:11:05
20230227211149	2026-06-14 19:11:05
20230228184745	2026-06-14 19:11:05
20230308225145	2026-06-14 19:11:05
20230328144023	2026-06-14 19:11:05
20231018144023	2026-06-14 19:11:05
20231204144023	2026-06-14 19:11:05
20231204144024	2026-06-14 19:11:05
20231204144025	2026-06-14 19:11:05
20240108234812	2026-06-14 19:11:05
20240109165339	2026-06-14 19:11:05
20240227174441	2026-06-14 19:11:05
20240311171622	2026-06-14 19:11:05
20240321100241	2026-06-14 19:11:05
20240401105812	2026-06-14 19:11:05
20240418121054	2026-06-14 19:11:05
20240523004032	2026-06-14 19:11:05
20240618124746	2026-06-14 19:11:05
20240801235015	2026-06-14 19:11:05
20240805133720	2026-06-14 19:11:05
20240827160934	2026-06-14 19:11:05
20240919163303	2026-06-14 19:11:05
20240919163305	2026-06-14 19:11:05
20241019105805	2026-06-14 19:11:05
20241030150047	2026-06-14 19:11:05
20241108114728	2026-06-14 19:11:05
20241121104152	2026-06-14 19:11:05
20241130184212	2026-06-14 19:11:05
20241220035512	2026-06-14 19:11:05
20241220123912	2026-06-14 19:11:05
20241224161212	2026-06-14 19:11:05
20250107150512	2026-06-14 19:11:05
20250110162412	2026-06-14 19:11:05
20250123174212	2026-06-14 19:11:05
20250128220012	2026-06-14 19:11:05
20250506224012	2026-06-14 19:11:05
20250523164012	2026-06-14 19:11:05
20250714121412	2026-06-14 19:11:05
20250905041441	2026-06-14 19:11:05
20251103001201	2026-06-14 19:11:05
20251120212548	2026-06-14 19:11:05
20251120215549	2026-06-14 19:11:05
20260218120000	2026-06-14 19:11:05
20260326120000	2026-06-14 19:11:05
20260514120000	2026-06-14 19:11:05
20260527120000	2026-06-14 19:11:05
20260528120000	2026-06-14 19:11:05
20260603120000	2026-06-14 19:11:05
20260605120000	2026-06-16 00:21:09
20260606110000	2026-06-16 00:21:09
\.


ALTER TABLE realtime.schema_migrations ENABLE TRIGGER ALL;

--
-- Data for Name: buckets; Type: TABLE DATA; Schema: storage; Owner: postgres
--

ALTER TABLE storage.buckets DISABLE TRIGGER ALL;

COPY storage.buckets (id, name, owner, created_at, updated_at, public, avif_autodetection, file_size_limit, allowed_mime_types, owner_id, type) FROM stdin;
avatars	avatars	\N	2026-06-14 20:03:02.908976+00	2026-06-14 20:03:02.908976+00	t	f	2097152	{image/jpeg,image/png,image/gif,image/webp}	\N	STANDARD
p2p-evidence	p2p-evidence	\N	2026-06-14 20:38:54.480991+00	2026-06-14 20:38:54.480991+00	f	f	\N	\N	\N	STANDARD
kyc-documents	kyc-documents	\N	2026-07-09 20:19:57.553562+00	2026-07-09 20:19:57.553562+00	f	f	\N	\N	\N	STANDARD
\.


ALTER TABLE storage.buckets ENABLE TRIGGER ALL;

--
-- Data for Name: migrations; Type: TABLE DATA; Schema: storage; Owner: postgres
--

ALTER TABLE storage.migrations DISABLE TRIGGER ALL;

COPY storage.migrations (id, name, hash, executed_at) FROM stdin;
0	create-migrations-table	e18db593bcde2aca2a408c4d1100f6abba2195df	2026-06-14 15:04:58.345176
1	initialmigration	6ab16121fbaa08bbd11b712d05f358f9b555d777	2026-06-14 15:04:58.377761
3	pathtoken-column	2cb1b0004b817b29d5b0a971af16bafeede4b70d	2026-06-14 15:04:58.40417
4	add-migrations-rls	427c5b63fe1c5937495d9c635c263ee7a5905058	2026-06-14 15:04:58.417761
5	add-size-functions	79e081a1455b63666c1294a440f8ad4b1e6a7f84	2026-06-14 15:04:58.423872
7	add-rls-to-buckets	e7e7f86adbc51049f341dfe8d30256c1abca17aa	2026-06-14 15:04:58.436814
8	add-public-to-buckets	fd670db39ed65f9d08b01db09d6202503ca2bab3	2026-06-14 15:04:58.442077
11	add-trigger-to-auto-update-updated_at-column	7425bdb14366d1739fa8a18c83100636d74dcaa2	2026-06-14 15:04:58.460492
12	add-automatic-avif-detection-flag	8e92e1266eb29518b6a4c5313ab8f29dd0d08df9	2026-06-14 15:04:58.466196
13	add-bucket-custom-limits	cce962054138135cd9a8c4bcd531598684b25e7d	2026-06-14 15:04:58.471578
14	use-bytes-for-max-size	941c41b346f9802b411f06f30e972ad4744dad27	2026-06-14 15:04:58.478565
15	add-can-insert-object-function	934146bc38ead475f4ef4b555c524ee5d66799e5	2026-06-14 15:04:58.504814
16	add-version	76debf38d3fd07dcfc747ca49096457d95b1221b	2026-06-14 15:04:58.510262
17	drop-owner-foreign-key	f1cbb288f1b7a4c1eb8c38504b80ae2a0153d101	2026-06-14 15:04:58.515322
18	add_owner_id_column_deprecate_owner	e7a511b379110b08e2f214be852c35414749fe66	2026-06-14 15:04:58.52053
19	alter-default-value-objects-id	02e5e22a78626187e00d173dc45f58fa66a4f043	2026-06-14 15:04:58.526931
20	list-objects-with-delimiter	cd694ae708e51ba82bf012bba00caf4f3b6393b7	2026-06-14 15:04:58.532063
21	s3-multipart-uploads	8c804d4a566c40cd1e4cc5b3725a664a9303657f	2026-06-14 15:04:58.538799
22	s3-multipart-uploads-big-ints	9737dc258d2397953c9953d9b86920b8be0cdb73	2026-06-14 15:04:58.554413
23	optimize-search-function	9d7e604cddc4b56a5422dc68c9313f4a1b6f132c	2026-06-14 15:04:58.564862
24	operation-function	8312e37c2bf9e76bbe841aa5fda889206d2bf8aa	2026-06-14 15:04:58.572137
25	custom-metadata	d974c6057c3db1c1f847afa0e291e6165693b990	2026-06-14 15:04:58.578662
26	objects-prefixes	215cabcb7f78121892a5a2037a09fedf9a1ae322	2026-06-14 15:04:58.586686
27	search-v2	859ba38092ac96eb3964d83bf53ccc0b141663a6	2026-06-14 15:04:58.592581
28	object-bucket-name-sorting	c73a2b5b5d4041e39705814fd3a1b95502d38ce4	2026-06-14 15:04:58.601129
29	create-prefixes	ad2c1207f76703d11a9f9007f821620017a66c21	2026-06-14 15:04:58.606149
30	update-object-levels	2be814ff05c8252fdfdc7cfb4b7f5c7e17f0bed6	2026-06-14 15:04:58.6125
31	objects-level-index	b40367c14c3440ec75f19bbce2d71e914ddd3da0	2026-06-14 15:04:58.617459
32	backward-compatible-index-on-objects	e0c37182b0f7aee3efd823298fb3c76f1042c0f7	2026-06-14 15:04:58.622357
33	backward-compatible-index-on-prefixes	b480e99ed951e0900f033ec4eb34b5bdcb4e3d49	2026-06-14 15:04:58.627157
34	optimize-search-function-v1	ca80a3dc7bfef894df17108785ce29a7fc8ee456	2026-06-14 15:04:58.632004
35	add-insert-trigger-prefixes	458fe0ffd07ec53f5e3ce9df51bfdf4861929ccc	2026-06-14 15:04:58.638615
36	optimise-existing-functions	6ae5fca6af5c55abe95369cd4f93985d1814ca8f	2026-06-14 15:04:58.643745
37	add-bucket-name-length-trigger	3944135b4e3e8b22d6d4cbb568fe3b0b51df15c1	2026-06-14 15:04:58.648569
38	iceberg-catalog-flag-on-buckets	02716b81ceec9705aed84aa1501657095b32e5c5	2026-06-14 15:04:58.6554
39	add-search-v2-sort-support	6706c5f2928846abee18461279799ad12b279b78	2026-06-14 15:04:58.670034
40	fix-prefix-race-conditions-optimized	7ad69982ae2d372b21f48fc4829ae9752c518f6b	2026-06-14 15:04:58.675027
41	add-object-level-update-trigger	07fcf1a22165849b7a029deed059ffcde08d1ae0	2026-06-14 15:04:58.680073
42	rollback-prefix-triggers	771479077764adc09e2ea2043eb627503c034cd4	2026-06-14 15:04:58.684911
43	fix-object-level	84b35d6caca9d937478ad8a797491f38b8c2979f	2026-06-14 15:04:58.690011
44	vector-bucket-type	99c20c0ffd52bb1ff1f32fb992f3b351e3ef8fb3	2026-06-14 15:04:58.694998
45	vector-buckets	049e27196d77a7cb76497a85afae669d8b230953	2026-06-14 15:04:58.700828
46	buckets-objects-grants	fedeb96d60fefd8e02ab3ded9fbde05632f84aed	2026-06-14 15:04:58.716192
47	iceberg-table-metadata	649df56855c24d8b36dd4cc1aeb8251aa9ad42c2	2026-06-14 15:04:58.722192
48	iceberg-catalog-ids	e0e8b460c609b9999ccd0df9ad14294613eed939	2026-06-14 15:04:58.727582
49	buckets-objects-grants-postgres	072b1195d0d5a2f888af6b2302a1938dd94b8b3d	2026-06-14 15:04:58.742851
50	search-v2-optimised	6323ac4f850aa14e7387eb32102869578b5bd478	2026-06-14 15:04:58.748683
51	index-backward-compatible-search	2ee395d433f76e38bcd3856debaf6e0e5b674011	2026-06-14 15:04:59.095835
52	drop-not-used-indexes-and-functions	5cc44c8696749ac11dd0dc37f2a3802075f3a171	2026-06-14 15:04:59.09753
53	drop-index-lower-name	d0cb18777d9e2a98ebe0bc5cc7a42e57ebe41854	2026-06-14 15:04:59.108294
54	drop-index-object-level	6289e048b1472da17c31a7eba1ded625a6457e67	2026-06-14 15:04:59.111213
55	prevent-direct-deletes	262a4798d5e0f2e7c8970232e03ce8be695d5819	2026-06-14 15:04:59.112736
56	fix-optimized-search-function	b823ed1e418101032fa01374edc9a436e54e3ed4	2026-06-14 15:04:59.11865
57	s3-multipart-uploads-metadata	f127886e00d1b374fadbc7c6b31e09336aad5287	2026-06-14 15:04:59.124819
58	operation-ergonomics	00ca5d483b3fe0d522133d9002ccc5df98365120	2026-06-14 15:04:59.130127
59	drop-unused-functions	38456f13e39691c2bbb4b5151d0d1cdbabd4a8c4	2026-06-14 15:04:59.135554
60	optimize-existing-functions-again	db35e1c91a9201e59f4fef8d972c2f277d68b157	2026-06-14 15:04:59.140992
2	storage-schema	5c7968fd083fcea04050c1b7f6253c9771b99011	2026-06-14 15:04:58.383207
6	change-column-name-in-get-size	f93f62afdf6613ee5e7e815b30d02dc990201044	2026-06-14 15:04:58.43097
9	fix-search-function	3a0af29f42e35a4d101c259ed955b67e1bee6825	2026-06-14 15:04:58.447632
10	search-files-search-function	68dc14822daad0ffac3746a502234f486182ef6e	2026-06-14 15:04:58.454255
\.


ALTER TABLE storage.migrations ENABLE TRIGGER ALL;

--
-- Name: building_requirements_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.building_requirements_id_seq', 20, true);


--
-- Name: building_types_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.building_types_id_seq', 21, true);


--
-- Name: daily_missions_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.daily_missions_id_seq', 21, true);


--
-- Name: defense_requirements_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.defense_requirements_id_seq', 45, true);


--
-- Name: defense_types_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.defense_types_id_seq', 15, true);


--
-- Name: game_settings_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.game_settings_id_seq', 185259, true);


--
-- Name: instant_unit_offers_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.instant_unit_offers_id_seq', 32, true);


--
-- Name: p2p_payment_methods_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.p2p_payment_methods_id_seq', 161, true);


--
-- Name: plus_plans_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.plus_plans_id_seq', 5, true);


--
-- Name: ship_blueprints_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.ship_blueprints_id_seq', 34, true);


--
-- Name: ship_requirements_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.ship_requirements_id_seq', 139, true);


--
-- Name: ship_types_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.ship_types_id_seq', 24, true);


--
-- Name: supply_boxes_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.supply_boxes_id_seq', 11, true);


--
-- Name: technology_requirements_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.technology_requirements_id_seq', 51, true);


--
-- Name: technology_types_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.technology_types_id_seq', 25, true);


--
-- PostgreSQL database dump complete
--


-- ===== Economia a 0 =====
UPDATE public.casino_dice_bank     SET balance=0, pool_pending=0, total_seeded=0, total_withdrawn=0, total_wagered=0, total_fees=0, total_paid=0, total_rolls=0, day_start=0, day_loss=0;
UPDATE public.casino_roulette_bank SET balance=0, pool_pending=0, total_seeded=0, total_withdrawn=0, total_wagered=0, total_fees=0, total_paid=0, total_spins=0;
UPDATE public.casino_slots_bank    SET balance=0, pool_pending=0, total_seeded=0, total_withdrawn=0, total_wagered=0, total_fees=0, total_paid=0, total_spins=0, day_start=0, day_loss=0;
UPDATE public.jackpot_pools SET expedition_balance=0, expedition_total=0, monthly_balance=0, monthly_total=0, plus_balance=0, plus_total=0, destruction_balance=0, destruction_total=0;
UPDATE public.hero_market_pool SET balance=0, total_contributed=0;
UPDATE public.alliance_war_reserve_pool SET amount_fxu=0;
