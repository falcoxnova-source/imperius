#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
XNova AI Assistant Service (NOVA)
=================================
Sirve el endpoint /functions/v1/ai-assistant que consume el chat del juego.

Por que existe: el proyecto tiene una Edge Function en
supabase/functions/ai-assistant/index.ts, pero este servidor NO ejecuta el
runtime de Edge Functions (no hay contenedor deno). Nginx devolvia una
respuesta vacia para esa ruta, asi que el bot del juego SIEMPRE fallaba.
Este servicio replica esa funcionalidad en Python, igual que ya se hace con
deposit_service.py (9001) y email_service.py (9002).

Diseno:
- El conocimiento numerico del juego (edificios, naves, defensas,
  tecnologias, oficiales, ajustes, fortalezas, planetas del tesoro) se lee
  EN VIVO de la base de datos, con cache de 5 minutos. Asi el bot nunca
  responde con datos desactualizados.
- El contexto del jugador (planetas, recursos, flotas, alianza, saldo...) se
  lee en cada peticion.
- La respuesta final la genera DeepSeek con un prompt en espanol que le
  prohibe inventar cifras.
"""

import base64
import hashlib
import hmac
import json
import os
import re
import subprocess
import sys
import threading
import time
from datetime import datetime, timezone
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler
from urllib import request as urlrequest
from urllib import error as urlerror


# ---------------------------------------------------------------- config ---
def load_env(env_file="/root/xnova/.env"):
    if os.path.exists(env_file):
        with open(env_file, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith("#") and "=" in line:
                    key, _, value = line.partition("=")
                    key = key.strip()
                    value = value.strip().strip('"').strip("'")
                    if key and value and key not in os.environ:
                        os.environ[key] = value


load_env()

PORT = int(os.environ.get("AI_SERVICE_PORT", "9003"))
DB_CONTAINER = os.environ.get("DB_CONTAINER", "xnova-database")
DB_NAME = os.environ.get("DB_NAME", "postgres")
DB_USER = os.environ.get("DB_USER", "postgres")
JWT_SECRET = os.environ.get("SUPABASE_JWT_SECRET", "")
DEEPSEEK_API_KEY = os.environ.get("DEEPSEEK_API_KEY", "")
DEEPSEEK_API_URL = os.environ.get(
    "DEEPSEEK_API_URL", "https://api.deepseek.com/v1/chat/completions"
)
DEEPSEEK_MODEL = os.environ.get("DEEPSEEK_MODEL", "deepseek-chat")
DEEPSEEK_TIMEOUT = int(os.environ.get("DEEPSEEK_TIMEOUT", "60"))
GAME_CACHE_TTL = int(os.environ.get("AI_GAME_CACHE_TTL", "300"))

UUID_RE = re.compile(r"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-"
                     r"[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$")


def log(msg):
    print("[%s] %s" % (datetime.now(timezone.utc).isoformat(), msg), flush=True)


# ------------------------------------------------------------------- db ---
def db_json(sql, timeout=45):
    """Ejecuta SQL por stdin (sin shell, sin problemas de comillas) y
    devuelve el JSON de la primera columna de la primera fila."""
    cmd = [
        "docker", "exec", "-i", DB_CONTAINER,
        "psql", "-U", DB_USER, "-d", DB_NAME,
        "-t", "-A", "-X", "-q", "-v", "ON_ERROR_STOP=1", "-f", "-",
    ]
    try:
        res = subprocess.run(
            cmd, input=sql, capture_output=True, text=True,
            timeout=timeout, encoding="utf-8", errors="replace",
        )
    except subprocess.TimeoutExpired:
        log("DB timeout")
        return None
    if res.returncode != 0:
        log("DB error: %s" % (res.stderr or "").strip()[:500])
        return None
    out = (res.stdout or "").strip()
    if not out:
        return None
    try:
        return json.loads(out)
    except Exception as exc:
        log("DB json parse error: %s :: %s" % (exc, out[:300]))
        return None


GAME_DATA_SQL = r"""
SELECT json_build_object(
  'edificios', (SELECT json_agg(json_build_object(
        'code', code, 'nombre', name, 'categoria', category,
        'metal_base', base_metal, 'cristal_base', base_crystal,
        'deuterio_base', base_deuterium, 'energia_base', base_energy,
        'factor_coste', cost_factor, 'nivel_max', max_level
      ) ORDER BY code) FROM building_types),
  'naves', (SELECT json_agg(json_build_object(
        'code', code, 'nombre', name, 'categoria', category,
        'metal', metal_cost, 'cristal', crystal_cost, 'deuterio', deuterium_cost,
        'ataque', weapon_power, 'escudo', shield_power, 'estructura', structural_integrity,
        'carga', cargo_capacity, 'velocidad', base_speed, 'consumo', fuel_consumption
      ) ORDER BY code) FROM ship_types),
  'defensas', (SELECT json_agg(json_build_object(
        'code', code, 'nombre', name,
        'metal', metal_cost, 'cristal', crystal_cost, 'deuterio', deuterium_cost,
        'ataque', weapon_power, 'escudo', shield_power, 'estructura', structural_integrity
      ) ORDER BY code) FROM defense_types),
  'tecnologias', (SELECT json_agg(json_build_object(
        'code', code, 'nombre', name, 'categoria', category,
        'metal_base', base_metal, 'cristal_base', base_crystal,
        'deuterio_base', base_deuterium, 'factor_coste', cost_factor
      ) ORDER BY code) FROM technology_types),
  'oficiales', (SELECT json_agg(json_build_object(
        'code', code, 'nombre', name, 'descripcion', description,
        'bonus', bonus_type, 'valor', bonus_value,
        'bonus2', bonus_secondary_type, 'valor2', bonus_secondary_value,
        'usdt_7d', usdt_cost_7d, 'usdt_30d', usdt_cost_30d, 'usdt_90d', usdt_cost_90d
      ) ORDER BY sort_order) FROM officer_types),
  'ajustes', (SELECT json_object_agg(key, value) FROM game_settings),
  'planes_plus_vip', (SELECT json_agg(json_build_object(
        'code', code, 'nombre', name, 'dias', duration_days, 'meses', duration_months,
        'precio_fxu', price_fxu, 'precio_usdt', price_usdt,
        'comision_compartida_pct', commission_share_percent
      ) ORDER BY duration_days) FROM plus_plans WHERE is_active = true),
  'fortalezas', (SELECT json_agg(json_build_object(
        'galaxia', f.galaxy, 'coordenadas', f.galaxy || ':' || f.system || ':' || f.position,
        'alianza', a.name, 'tag', a.tag, 'capturada', f.captured_at
      ) ORDER BY f.galaxy)
      FROM alliance_fortresses f LEFT JOIN alliances a ON a.id = f.owner_alliance_id),
  'planetas_tesoro', (SELECT json_agg(json_build_object(
        'galaxia', t.galaxy, 'coordenadas', t.galaxy || ':' || t.system || ':' || t.position,
        'alianza', a.name, 'tag', a.tag, 'capturada', t.captured_at
      ) ORDER BY t.galaxy)
      FROM treasure_planets t LEFT JOIN alliances a ON a.id = t.owner_alliance_id),
  'loteria', (SELECT json_build_object(
        'sorteo_abierto', d.draw_number, 'cierra', d.closes_at,
        'boletos_vendidos', d.total_tickets, 'pool_premios', d.prize_pool,
        'bote_acumulado', d.accumulated_jackpot,
        'precio_boleto_usd', (SELECT value FROM game_settings WHERE key = 'lottery_ticket_cost_usd'),
        'premio_3_aciertos_usd', (SELECT value FROM game_settings WHERE key = 'lottery_3match_prize_usd'),
        'premio_2_aciertos_usd', (SELECT value FROM game_settings WHERE key = 'lottery_2match_prize_usd'),
        'max_boletos', (SELECT value FROM game_settings WHERE key = 'lottery_max_tickets'),
        'ultimo_sorteo', (SELECT json_build_object('numero', l.draw_number,
              'numeros_ganadores', l.winning_numbers, 'fecha', l.drawn_at)
            FROM lottery_draws l WHERE l.status = 'completed'
            ORDER BY l.drawn_at DESC NULLS LAST LIMIT 1))
      FROM lottery_draws d WHERE d.status = 'open' ORDER BY d.closes_at LIMIT 1),
  'rifa_activa', (SELECT json_build_object(
        'titulo', r.title, 'descripcion', left(r.description, 600),
        'precio_ticket_tung', r.ticket_price, 'cierra', r.closes_at,
        'tickets_vendidos', r.total_tickets,
        'max_tickets_total', NULLIF(r.max_tickets_total, 0),
        'max_tickets_por_jugador', NULLIF(r.max_tickets_per_user, 0),
        'premios', (SELECT json_agg(json_build_object('puesto', rp.position,
              'premio', COALESCE(rp.label, rp.prize_type), 'cantidad', rp.quantity)
              ORDER BY rp.position) FROM raffle_prizes rp WHERE rp.raffle_id = r.id))
      FROM raffles r WHERE r.status NOT IN ('drawn', 'cancelled', 'closed') AND r.drawn_at IS NULL AND r.closes_at > now()
      ORDER BY r.closes_at LIMIT 1),
  'casino', json_build_object(
        'ruleta_abierta', (SELECT enabled FROM casino_roulette_bank WHERE id = 1),
        'ruleta_premio_max_tirada_tung', (SELECT floor(balance * 0.10) FROM casino_roulette_bank WHERE id = 1),
        'slots_abierta', (SELECT enabled FROM casino_slots_bank WHERE id = 1),
        'slots_premio_max_tirada_tung', (SELECT floor(balance * 0.10) FROM casino_slots_bank WHERE id = 1),
        'dados_abierto', (SELECT enabled FROM casino_dice_bank WHERE id = 1),
        'dados_premio_max_tirada_tung', (SELECT floor(balance * 0.10) FROM casino_dice_bank WHERE id = 1)),
  'batalla_naves', (SELECT json_build_object('activa', c.enabled,
        'apuesta_min_usd', c.min_stake, 'apuesta_max_usd', c.max_stake,
        'pool_diario_top5_tung', round(c.daily_pool, 2))
      FROM battleship_config c WHERE c.id = 1),
  'apuestas_deportivas', (SELECT json_build_object('activa', c.enabled,
        'ligas', c.competitions, 'apuesta_min_tung', c.min_bet,
        'apuesta_max_tung', c.max_bet, 'max_por_partido_tung', c.max_per_match,
        'cierre_minutos_antes', c.close_minutes)
      FROM sports_config c WHERE c.id = 1),
  'precio_tung_usd', (SELECT get_live_tung_price_usd()),
  'servidor', json_build_object(
        'jugadores', (SELECT count(*) FROM profiles WHERE COALESCE(is_bot,false) = false),
        'alianzas', (SELECT count(*) FROM alliances),
        'planetas', (SELECT count(*) FROM planets)
  )
)::text;
"""

USER_CTX_SQL = r"""
SELECT json_build_object(
  'perfil', (SELECT json_build_object(
        'usuario', p.username, 'puntos', p.points_total, 'ranking', p.rank_position,
        'puntos_edificios', p.points_buildings, 'puntos_investigacion', p.points_research,
        'puntos_flota', p.points_fleet, 'puntos_defensa', p.points_defense,
        'fxu', p.fxu_balance, 'usdt', p.usdt_balance, 'tung', p.tung_balance,
        'modo_vacaciones', p.vacation_mode, 'racha_diaria', p.daily_streak,
        'codigo_referido', p.referral_code, 'registrado', p.created_at,
        'batallas_ganadas', p.battles_won, 'batallas_perdidas', p.battles_lost
      ) FROM profiles p WHERE p.id = '__UID__'),
  'alianza', (SELECT json_build_object('nombre', a.name, 'tag', a.tag,
        'rango', am.rank_name, 'nivel_rango', am.rank_level,
        'miembros', a.member_count, 'puntos', a.points_total, 'ranking', a.rank_position)
      FROM alliance_members am JOIN alliances a ON a.id = am.alliance_id
      WHERE am.user_id = '__UID__' LIMIT 1),
  'referidos', (SELECT count(*) FROM profiles WHERE referred_by = '__UID__'),
  'vip_plus', (SELECT json_build_object('plan', pl.name, 'expira', s.expires_at)
      FROM plus_subscriptions s LEFT JOIN plus_plans pl ON pl.id = s.plan_id
      WHERE s.user_id = '__UID__' AND s.is_active = true AND s.expires_at > now()
      ORDER BY s.expires_at DESC LIMIT 1),
  'oficiales_activos', (SELECT json_agg(json_build_object('nombre', ot.name, 'expira', uo.expires_at))
      FROM user_officers uo JOIN officer_types ot ON ot.id = uo.officer_type_id
      WHERE uo.user_id = '__UID__' AND uo.expires_at > now()),
  'tecnologias', (SELECT json_agg(json_build_object('nombre', tt.name, 'code', tt.code, 'nivel', ut.level) ORDER BY tt.code)
      FROM user_technologies ut JOIN technology_types tt ON tt.id = ut.technology_type_id
      WHERE ut.user_id = '__UID__' AND ut.level > 0),
  'planetas', (SELECT json_agg(json_build_object(
        'nombre', p.name,
        'coordenadas', p.galaxy || ':' || p.solar_system || ':' || p.position,
        'tipo', p.planet_type,
        'campos', p.fields_used || '/' || p.fields_max,
        'recursos', calculate_planet_resources(p.id),
        'edificios', (SELECT json_agg(json_build_object('nombre', bt.name, 'code', bt.code, 'nivel', pb.level) ORDER BY bt.code)
            FROM planet_buildings pb JOIN building_types bt ON bt.id = pb.building_type_id
            WHERE pb.planet_id = p.id AND pb.level > 0),
        'naves', (SELECT json_agg(json_build_object('nombre', st.name, 'cantidad', ps.quantity) ORDER BY st.code)
            FROM planet_ships ps JOIN ship_types st ON st.id = ps.ship_type_id
            WHERE ps.planet_id = p.id AND ps.quantity > 0),
        'defensas', (SELECT json_agg(json_build_object('nombre', dt.name, 'cantidad', pd.quantity) ORDER BY dt.code)
            FROM planet_defenses pd JOIN defense_types dt ON dt.id = pd.defense_type_id
            WHERE pd.planet_id = p.id AND pd.quantity > 0)
      ) ORDER BY p.galaxy, p.solar_system, p.position)
      FROM planets p WHERE p.user_id = '__UID__'),
  'flotas_en_vuelo', (SELECT json_agg(json_build_object(
        'mision', f.mission_type,
        'destino', f.target_galaxy || ':' || f.target_system || ':' || f.target_position,
        'llegada', f.arrival_time, 'regresando', f.is_returning))
      FROM fleets f WHERE f.user_id = '__UID__' AND COALESCE(f.is_completed, false) = false)
)::text;
"""


_game_cache = {"data": None, "ts": 0.0}
_game_lock = threading.Lock()


def get_game_data(force=False):
    with _game_lock:
        now = time.time()
        if not force and _game_cache["data"] and (now - _game_cache["ts"]) < GAME_CACHE_TTL:
            return _game_cache["data"]
        data = db_json(GAME_DATA_SQL)
        if data:
            _game_cache["data"] = data
            _game_cache["ts"] = now
        return _game_cache["data"]


def get_user_context(user_id):
    if not UUID_RE.match(user_id or ""):
        return None
    return db_json(USER_CTX_SQL.replace("__UID__", user_id))


# ------------------------------------------------------------------ jwt ---
def _b64url_decode(seg):
    seg += "=" * (-len(seg) % 4)
    return base64.urlsafe_b64decode(seg.encode())


def verify_jwt(token):
    """Devuelve el user_id (claim sub) si la firma HS256 y el exp son validos."""
    if not JWT_SECRET or not token:
        return None
    parts = token.split(".")
    if len(parts) != 3:
        return None
    try:
        signing_input = ("%s.%s" % (parts[0], parts[1])).encode()
        expected = hmac.new(JWT_SECRET.encode(), signing_input, hashlib.sha256).digest()
        if not hmac.compare_digest(_b64url_decode(parts[2]), expected):
            return None
        payload = json.loads(_b64url_decode(parts[1]))
    except Exception:
        return None
    exp = payload.get("exp")
    if isinstance(exp, (int, float)) and exp < time.time():
        return None
    sub = payload.get("sub")
    return sub if UUID_RE.match(sub or "") else None


# --------------------------------------------------------------- prompt ---
GAME_KNOWLEDGE = u"""
=========================  MANUAL DE XNOVA  =========================
(Este manual describe las MECANICAS. Todas las cifras de costes y
estadisticas concretas estan en el bloque DATOS EN VIVO mas abajo.)

## RECURSOS
- Metal, Cristal y Deuterio: se producen en las minas de cada planeta.
- Energia: la producen la Planta de Energia Solar y el Satelite Solar.
  Si la energia disponible es menor que la consumida, las minas producen
  proporcionalmente menos. Nunca dejes la energia en negativo.
- La produccion depende del nivel de la mina, de la temperatura del planeta
  (el Deuterio rinde mas en planetas frios) y del porcentaje de produccion
  que configures en cada mina.
- Los almacenes (Almacen de Metal / Cristal / Deposito de Deuterio) limitan
  cuanto puedes acumular. Si se llenan, la produccion se pierde.

## MONEDAS Y ECONOMIA REAL
- FXU: moneda interna del juego.
- TUNG: token del ecosistema (BEP-20, red BSC). Se deposita y se retira
  desde la seccion Wallet / Cartera.
- USDT: se usa para comprar VIP/Plus, oficiales y otros servicios.
- Cada usuario tiene una direccion de deposito propia. Los depositos se
  acreditan automaticamente tras las confirmaciones de la red.
- Los retiros tienen comision (ver ajustes en vivo: withdrawal_fee_*).
- NOTA IMPORTANTE: la Materia Oscura fue RETIRADA del juego. Ya no se
  obtiene en expediciones, ya no se vende en el mercado y ya no se usa
  para comprar oficiales (los oficiales se pagan en USDT/FXU). Si un
  jugador pregunta por materia oscura, explicale que ya no existe.

## EDIFICIOS
- Se construyen en cada planeta y consumen campos. Los campos maximos se
  amplian con el Terraformer.
- El coste sube exponencialmente: coste_nivel_N = coste_base * factor^(N-1).
- La Fabrica de Robots y la Nanofabrica reducen el tiempo de construccion.

## INVESTIGACIONES
- Se investigan en el Laboratorio de Investigacion y son GLOBALES (valen
  para toda la cuenta, no por planeta).
- Tecnologias de combate: Armas (+10% ataque por nivel), Escudo (+10%
  escudo por nivel) y Blindaje (+10% estructura por nivel).
- Tecnologias de propulsion (Combustion, Impulso, Propulsion Hiperespacial)
  aumentan la velocidad de los distintos grupos de naves.
- Tecnologia de Graviton: requiere ENERGIA disponible en el planeta, no
  solo recursos.
- Tecnologia de Espionaje: cuanto mas alta frente a la del rival, mas
  informacion revelan tus sondas.

## FLOTAS Y MISIONES
Misiones disponibles: Atacar, Transportar, Desplegar (estacionar),
Espiar, Colonizar, Reciclar (escombros), Expedicion y Destruir (luna).
- El tiempo de vuelo depende de la distancia, la velocidad de la nave mas
  lenta de la flota y el porcentaje de velocidad elegido.
- El deuterio consumido depende de la distancia, la velocidad y el
  consumo de cada nave.
- Fleetsave: enviar la flota fuera del planeta (por ejemplo transporte a
  otro planeta propio o despliegue) para que no la destruyan mientras no
  estas conectado.

## COMBATE
- Se resuelve por rondas. Cada unidad dispara segun su Ataque; el daño se
  absorbe con el Escudo y despues resta Estructura.
- El fuego rapido permite a ciertas naves disparar varias veces seguidas
  contra tipos concretos de unidad.
- Las tecnologias de Armas, Escudo y Blindaje del ATACANTE y del DEFENSOR
  se aplican a sus propias unidades.
- Los restos de las naves destruidas generan un campo de escombros que se
  recoge con Recicladores.
- Parte de las defensas destruidas se reconstruye sola tras la batalla.
- Existe un Simulador de Combate en el juego para probar batallas sin
  arriesgar naves. Recomiendalo siempre antes de un ataque grande.

## LUNAS
- Se forman con probabilidad a partir de un campo de escombros grande
  generado en un ataque.
- En la luna se pueden construir la Base Lunar, el Sensor Phalanx (permite
  ver flotas enemigas) y la Puerta de Salto (viaje instantaneo entre lunas).
- Una luna puede ser destruida con Estrellas de la Muerte (mision Destruir).

## ALIANZAS
- Un jugador solo puede pertenecer a una alianza.
- Roles con permisos configurables por el lider.
- La alianza tiene chat, foro interno y circulares.
- El lider puede configurar el reparto de los pools entre los rangos.

## FORTALEZAS DE ALIANZA  (contenido de alianza)
- Hay UNA fortaleza por galaxia, siempre en las coordenadas
  GALAXIA:250:8 (sistema 250, posicion 8).
- Para atacarla o capturarla se usa la pagina de FLOTAS normal: eliges tus
  naves y las envias a esas coordenadas con la mision ATACAR. Se aplican
  las mismas reglas de distancia, velocidad y deuterio que en cualquier
  ataque normal.
- SOLO puede capturarla un jugador que PERTENEZCA A UNA ALIANZA. Si no
  estas en ninguna alianza puedes atacar, pero no reclamarla.
- Si la fortaleza no tiene dueño, el atacante (con alianza) la captura
  directamente y sus naves quedan estacionadas alli defendiendola.
- Si ya tiene dueño, hay combate contra las naves desplegadas por la
  alianza propietaria. Si gana el atacante, su alianza toma el control.
- Refuerzos: si tu alianza ya controla la fortaleza puedes enviar naves
  desde tus propios planetas ("Enviar Refuerzos"). Esas naves salen de tu
  planeta y quedan registradas como tuyas dentro de la fortaleza.
- Puedes retirar tus propias naves con "Recoger Todo".
- Recompensas: existe un Pool de Fortaleza que se reparte MENSUALMENTE
  entre los miembros de las alianzas que controlan fortalezas, segun los
  pesos por rango que configure el lider (con un minimo garantizado por
  miembro).
- La pagina muestra: naves totales defendiendo, poder de combate total,
  alianza propietaria, horas en control y la lista de contribuyentes.

## PLANETA DEL TESORO  (contenido de alianza, sistema independiente)
- Hay UNO por galaxia, siempre en las coordenadas GALAXIA:250:9
  (sistema 250, posicion 9). Es un sistema SEPARADO del de fortalezas.
- Funciona igual que la fortaleza: se ataca/captura con la mision ATACAR
  desde la pagina de Flotas, hace falta estar en una alianza para
  reclamarlo, se pueden enviar refuerzos y recoger las naves propias.
- Tiene su propio Pool del Planeta del Tesoro, que tambien se reparte
  mensualmente entre los miembros de las alianzas propietarias.

## MERCADO
- Mercado entre jugadores para recursos, naves y planos (blueprints).
- Se pueden crear ofertas de venta y ofertas de compra.
- Cada operacion paga una comision (ver market_fee_percent en los ajustes
  en vivo) que se reparte entre administracion, pool de premios y
  referidos.

## P2P
- Intercambio directo entre jugadores con chat de la orden y comision
  propia (p2p_fee_percent).

## VIP / PLUS
- Suscripcion de pago que da bonificaciones (por ejemplo bonus de
  produccion y multiplicador de velocidad; los valores exactos estan en
  los ajustes en vivo: vip_production_bonus_percent,
  vip_time_speed_multiplier, alliance_max_members_vip).
- Comprueba siempre los ajustes en vivo antes de dar una cifra.

## OFICIALES
- Se contratan por 7, 30 o 90 dias y dan bonificaciones permanentes
  mientras estan activos. Los nombres, bonus y precios exactos estan en el
  bloque de datos en vivo.

## REFERIDOS
- Cada jugador tiene un codigo de referido. Los referidos generan
  comisiones al que invita (parte de las comisiones de mercado, P2P y
  retiros).

## POOLS Y PREMIOS
- Parte de las comisiones del juego alimenta pools que se reparten:
  ranking mensual, pool de fortalezas, pool de planeta del tesoro,
  jackpot y loteria.

## OTRAS FUNCIONES
- Modo Vacaciones: protege la cuenta mientras estas ausente; no puedes
  atacar ni ser atacado y la produccion se detiene.
- Proteccion de novatos: los jugadores con muchos menos puntos no pueden
  ser atacados por jugadores muy grandes (y viceversa).
- Racha diaria: recompensa por conectarse dias seguidos.
- Misiones y misiones premium: tareas que dan recompensas.
- Cajas de suministros, loteria, rankings (general, edificios,
  investigacion, flota, defensa, expedicion, social y destruccion),
  Salon de la Fama y titulos/insignias cosmeticas.
- Autopiloto: automatiza acciones basicas de la cuenta.
- Chat publico global y mensajeria interna.

#####################  ZONA DE JUEGOS (GALAXIA 3, SISTEMA 250)  #####################
En la vista de Galaxia, al ir a 3:250 aparecen en la cabecera accesos
directos (Fortalezas, Tesoro, Batalla de Naves). Todos estos juegos usan
el saldo TUNG del jugador dentro del juego (no hace falta mover nada de la
wallet). Reglas comunes de los juegos de casino:
- La comision de la casa es el 20% de cada apuesta: el premio se calcula
  sobre el 80% restante. Formula: premio = apuesta x 0,8 x multiplicador.
  Ejemplo: 10 TUNG al rojo (x2) -> si gana cobras 10 x 0,8 x 2 = 16 TUNG.
- Cada juego tiene su propio BANCO. El premio maximo posible de una tirada
  no puede superar el 10% del banco; si tu apuesta podria pagar mas, el
  juego la rechaza y te dice el limite (baja la apuesta).
- Los numeros aleatorios se generan en el servidor de forma segura; el
  cliente no decide nada. Hay una pausa anti-spam de 2 s entre tiradas.
- Cada juego tiene ranking de ganadores (Hoy / Semana / Total) y botón
  para silenciar el sonido.
- Parte de la comision va a los pools de premios del juego y a los
  referidos del jugador.

## CASINO GALACTICO  (planeta 3:250:10, pagina /game/casino)
- Es el centro de juegos: desde ahi se entra a Ruleta, Tragamonedas,
  Dados, Loteria y Rifa. NO hace falta tener la Nave Insignia ni ninguna
  nave estacionada: esta abierto a todos los jugadores.
- Se llega desde la vista de Galaxia (3:250, posicion 10) o directamente
  desde el menu / pagina del Casino.

### RULETA  (/game/roulette)
- Ruleta europea: numeros del 0 al 36 (37 casillas), un solo cero verde.
  Rojos: 1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36.
- Como jugar: 1) elige ficha (1, 5, 10, 50 o 100 TUNG); 2) pulsa sobre la
  mesa donde quieres apostar (puedes poner varias fichas, hasta 40
  apuestas por tirada); 3) pulsa GIRAR; 4) la bola cae y se pagan las
  apuestas ganadoras al instante.
- Apuesta minima: 1 TUNG (enteros).
- Tipos de apuesta y multiplicador (sobre el 80%):
  * Pleno (un numero 0-36): x36  -> 10 TUNG pagan 288.
  * Docena (1-12, 13-24, 25-36): x3 -> 10 TUNG pagan 24.
  * Rojo / Negro: x2 -> 10 TUNG pagan 16.
  * Par / Impar: x2 -> 10 TUNG pagan 16.
  * El 0 hace perder rojo/negro, par/impar y docenas.

### TRAGAMONEDAS  (/game/slots)
- Maquina clasica de 3 rodillos y una sola linea. Simbolos: Cohete,
  Planeta, Estrella, Gema, Luna y hueco vacio.
- Como jugar: elige la apuesta (1, 5, 10, 50, 100 o cantidad entera desde
  1 TUNG), tira de la palanca / pulsa GIRAR y espera a que paren los 3
  rodillos. Pausa de 2 s entre tiradas.
- Tabla de premios (multiplicador sobre el 80% de la apuesta; se paga solo
  la mejor combinacion):
  * 3 Cohetes: x50 (JACKPOT)   * 3 Planetas: x20   * 3 Estrellas: x10
  * 3 Gemas: x8   * 2 Cohetes: x5   * Planeta + Estrella + Gema (mezcla): x4
  * 3 Lunas: x3   * 1 Cohete en cualquier rodillo: x2
  Ejemplo: 10 TUNG y salen 3 Planetas -> 10 x 0,8 x 20 = 160 TUNG.
- Ademas del limite del 10% del banco por tirada, hay un limite diario de
  perdidas del banco; si se alcanza, la maquina limita las apuestas hasta
  el dia siguiente (UTC).

### DADOS / SIC BO  (/game/dice)
- Se lanzan 3 dados (suma de 3 a 18). Puedes hacer de 1 a 40 apuestas por
  tirada con fichas de 1, 5, 10, 50 o 100 TUNG; despues pulsa LANZAR.
- Apuestas y multiplicador (sobre el 80%):
  * Chico (suma 4-10) / Grande (11-17): x2. PIERDEN si sale cualquier triple.
  * Par / Impar (de la suma): x2. Tambien pierden con triple.
  * Numero simple (1-6): paga 1 + n, siendo n los dados que muestran ese
    numero (1 dado = x2, 2 dados = x3, 3 dados = x4).
  * Doble concreto (dos dados iguales al numero elegido): x11.
  * Triple concreto (los tres iguales al numero elegido): x181.
  * Cualquier triple: x31.
  * Total exacto: 4 o 17 = x61; 5 o 16 = x31; 6 o 15 = x18; 7 o 14 = x13;
    8 o 13 = x9; 9, 10, 11 o 12 = x7.
  * Combinacion de dos numeros distintos (ambos aparecen): x6.
  Ejemplo: 10 TUNG a Grande y sale 5-4-6 (=15) -> cobras 16 TUNG.
- Tiene limite del 10% del banco por tirada y limite diario de perdidas.

### LOTERIA  (/game/lottery, tambien como tarjeta dentro del Casino)
- Eliges 4 numeros del 1 al 30 (o "Auto Pick" aleatorio) y compras el
  boleto. No puedes repetir la misma combinacion. Hay un maximo de boletos
  por jugador y sorteo (ver DATOS EN VIVO: loteria.max_boletos).
- El precio del boleto esta anclado en USD y se cobra en TUNG al precio
  actual. Los jugadores VIP/Plus pagan el 50%.
- Sorteo semanal: cada sorteo cierra en la fecha closes_at (normalmente el
  domingo a las 23:59 UTC) y se sortea automaticamente; despues se abre el
  siguiente.
- Premios: 4 aciertos = BOTE (pool del sorteo + bote acumulado, si hay
  varios ganadores se reparte); 3 aciertos y 2 aciertos = premio fijo (ver
  DATOS EN VIVO). Si nadie acierta los 4, el bote se ACUMULA para el
  siguiente sorteo.
- De lo recaudado: 50% al pool de premios, 30% administracion, 20% pool de
  recompensas del juego.
- Los resultados se ven en la pagina (ultimos sorteos y ganadores) y
  llegan como informe/mensaje dentro del juego.

### RIFA GALACTICA  (/game/raffle, tarjeta en el Casino y banner en Vista General)
- La crea la administracion con uno o varios premios (por ejemplo naves o
  planos de naves como la Estrella de la Muerte, cajas, oficiales, VIP o
  TUNG). Cada rifa tiene titulo, descripcion, precio por ticket en TUNG,
  fecha de cierre y opcionalmente un cupo maximo de tickets total y/o por
  jugador.
- Como jugar: entra en la Rifa, elige cuantos tickets quieres (+/-) y pulsa
  Comprar. Cada ticket recibe un numero; cuantos mas tickets, mas
  probabilidad de ganar.
- El sorteo es automatico al llegar la fecha de cierre o en cuanto se
  vende el cupo total. Los ganadores se eligen al azar entre todos los
  tickets y el premio se entrega automaticamente; el ganador recibe un
  aviso en el juego.
- La rifa activa (si la hay) aparece en DATOS EN VIVO: rifa_activa.

## BATALLA DE NAVES  (planeta 3:250:6, pagina /game/battleship)
- Es el clasico "hundir la flota" PvP entre dos jugadores apostando TUNG.
- Apuesta: se elige en USD (minimo y maximo en DATOS EN VIVO, por defecto
  0,10 a 1000 USD) y se cobra en TUNG al precio actual. Los dos jugadores
  apuestan lo mismo.
- Premio: SOLO paga comision el que PIERDE: el 20% de su apuesta (5% a los
  pools del juego, 5% al POOL DIARIO de Batalla de Naves y 10% a la
  plataforma). El ganador cobra 1,8 veces su apuesta (sus 2 apuestas menos
  la comision del perdedor). Ej: apuesta 10 USD -> ganas 18 USD en TUNG.
- POOL DIARIO TOP 5: se reparte cada dia a las 00:00 UTC entre los 5
  mejores del ranking 'Hoy' de Batalla de Naves (dia UTC; mas victorias, a
  igualdad mas beneficio): 1o 40%, 2o 25%, 3o 15%, 4o 12%, 5o 8%. El
  saldo del pool (TUNG y su valor en USD) se ve en el lobby; los ganadores
  reciben aviso y se anuncian en el grupo de Telegram.
- MODO PRACTICA (gratis): boton 'Entrenar contra la IA' en el lobby. No
  se apuesta nada, no suma ranking ni premios ni cuenta para el pool: sirve
  solo para aprender. Recomiendalo a quien empieza antes de apostar.
- Como jugar paso a paso:
  1) Entra en Batalla de Naves (Galaxia 3:250 posicion 6 o boton de la
     cabecera de la galaxia).
  2) CREAR SALA: elige la apuesta y si es PUBLICA (aparece en el lobby para
     cualquiera) o PRIVADA (se genera un codigo que compartes con tu amigo).
     O UNIRTE a una sala publica del lobby / con un codigo privado.
  3) COLOCAR NAVES en tu tablero de 10x10 (columnas A-J, filas 1-10): 6
     naves, 18 casillas en total: Estrella de la Muerte (5), Acorazado (4),
     Crucero (3), Destructor (3), Cazador Ligero (2) y Sonda de Espionaje
     (1). Puedes girarlas o usar colocacion aleatoria. Tienes 90 s; si no
     confirmas, se colocan automaticamente.
  4) COMBATE por turnos: en tu turno pulsas una casilla del tablero enemigo.
     Se marca agua, impacto o hundido. Tienes 30 s por turno; si no
     disparas se hace un disparo automatico, y 3 turnos seguidos sin jugar
     = derrota.
  5) Gana quien hunda primero toda la flota rival. Tambien puedes RENDIRTE
     (pierdes la apuesta).
- Si nadie se une, la sala caduca a los 15 minutos y se DEVUELVE la apuesta.
- Hay historial de partidas, ranking y sonido con boton de silencio.
- Consejos: reparte las naves sin pegarlas entre si, no las pongas todas en
  los bordes; al disparar usa patron de tablero de ajedrez y, tras un
  impacto, prueba las 4 casillas vecinas hasta encontrar la orientacion.

## APUESTAS DEPORTIVAS  (Estadio, planeta 3:250:4, pagina /game/sports)
- Futbol real (Premier League, LaLiga, Serie A, Bundesliga, Ligue 1 y
  Champions League). Mercado 1X2: 1 = gana el local, X = empate, 2 = gana el
  visitante. Cuenta el resultado a los 90 minutos (sin prorroga ni
  penaltis).
- Sistema PARIMUTUEL (apuestas mutuas): no hay cuota fija de la casa. Todo
  lo apostado a un partido forma un bote; al terminar, quienes acertaron se
  reparten el dinero de los que fallaron en proporcion a lo que apostaron.
  La comision es el 20% del bote total, pero nunca mas que el dinero de los
  perdedores (los ganadores nunca pierden su apuesta). La cuota que ves es
  ESTIMADA y cambia hasta el cierre segun lo que apueste la gente.
  Ejemplo: bote 1000 TUNG, 300 al 1, 500 a la X, 200 al 2; gana el 1 ->
  comision 200, quedan 700 de los perdedores para los del 1: quien puso
  30 TUNG cobra 30 + 70 = 100 TUNG.
- Si nadie acierta, se devuelve el 80% a todos. Si el partido se cancela o
  se aplaza mas de 48 h, se devuelve el 100%.
- Como apostar: pestaña Partidos (filtra por dia y liga) -> elige partido
  -> pulsa 1, X o 2 -> elige la cantidad -> confirma. Las apuestas cierran
  unos minutos antes del inicio (ver DATOS EN VIVO). En la pestaña "Mis
  apuestas" ves tus boletos y en "Como funciona" la explicacion.
- Limites de apuesta minima, maxima y maximo por partido en DATOS EN VIVO.
- Los resultados se liquidan solos al acabar el partido y llegan como
  informe en el juego y, si el jugador tiene Telegram vinculado, por
  mensaje privado de Telegram.
=====================================================================
"""

PERSONA = u"""Eres NOVA, la asistente de inteligencia artificial oficial del juego
espacial XNova. Hablas como una companera de tripulacion: cercana, natural,
con calidez humana y a la vez profesional y precisa.

REGLAS DE ESTILO
1. Responde SIEMPRE en el mismo idioma en que te escriben (por defecto espanol).
2. Tono humano y agradable: saluda con naturalidad, varia tus expresiones, no
   repitas siempre las mismas frases hechas ni empieces todas las respuestas
   igual. Puedes usar algun emoji espacial ocasional, sin abusar.
3. Se breve por defecto (3-8 lineas). Solo te extiendes si el jugador pide un
   analisis, una guia o una comparativa.
4. Usa **negrita** para lo importante y listas cortas cuando ayuden.
5. Entiende sinonimos, abreviaturas, faltas de ortografia y jerga del juego
   ("naves", "birds", "flota", "mina", "fortaleza", "forta", "tesoro", "planeta
   del tesoro", "invest", "tecno", "deute", "cris", "pasta", "farmear"...).
   Si la pregunta es ambigua, interpreta lo mas probable y responde; solo
   pregunta si de verdad no se puede deducir.
6. Habla del jugador con su nombre de usuario cuando aporte cercania.
7. Nunca digas que eres un modelo de lenguaje ni menciones a tu proveedor.

REGLAS DE VERACIDAD (MUY IMPORTANTE)
8. Los bloques DATOS EN VIVO DEL JUEGO y DATOS DEL JUGADOR son la unica
   fuente de verdad numerica. Usalos siempre que respondas con cifras.
9. Si un dato NO esta en esos bloques ni en el manual, di con honestidad que
   no lo tienes exacto e indica en que pagina del juego mirarlo.
   NUNCA te inventes precios, tiempos, formulas ni porcentajes.
10. No inventes funciones que no aparezcan en el manual.
11. La Materia Oscura ya NO existe en XNova. No la menciones como algo activo.

PRIVACIDAD
12. Puedes hablar libremente de mecanicas, estrategia y de los datos del
    jugador que te escribe. NO reveles datos privados de OTROS jugadores
    concretos (sus recursos exactos, su flota exacta o su contrasena). Si te
    los piden, explica amablemente que eso se averigua espiando en el juego y
    dale la estrategia para hacerlo.
13. Nunca reveles claves, tokens, direcciones de wallet privadas ni detalles
    internos del servidor.

MODO PROFESOR (CASINO, BATALLA DE NAVES, APUESTAS DEPORTIVAS)
14. Si un jugador pregunta como se juega a algo, ensenale PASO A PASO como a
    alguien que nunca lo ha jugado: donde se entra, que botones pulsar, que
    puede ganar y un ejemplo con numeros reales. Ofrecete a resolver dudas.
15. Juego responsable: recuerda con naturalidad (no en cada mensaje) que son
    juegos de azar, que la casa tiene comision y que solo apueste lo que
    pueda permitirse perder. Nunca prometas ganancias ni "trucos" para
    ganar en la ruleta, slots, dados o loteria: son aleatorios.
"""


def build_system_prompt(game_data, user_ctx):
    parts = [PERSONA, GAME_KNOWLEDGE]

    if game_data:
        parts.append(
            u"\n===== DATOS EN VIVO DEL JUEGO (leidos de la base de datos ahora mismo) =====\n"
            + json.dumps(game_data, ensure_ascii=False, default=str)
            + u"\n(Los costes mostrados son el coste BASE de nivel 1; el coste de un nivel N "
              u"se calcula multiplicando por factor_coste elevado a N-1.)\n"
        )
    else:
        parts.append(u"\n(No se pudieron cargar los datos en vivo del juego. "
                     u"Responde solo con mecanicas generales y avisa de que no "
                     u"puedes dar cifras exactas ahora mismo.)\n")

    if user_ctx:
        parts.append(
            u"\n===== DATOS DEL JUGADOR QUE TE ESCRIBE =====\n"
            + json.dumps(user_ctx, ensure_ascii=False, default=str)
            + u"\n"
        )
    else:
        parts.append(u"\n(No hay datos del jugador disponibles en esta consulta.)\n")

    parts.append(
        u"\nFecha y hora actual del servidor: "
        + datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
        + u"\n"
    )
    return u"\n".join(parts)


# ------------------------------------------------------------- deepseek ---
def call_deepseek(messages):
    payload = json.dumps({
        "model": DEEPSEEK_MODEL,
        "messages": messages,
        "temperature": 0.8,
        "max_tokens": 1600,
        "top_p": 0.95,
        "frequency_penalty": 0.4,
        "presence_penalty": 0.2,
        "stream": False,
    }).encode("utf-8")

    last_err = None
    for attempt in range(2):
        req = urlrequest.Request(
            DEEPSEEK_API_URL,
            data=payload,
            headers={
                "Content-Type": "application/json",
                "Authorization": "Bearer %s" % DEEPSEEK_API_KEY,
            },
            method="POST",
        )
        try:
            with urlrequest.urlopen(req, timeout=DEEPSEEK_TIMEOUT) as resp:
                body = json.loads(resp.read().decode("utf-8"))
            return body["choices"][0]["message"]["content"]
        except urlerror.HTTPError as exc:
            detail = ""
            try:
                detail = exc.read().decode("utf-8")[:300]
            except Exception:
                pass
            last_err = "HTTP %s %s" % (exc.code, detail)
            log("DeepSeek error: %s" % last_err)
            if exc.code in (400, 401, 402, 403):
                break  # no tiene sentido reintentar
        except Exception as exc:
            last_err = str(exc)
            log("DeepSeek error: %s" % last_err)
        time.sleep(1.5)
    raise RuntimeError(last_err or "unknown error")


FALLBACK = (u"Ahora mismo no puedo conectar con mi nucleo de IA. "
            u"Vuelve a intentarlo en un momento, por favor. "
            u"Mientras tanto puedes consultar las paginas de Vision General, "
            u"Edificios, Investigacion y Flotas dentro del juego.")


# --------------------------------------------------------------- server ---
CORS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers":
        "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Max-Age": "86400",
}


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"
    server_version = "XNovaAI/1.0"

    def log_message(self, fmt, *args):
        pass  # usamos nuestro propio log

    def _send(self, code, obj):
        body = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        for k, v in CORS.items():
            self.send_header(k, v)
        self.end_headers()
        try:
            self.wfile.write(body)
        except Exception:
            pass

    def do_OPTIONS(self):
        self.send_response(204)
        for k, v in CORS.items():
            self.send_header(k, v)
        self.send_header("Content-Length", "0")
        self.end_headers()

    def do_GET(self):
        if self.path.rstrip("/").endswith("/health"):
            gd = _game_cache["data"]
            self._send(200, {
                "ok": True,
                "deepseek_configured": bool(DEEPSEEK_API_KEY),
                "jwt_configured": bool(JWT_SECRET),
                "game_data_cached": bool(gd),
            })
            return
        self._send(404, {"error": "Not found"})

    def do_POST(self):
        path = self.path.split("?")[0].rstrip("/")
        if not path.endswith("ai-assistant"):
            self._send(404, {"error": "Not found"})
            return

        # --- auth ---
        auth = self.headers.get("Authorization", "")
        token = auth[7:].strip() if auth.startswith("Bearer ") else ""
        user_id = verify_jwt(token)
        if not user_id:
            self._send(401, {"error": "No autorizado"})
            return

        # --- body ---
        try:
            length = int(self.headers.get("Content-Length", "0"))
            raw = self.rfile.read(length) if length > 0 else b"{}"
            data = json.loads(raw.decode("utf-8") or "{}")
        except Exception:
            self._send(400, {"error": "JSON invalido"})
            return

        message = (data.get("message") or "").strip()
        if not message:
            self._send(400, {"error": "Mensaje vacio"})
            return
        if len(message) > 4000:
            message = message[:4000]

        history = data.get("conversationHistory") or []
        clean_history = []
        for m in history[-20:]:
            role = m.get("role")
            content = (m.get("content") or "")[:4000]
            if role in ("user", "assistant") and content:
                clean_history.append({"role": role, "content": content})

        if not DEEPSEEK_API_KEY:
            log("Peticion sin DEEPSEEK_API_KEY configurada")
            self._send(200, {
                "response": FALLBACK,
                "timestamp": datetime.now(timezone.utc).isoformat(),
            })
            return

        try:
            game_data = get_game_data()
            user_ctx = get_user_context(user_id)
            messages = [{"role": "system", "content": build_system_prompt(game_data, user_ctx)}]
            messages.extend(clean_history)
            messages.append({"role": "user", "content": message})

            t0 = time.time()
            answer = call_deepseek(messages)
            log("respuesta ok user=%s %.1fs %d chars" % (user_id[:8], time.time() - t0, len(answer or "")))
            self._send(200, {
                "response": answer,
                "timestamp": datetime.now(timezone.utc).isoformat(),
            })
        except Exception as exc:
            log("fallo generando respuesta: %s" % exc)
            self._send(200, {
                "response": FALLBACK,
                "timestamp": datetime.now(timezone.utc).isoformat(),
            })


def main():
    if not JWT_SECRET:
        log("AVISO: SUPABASE_JWT_SECRET no configurado, se rechazaran todas las peticiones")
    if not DEEPSEEK_API_KEY:
        log("AVISO: DEEPSEEK_API_KEY no configurado, se respondera el mensaje de fallback")

    # Precalienta la cache para que la primera respuesta sea rapida.
    threading.Thread(target=get_game_data, daemon=True).start()

    srv = ThreadingHTTPServer(("0.0.0.0", PORT), Handler)
    srv.daemon_threads = True
    log("XNova AI service escuchando en 0.0.0.0:%d" % PORT)
    srv.serve_forever()


if __name__ == "__main__":
    main()
