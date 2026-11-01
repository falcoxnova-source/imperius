CREATE OR REPLACE FUNCTION public.process_expedition(p_fleet_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
v_fleet record;
v_user_id uuid;
v_event_roll numeric;
v_result jsonb;
v_message_subject text;
v_message_body text;
v_metal_reward numeric := 0;
v_crystal_reward numeric := 0;
v_deuterium_reward numeric := 0;
v_metal_found numeric := 0;
v_crystal_found numeric := 0;
v_deuterium_found numeric := 0;
v_dark_matter_reward integer := 0;
v_fxu_reward numeric := 0;
v_ships_found jsonb := '[]'::jsonb;
v_ships_lost jsonb := '[]'::jsonb;
v_cargo_capacity numeric;
v_current_cargo numeric;
v_available_cargo numeric;
v_total_resources_found numeric;
v_ship_type record;
v_ship_quantity integer;
v_fleet_lost boolean := false;
v_partial_loss boolean := false;
v_loss_percent numeric := 0;
v_astrophysics_level integer := 0;
v_expedition_level integer := 0;
v_pool_result jsonb;
v_pool_won boolean := false;
v_pool_amount numeric := 0;
v_cargo_full boolean := false;
v_event_type text;
v_ships_before jsonb;
v_ships_lost_count integer := 0;
v_probe_type_id integer;
v_only_probes boolean := false;
v_total_ships integer := 0;
v_probe_count integer := 0;
BEGIN
SELECT * INTO v_fleet FROM fleets WHERE id = p_fleet_id;
IF NOT FOUND THEN
RETURN jsonb_build_object('success', false, 'reason', 'Flota no encontrada');
END IF;

v_user_id := v_fleet.user_id;

SELECT id INTO v_probe_type_id FROM ship_types WHERE code = 'espionage_probe';

SELECT
COALESCE(SUM(fs.quantity), 0),
COALESCE(SUM(CASE WHEN fs.ship_type_id = v_probe_type_id THEN fs.quantity ELSE 0 END), 0)
INTO v_total_ships, v_probe_count
FROM fleet_ships fs
WHERE fs.fleet_id = p_fleet_id;

IF v_total_ships > 0 AND v_probe_count = v_total_ships THEN
v_only_probes := true;
END IF;

IF v_only_probes THEN
v_event_type := 'probes_nothing';
v_message_subject := 'Expedicion - Sondas Sin Hallazgos';
v_message_body := 'Tus Sondas de Espionaje exploraron la region pero no estan equipadas para ' ||
'recolectar recursos ni detectar tesoros. Las sondas estan disenadas para ' ||
'espionaje, no para expediciones de exploracion. ' ||
'Considera enviar naves de combate o transporte en futuras expediciones.';

UPDATE fleets SET is_returning = true WHERE id = p_fleet_id;

INSERT INTO messages (sender_id, recipient_id, subject, body, message_type)
VALUES (NULL, v_user_id, v_message_subject, v_message_body, 'expedition');

RETURN jsonb_build_object(
'success', true,
'event_type', v_event_type,
'metal', 0,
'crystal', 0,
'deuterium', 0,
'dark_matter', 0,
'fxu_reward', 0,
'ships_found', '[]'::jsonb,
'ships_lost', '[]'::jsonb,
'fleet_lost', false,
'partial_loss', false,
'loss_percent', 0,
'pool_won', false,
'pool_amount', 0,
'cargo_was_full', false,
'only_probes', true
);
END IF;

SELECT COALESCE(ut.level, 0) INTO v_astrophysics_level
FROM user_technologies ut
JOIN technology_types tt ON ut.technology_type_id = tt.id
WHERE ut.user_id = v_user_id AND tt.code = 'astrophysics';

IF v_astrophysics_level IS NULL THEN
v_astrophysics_level := 0;
END IF;

-- Investigacion de Expedicion: reduce la probabilidad de eventos negativos (+2 al roll por nivel, tope +20)
SELECT COALESCE(ut.level, 0) INTO v_expedition_level
FROM user_technologies ut
JOIN technology_types tt ON ut.technology_type_id = tt.id
WHERE ut.user_id = v_user_id AND tt.code = 'expedition';

IF v_expedition_level IS NULL THEN
v_expedition_level := 0;
END IF;

SELECT COALESCE(SUM(fs.quantity * st.cargo_capacity), 0)
INTO v_cargo_capacity
FROM fleet_ships fs
JOIN ship_types st ON fs.ship_type_id = st.id
WHERE fs.fleet_id = p_fleet_id;

v_current_cargo := COALESCE(v_fleet.cargo_metal, 0) + COALESCE(v_fleet.cargo_crystal, 0) + COALESCE(v_fleet.cargo_deuterium, 0);
v_available_cargo := GREATEST(0, v_cargo_capacity - v_current_cargo);

SELECT jsonb_agg(jsonb_build_object('ship_type_id', fs.ship_type_id, 'name', st.name, 'quantity', fs.quantity))
INTO v_ships_before
FROM fleet_ships fs
JOIN ship_types st ON fs.ship_type_id = st.id
WHERE fs.fleet_id = p_fleet_id;

v_event_roll := random() * 100 + LEAST(v_expedition_level * 2, 20);

-- ====== EVENTOS NEGATIVOS: 13% total ======

IF v_event_roll < 2 THEN
-- AGUJERO NEGRO (2%) - Pierde toda la flota
v_fleet_lost := true;
v_event_type := 'black_hole';
v_message_subject := 'Expedicion PERDIDA - Agujero Negro';
v_message_body := 'DESASTRE! Tu flota de expedicion fue tragada por un agujero negro masivo. ' ||
'Las comunicaciones se cortaron abruptamente y no hubo senales de vida. ' ||
'Todas las naves y tripulacion se perdieron para siempre.';

v_ships_lost := v_ships_before;
DELETE FROM fleet_ships WHERE fleet_id = p_fleet_id;
UPDATE fleets SET is_completed = true WHERE id = p_fleet_id;

ELSIF v_event_roll < 7 THEN
-- PIRATAS (5%) - Pierde 40-70% naves
v_partial_loss := true;
v_loss_percent := 40 + (random() * 30);
v_event_type := 'pirates';
v_message_subject := 'Expedicion - Emboscada Pirata Severa';
v_message_body := 'Tu flota fue emboscada por una armada pirata bien organizada! ' ||
'Despues de una feroz batalla, lograron escapar pero con grandes perdidas. ' ||
'Aproximadamente ' || floor(v_loss_percent)::text || '% de tus naves fueron destruidas.';

FOR v_ship_type IN
SELECT fs.ship_type_id, fs.quantity, st.name
FROM fleet_ships fs
JOIN ship_types st ON fs.ship_type_id = st.id
WHERE fs.fleet_id = p_fleet_id
LOOP
v_ships_lost_count := floor(v_ship_type.quantity * v_loss_percent / 100);
IF v_ships_lost_count > 0 THEN
v_ships_lost := v_ships_lost || jsonb_build_object(
'ship_type_id', v_ship_type.ship_type_id,
'name', v_ship_type.name,
'quantity', v_ships_lost_count
);
END IF;
END LOOP;

UPDATE fleet_ships
SET quantity = GREATEST(1, floor(quantity * (100 - v_loss_percent) / 100))
WHERE fleet_id = p_fleet_id;

UPDATE fleets SET is_returning = true WHERE id = p_fleet_id;

ELSIF v_event_roll < 10 THEN
-- ANOMALIA GRAVITATORIA (3%) - Pierde 20-50% naves
v_partial_loss := true;
v_loss_percent := 20 + (random() * 30);
v_event_type := 'gravity_anomaly';
v_message_subject := 'Expedicion - Anomalia Gravitacional';
v_message_body := 'Tu flota se encontro con una anomalia gravitacional inesperada! ' ||
'Las fuerzas de marea extremas destrozaron varias naves antes de poder escapar. ' ||
'Perdiste aproximadamente ' || floor(v_loss_percent)::text || '% de tu flota.';

FOR v_ship_type IN
SELECT fs.ship_type_id, fs.quantity, st.name
FROM fleet_ships fs
JOIN ship_types st ON fs.ship_type_id = st.id
WHERE fs.fleet_id = p_fleet_id
LOOP
v_ships_lost_count := floor(v_ship_type.quantity * v_loss_percent / 100);
IF v_ships_lost_count > 0 THEN
v_ships_lost := v_ships_lost || jsonb_build_object(
'ship_type_id', v_ship_type.ship_type_id,
'name', v_ship_type.name,
'quantity', v_ships_lost_count
);
END IF;
END LOOP;

UPDATE fleet_ships
SET quantity = GREATEST(1, floor(quantity * (100 - v_loss_percent) / 100))
WHERE fleet_id = p_fleet_id;

UPDATE fleets SET is_returning = true WHERE id = p_fleet_id;

ELSIF v_event_roll < 13 THEN
-- TORMENTA IONICA (3%) - Pierde 20-40% naves
v_partial_loss := true;
v_loss_percent := 20 + (random() * 20);
v_event_type := 'ion_storm';
v_message_subject := 'Expedicion - Tormenta de Iones';
v_message_body := 'Una violenta tormenta de iones golpeo tu flota sin previo aviso! ' ||
'Los sistemas electronicos fallaron y varias naves colisionaron entre si. ' ||
'Perdidas estimadas: ' || floor(v_loss_percent)::text || '% de la flota.';

FOR v_ship_type IN
SELECT fs.ship_type_id, fs.quantity, st.name
FROM fleet_ships fs
JOIN ship_types st ON fs.ship_type_id = st.id
WHERE fs.fleet_id = p_fleet_id
LOOP
v_ships_lost_count := floor(v_ship_type.quantity * v_loss_percent / 100);
IF v_ships_lost_count > 0 THEN
v_ships_lost := v_ships_lost || jsonb_build_object(
'ship_type_id', v_ship_type.ship_type_id,
'name', v_ship_type.name,
'quantity', v_ships_lost_count
);
END IF;
END LOOP;

UPDATE fleet_ships
SET quantity = GREATEST(1, floor(quantity * (100 - v_loss_percent) / 100))
WHERE fleet_id = p_fleet_id;

UPDATE fleets SET is_returning = true WHERE id = p_fleet_id;

-- ====== EVENTO NEUTRAL: 17% ======

ELSIF v_event_roll < 30 THEN
-- NADA (17%) - Sin perdidas ni ganancias
v_event_type := 'nothing';
v_message_subject := 'Expedicion - Sin Hallazgos';
v_message_body := 'Tu flota exploro vastas regiones del espacio profundo durante dias, ' ||
'pero desafortunadamente no encontraron nada de valor. ' ||
'El universo a veces es un lugar vacio y desolado.';

UPDATE fleets SET is_returning = true WHERE id = p_fleet_id;

-- ====== EVENTOS POSITIVOS: 70% total ======

ELSIF v_event_roll < 42 THEN
-- MATERIA OSCURA RETIRADA DEL JUEGO (12%) - ya no otorga recompensa
v_event_type := 'dark_matter';
v_message_subject := 'Expedicion - Anomalia Energetica';
v_message_body := 'Tu flota detecto una anomalia energetica flotando en el vacio. ' ||
'Tras analizarla no encontraron nada aprovechable y regresaron con las bodegas vacias.';

UPDATE fleets SET is_returning = true WHERE id = p_fleet_id;

ELSIF v_event_roll < 58 THEN
-- RECURSOS (16%)
v_event_type := 'resources';
v_metal_found := (3000 + floor(random() * 12000) * (1 + v_astrophysics_level * 0.05));
v_crystal_found := (1800 + floor(random() * 9000) * (1 + v_astrophysics_level * 0.05));
v_deuterium_found := (600 + floor(random() * 6000) * (1 + v_astrophysics_level * 0.05));
v_total_resources_found := v_metal_found + v_crystal_found + v_deuterium_found;

IF v_total_resources_found > v_available_cargo AND v_total_resources_found > 0 THEN
v_cargo_full := true;
v_metal_reward := floor(v_available_cargo * (v_metal_found / v_total_resources_found));
v_crystal_reward := floor(v_available_cargo * (v_crystal_found / v_total_resources_found));
v_deuterium_reward := floor(v_available_cargo * (v_deuterium_found / v_total_resources_found));
ELSE
v_metal_reward := floor(v_metal_found);
v_crystal_reward := floor(v_crystal_found);
v_deuterium_reward := floor(v_deuterium_found);
END IF;

v_message_subject := 'Expedicion - Recursos Encontrados';
IF v_cargo_full THEN
v_message_body := 'Tu flota encontro recursos abandonados en una estacion derrelicta. ' ||
'Solo pudieron cargar lo que cabia: ' ||
floor(v_metal_reward)::text || ' Metal, ' ||
floor(v_crystal_reward)::text || ' Cristal, ' ||
floor(v_deuterium_reward)::text || ' Deuterio.';
ELSE
v_message_body := 'Tu flota descubrio recursos flotando en los restos de una batalla antigua: ' ||
floor(v_metal_reward)::text || ' Metal, ' ||
floor(v_crystal_reward)::text || ' Cristal, ' ||
floor(v_deuterium_reward)::text || ' Deuterio.';
END IF;

UPDATE fleets
SET
cargo_metal = cargo_metal + v_metal_reward,
cargo_crystal = cargo_crystal + v_crystal_reward,
cargo_deuterium = cargo_deuterium + v_deuterium_reward,
is_returning = true
WHERE id = p_fleet_id;

ELSIF v_event_roll < 68 THEN
-- NAVES ENCONTRADAS (10%) - SOLO naves que el usuario puede construir
v_event_type := 'ships';
SELECT * INTO v_ship_type
FROM ship_types st
WHERE st.code NOT IN ('deathstar', 'colony_ship', 'star_destroyer', 'black_moon', 'espionage_probe', 'solar_satellite', 'falco_x_clasica')
AND st.base_speed > 0
AND user_can_build_ship(v_user_id, st.id)
ORDER BY random()
LIMIT 1;

IF FOUND THEN
v_ship_quantity := 1 + floor(random() * LEAST(3, 1 + v_astrophysics_level / 3))::integer;
v_ships_found := jsonb_build_array(jsonb_build_object(
'ship_type_id', v_ship_type.id,
'name', v_ship_type.name,
'quantity', v_ship_quantity
));

INSERT INTO fleet_ships (fleet_id, ship_type_id, quantity)
VALUES (p_fleet_id, v_ship_type.id, v_ship_quantity)
ON CONFLICT (fleet_id, ship_type_id)
DO UPDATE SET quantity = fleet_ships.quantity + v_ship_quantity;

v_message_subject := 'Expedicion - Naves Abandonadas';
v_message_body := 'Tu flota encontro ' || v_ship_quantity::text || ' ' || v_ship_type.name ||
' a la deriva con sistemas de soporte vital minimos. ' ||
'Fueron reactivadas y se unieron a tu flota.';
ELSE
v_event_type := 'resources';
v_metal_found := 2000 + floor(random() * 5000);
v_crystal_found := 1000 + floor(random() * 3000);
v_total_resources_found := v_metal_found + v_crystal_found;

IF v_total_resources_found > v_available_cargo AND v_total_resources_found > 0 THEN
v_cargo_full := true;
v_metal_reward := floor(v_available_cargo * (v_metal_found / v_total_resources_found));
v_crystal_reward := floor(v_available_cargo * (v_crystal_found / v_total_resources_found));
ELSE
v_metal_reward := floor(v_metal_found);
v_crystal_reward := floor(v_crystal_found);
END IF;

v_message_subject := 'Expedicion - Restos Espaciales';
v_message_body := 'Tu flota encontro los restos de una nave danada, pero no tenian ' ||
'la tecnologia necesaria para repararla. Recuperaron ' ||
floor(v_metal_reward)::text || ' Metal y ' ||
floor(v_crystal_reward)::text || ' Cristal de los escombros.';

UPDATE fleets
SET
cargo_metal = cargo_metal + v_metal_reward,
cargo_crystal = cargo_crystal + v_crystal_reward
WHERE id = p_fleet_id;
END IF;

UPDATE fleets SET is_returning = true WHERE id = p_fleet_id;

ELSIF v_event_roll < 78 THEN
-- RECURSOS + MATERIA OSCURA (10%)
v_event_type := 'resources_and_dm';
v_metal_found := (2000 + floor(random() * 6000));
v_crystal_found := (1200 + floor(random() * 5000));
v_total_resources_found := v_metal_found + v_crystal_found;

IF v_total_resources_found > v_available_cargo AND v_total_resources_found > 0 THEN
v_cargo_full := true;
v_metal_reward := floor(v_available_cargo * (v_metal_found / v_total_resources_found));
v_crystal_reward := floor(v_available_cargo * (v_crystal_found / v_total_resources_found));
ELSE
v_metal_reward := floor(v_metal_found);
v_crystal_reward := floor(v_crystal_found);
END IF;

v_message_subject := 'Expedicion - Descubrimiento Mixto';
v_message_body := 'Tu flota descubrio un pequeno deposito de recursos: ' ||
floor(v_metal_reward)::text || ' Metal y ' ||
floor(v_crystal_reward)::text || ' Cristal.';

UPDATE fleets
SET
cargo_metal = cargo_metal + v_metal_reward,
cargo_crystal = cargo_crystal + v_crystal_reward,
is_returning = true
WHERE id = p_fleet_id;

ELSIF v_event_roll < 86 THEN
-- ARTEFACTO ANTIGUO (8%)
v_event_type := 'artifact';
v_message_subject := 'Expedicion - Artefacto Antiguo';
v_message_body := 'Tu flota descubrio los restos de una civilizacion antigua! ' ||
'Entre los escombros solo encontraron reliquias sin valor practico.';

UPDATE fleets SET is_returning = true WHERE id = p_fleet_id;

ELSIF v_event_roll < 94 THEN
-- HALLAZGO DE TOKENS (8%) - los tokens se EXTRAEN del Pool de Expediciones (no se mintean)
v_event_type := 'token_discovery';

v_pool_result := attempt_expedition_pool_win(v_user_id, true);
v_pool_won := COALESCE((v_pool_result->>'won')::boolean, false);
v_pool_amount := COALESCE((v_pool_result->>'amount')::numeric, 0); IF v_pool_won AND v_pool_amount > 0 THEN PERFORM _internal_set_fxu_context(); UPDATE profiles SET fxu_balance = fxu_balance - v_pool_amount WHERE id = v_user_id; UPDATE fleets SET pending_fxu = COALESCE(pending_fxu,0) + v_pool_amount WHERE id = p_fleet_id; END IF;
v_fxu_reward := v_pool_amount;

IF v_pool_won AND v_pool_amount > 0 THEN
v_message_subject := 'Expedicion - Hallazgo de Tokens TUNG!';
v_message_body := 'Tu flota descubrio una capsula de almacenamiento digital a la deriva en el espacio! ' ||
'Al descifrar su contenido, encontraron ' || floor(v_fxu_reward)::text || ' Tokens TUNG ' ||
'provenientes del Pool de Expediciones. ' ||
'Los tokens han sido transferidos a tu cuenta.';
ELSE
-- El pool esta vacio o es demasiado pequeno: no hay tokens que recoger
v_event_type := 'nothing';
v_fxu_reward := 0;
v_message_subject := 'Expedicion - Sin novedades';
v_message_body := 'Tu flota encontro una capsula digital a la deriva, pero estaba vacia. Regresan sin novedades.';
END IF;

UPDATE fleets SET is_returning = true WHERE id = p_fleet_id;

ELSE
-- TESORO LEGENDARIO (6%)
v_event_type := 'legendary_treasure';

v_pool_result := attempt_expedition_pool_win(v_user_id, true);
v_pool_won := COALESCE((v_pool_result->>'won')::boolean, false);
v_pool_amount := COALESCE((v_pool_result->>'amount')::numeric, 0); IF v_pool_won AND v_pool_amount > 0 THEN PERFORM _internal_set_fxu_context(); UPDATE profiles SET fxu_balance = fxu_balance - v_pool_amount WHERE id = v_user_id; UPDATE fleets SET pending_fxu = COALESCE(pending_fxu,0) + v_pool_amount WHERE id = p_fleet_id; END IF;

v_message_subject := 'Expedicion - TESORO LEGENDARIO!';
v_message_body := 'INCREIBLE! Tu flota descubrio las coordenadas de un tesoro legendario perdido hace eones!';

IF v_pool_won AND v_pool_amount > 0 THEN
v_message_body := v_message_body || E'\n\n*** JACKPOT DEL POOL DE EXPEDICIONES! ***\n' ||
'El tesoro legendario contenia ' || floor(v_pool_amount)::text || ' TUNG!';
END IF;

UPDATE fleets SET is_returning = true WHERE id = p_fleet_id;
END IF;

IF NOT v_fleet_lost AND NOT v_partial_loss AND v_event_type NOT IN ('nothing', 'legendary_treasure', 'token_discovery') THEN
v_pool_result := attempt_expedition_pool_win(v_user_id, false);
v_pool_won := COALESCE((v_pool_result->>'won')::boolean, false);
v_pool_amount := COALESCE((v_pool_result->>'amount')::numeric, 0); IF v_pool_won AND v_pool_amount > 0 THEN PERFORM _internal_set_fxu_context(); UPDATE profiles SET fxu_balance = fxu_balance - v_pool_amount WHERE id = v_user_id; UPDATE fleets SET pending_fxu = COALESCE(pending_fxu,0) + v_pool_amount WHERE id = p_fleet_id; END IF;

IF v_pool_won AND v_pool_amount > 0 THEN
v_message_body := v_message_body || E'\n\n*** BONUS! Tu expedicion encontro parte del Pool de Expediciones! ***\n' ||
'Ganaste ' || floor(v_pool_amount)::text || ' TUNG adicionales!';
END IF;
END IF;

INSERT INTO messages (sender_id, recipient_id, subject, body, message_type)
VALUES (NULL, v_user_id, v_message_subject, v_message_body, 'expedition');

RETURN jsonb_build_object(
'success', true,
'event_type', v_event_type,
'metal', v_metal_reward,
'crystal', v_crystal_reward,
'deuterium', v_deuterium_reward,
'dark_matter', v_dark_matter_reward,
'fxu_reward', v_fxu_reward,
'ships_found', v_ships_found,
'ships_lost', v_ships_lost,
'fleet_lost', v_fleet_lost,
'partial_loss', v_partial_loss,
'loss_percent', v_loss_percent,
'pool_won', v_pool_won,
'pool_amount', v_pool_amount,
'cargo_was_full', v_cargo_full
);
END;
$function$

