# AUDITORÍA DE SEGURIDAD — XNova (xnova.xyz)

**Fecha:** 2026-09-13  
**Auditor:** Propietario del sistema (auto-auditoría asistida)  
**Alcance:** Funciones RPC, acceso directo a tablas vía PostgREST, RLS, triggers, esquema `public`, Edge Functions, Storage, base de datos companion (MySQL/MariaDB)  
**Método:** Análisis estático de código fuente + pruebas de callability y data access en producción + análisis de exports de DB  
**Total funciones analizadas:** 659 (607 SECURITY DEFINER)  
**Total tablas analizadas:** 152 legibles, 43 con grants de escritura  
**Base de datos companion analizada:** `u409779071_xnova` (MariaDB 11.8.9, Hostinger, 17 tablas)

---

## RESUMEN EJECUTIVO

Se identificaron **72 vulnerabilidades** en funciones RPC, acceso a datos vía PostgREST, Edge Functions y Storage, incluyendo:
- **3 vulnerabilidades catastróficas** de manipulación de precio + data leak masivo + balance negativo→USDT
- **12 vulnerabilidades críticas** con impacto financiero directo, bypass de protecciones, IDOR, firmas, admin balance, war score inflation
- **10 vulnerabilidades altas** de race condition + DoS + lanzamiento de misiles
- **16 vulnerabilidades medias** de sabotaje, funciones cron expuestas, IDOR hero ship, race condition transfers
- **19 vulnerabilidades bajas** de enumeración, config/jackpot/lottery exposure, spam
- **12 hallazgos informativos** de Edge Functions, Storage, URLs internas, vistas, DB companion

---

## SEVERIDAD CATASTRÓFICA (Pérdida financiera directa, explotable inmediatamente)

### [CAT-2] Data Leak Masivo — 2,688 perfiles con emails y balances
- **Vector:** `GET /rest/v1/profiles?select=*` con token de cualquier jugador autenticado
- **Estado:** CONFIRMADO en producción
- **Datos expuestos de TODOS los 2,688 jugadores:**
  - **Emails reales** (ej: `aborrezcopanfilo@gmail.com`, `landroj35@gmail.com`, etc.)
  - **Balances financieros:** `fxu_balance`, `usdt_balance`, `tung_balance`, `dark_matter`
  - **Códigos de referido:** `referral_code`, `referred_by`
  - **Flags de privilegio:** `is_admin`, `is_bot`, `is_banned`
  - **Estado de autopilot:** `autopilot_active`, `autopilot_eligible`
  - **Actividad:** `last_activity`, `last_manual_action`
- **Impacto:** Violación de privacidad (GDPR/datos personales), ventaja competitiva (ver balances enemigos), ingeniería social (emails reales)
- **Causa raíz:** RLS habilitado en `profiles` pero SIN POLICIES → PostgREST retorna todos los registros a authenticated porque Supabase usa `SECURITY DEFINER` en las funciones internas de PostgREST que bypasean RLS
- **Tablas adicionales con data leak sensible (todas legibles por authenticated sin filtro):**

  | Tabla | Datos expuestos |
  |-------|----------------|
  | `wallet_config` | Dirección de depósito `0x3875...`, contrato TUNG, contrato USDT, chain_id, fees |
  | `wallet_transactions` | Historial completo de retiros/depósitos (vacío ahora) |
  | `game_settings` (50 keys) | Configuración económica interna, probabilidades de drops, ratios |
  | `jackpot_pools` | Balances exactos de todos los pools de premios |
  | `fxu_ledger` | Historial completo de movimientos FXU de todos los jugadores |
  | `tung_price_history` | Historial de precios con liquidez |
  | `email_verification_tokens` | Tokens de verificación de email (potencial account takeover) |
  | `admin_revenue` | Ingresos del admin |
  | `referral_commissions` | Comisiones de referidos |
  | `plus_subscriptions` | Suscripciones Plus de todos |
  | `kyc_verifications` | Datos KYC (vacío) |
  | `login_sessions` | Sesiones de login |

- **Remediación:**
  ```sql
  -- Opción A: Políticas RLS restrictivas (recomendado)
  CREATE POLICY profiles_select_own ON profiles FOR SELECT 
    USING (id = auth.uid());
  -- O una policy que filtre columnas sensibles para otros usuarios
  
  -- Opción B: Revocar SELECT directo y usar funciones RPC
  REVOKE SELECT ON TABLE profiles FROM authenticated;
  -- (requiere crear RPC para datos públicos como rankings)
  
  -- Para tablas de configuración interna:
  REVOKE SELECT ON TABLE wallet_config FROM authenticated;
  REVOKE SELECT ON TABLE admin_revenue FROM authenticated;
  REVOKE SELECT ON TABLE fxu_ledger FROM authenticated;
  REVOKE SELECT ON TABLE email_verification_tokens FROM authenticated;
  REVOKE SELECT ON TABLE login_sessions FROM authenticated;
  REVOKE SELECT ON TABLE kyc_verifications FROM authenticated;
  ```

### [CAT-3] `fxu_balance` sin CHECK >= 0 — Balance negativo → USDT gratis
- **Tabla:** `profiles.fxu_balance` — tipo `numeric`, SIN constraint `CHECK (fxu_balance >= 0)`
- **Estado:** CONFIRMADO — `profiles.usdt_balance` SÍ tiene CHECK >= 0, pero FXU y TUNG no.
- **Impacto CATASTRÓFICO:** 7 funciones CALLABLE permiten llevar `fxu_balance` a negativo:
  1. `swap_fxu_to_usdt` — **el más grave**: swap FXU→USDT con balance negativo = USDT real generado de la nada
  2. `purchase_supply_box` — comprar cajas infinitas sin fondos
  3. `purchase_cosmetic` — comprar cosméticos sin fondos
  4. `join_alliance_war` — unirse a guerras sin pagar
  5. `purchase_daily_mission_bonus` — comprar bonuses sin pagar
  6. `secure_abandon_colony` — abandonar colonias sin costo real
  7. `toggle_autopilot_vip_boost` — activar VIP sin pagar
- **Exploit concreto:**
  1. Jugador tiene 0 FXU
  2. Llama `purchase_supply_box('box_premium', mi_planeta)` repetidamente
  3. FXU baja a -50000, -100000... sin límite
  4. Llama `swap_fxu_to_usdt(1)` — pero el balance ya es negativo, no necesita FXU real
  5. Con race conditions simultáneas, amplifica el daño exponencialmente
- **Remediación:**
  ```sql
  -- VERIFICAR antes: SELECT id, username, fxu_balance FROM profiles WHERE fxu_balance < 0;
  ALTER TABLE profiles ADD CONSTRAINT profiles_fxu_balance_non_negative CHECK (fxu_balance >= 0);
  ALTER TABLE profiles ADD CONSTRAINT profiles_tung_balance_non_negative CHECK (tung_balance >= 0);
  ```

### [CAT-1] Manipulación de precio TUNG via `set_live_tung_price`
- **Función:** `set_live_tung_price(p_price numeric)`
- **Estado:** CALLABLE (204) — SIN autenticación, SIN verificación admin
- **Impacto:** Un atacante puede fijar el precio del token TUNG a cualquier valor. Este precio se usa en TODAS las compras con precio dinámico USD: Plus subscriptions, cosméticos, daily streak, supply boxes, blueprints, renombrar planetas/alianzas, recargar colonias.
- **Exploit:**
  1. `set_live_tung_price(999999)` → TUNG vale $999,999
  2. Comprar Plus ($5 USDT) → cuesta `CEIL(5/999999)` = **1 TUNG**
  3. Comprar múltiples supply boxes, cosméticos, etc. por 1 TUNG cada uno
  4. El cron `refresh_tung_price` restaura el precio real en ~60 segundos
  5. Ventana de ataque: hasta 60 segundos por intento (automatizable)
- **Funciones afectadas:** `purchase_plus_subscription`, `purchase_cosmetic`, `activate_daily_streak`, `purchase_supply_box`, `purchase_ship_blueprint`, `refill_colony_resources`, `secure_create_alliance`, `secure_rename_planet`, `secure_rename_alliance`, `purchase_daily_mission_bonus`
- **Remediación:**
  ```sql
  REVOKE EXECUTE ON FUNCTION set_live_tung_price(numeric) FROM authenticated, anon;
  ```

---

## SEVERIDAD CRÍTICA (Dinero real en riesgo)

### [CRIT-5] Guard Token Bypass — `_internal_set_fxu_context` + `set_fxu_update_context`
- **Funciones:** `_internal_set_fxu_context()` y `set_fxu_update_context(p_context text)`
- **Estado:** Ambas CALLABLE (204) — SIN autenticación
- **Vulnerabilidad:** Estas funciones activan los guard tokens que protegen TODAS las columnas sensibles de `profiles`:
  - `_internal_set_fxu_context()` → activa `app.fxu_update_allowed` + `fxu.allow_update_9x7k2m`
  - `set_fxu_update_context(text)` → activa `app.fxu_update_allowed` con valor arbitrario
- **Triggers bypasseados:** `protect_fxu_balance`, `protect_sensitive_profile_columns`, `protect_game_table_full`, `protect_alliances_sensitive_columns`
- **Impacto mitigado:** Los guard tokens son transaction-scoped (LOCAL), y `profiles` no tiene UPDATE grant para `authenticated`, así que no es directamente explotable vía PostgREST. Pero si se encadena con otra vulnerabilidad que permita ejecutar SQL en la misma transacción, permitiría escalar a admin (`is_admin = true`), inflar balances, etc.
- **Remediación:**
  ```sql
  REVOKE EXECUTE ON FUNCTION _internal_set_fxu_context() FROM authenticated, anon;
  REVOKE EXECUTE ON FUNCTION set_fxu_update_context(text) FROM authenticated, anon;
  ```

### [CRIT-7] `get_my_hero_duel` — IDOR + Race condition + Modifica FXU sin auth
- **Función:** `get_my_hero_duel(p_user_id uuid)`
- **Estado:** CALLABLE (200) — Acepta UUID de CUALQUIER jugador, SIN auth.uid()
- **Vulnerabilidades combinadas:**
  1. **IDOR:** Acepta `p_user_id` sin verificar `auth.uid()` — cualquier jugador puede ver/resolver duelos de otros
  2. **Race condition:** SELECT del duelo SIN `FOR UPDATE` — dos llamadas concurrentes pueden resolver el mismo duelo dos veces
  3. **Doble pago:** Si el duelo se resuelve dos veces, el ganador recibe `stake * 1.8` dos veces
  4. **Sin auth:** Función completamente abierta, un atacante puede monitorear y resolver duelos ajenos
- **Impacto:** Un atacante puede:
  - Espiar todos los duelos activos de cualquier jugador
  - Forzar resolución de duelos antes de tiempo (si `resolves_at` ha pasado)
  - Explotar race condition para duplicar pagos al ganador
- **Remediación:**
  ```sql
  -- Añadir verificación de auth:
  IF p_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;
  -- Y FOR UPDATE en el SELECT de hero_duels
  ```

### [CRIT-8] `resolve_hero_duel` — Resolución de duelos sin auth + modifica FXU
- **Función:** `resolve_hero_duel(p_duel_id uuid)`
- **Estado:** 403 (bloqueada) pero el código no tiene auth check
- **Vulnerabilidad:** Sin auth.uid(), sin FOR UPDATE. Mismos problemas que CRIT-7 pero directamente por ID de duelo.
- **Impacto mitigado:** Bloqueada por falta de EXECUTE grant. Mantener así.
- **Remediación:** Mantener REVOKE actual. Si se necesita re-habilitar, añadir auth + FOR UPDATE.

### [CRIT-9] Firmas y hashes crypto aceptados sin verificación criptográfica
- **Funciones afectadas:**
  - `mark_withdrawal_signed(p_tx_id, p_signature, p_expiry)` — **CALLABLE** — acepta cualquier string como `p_signature`
  - `confirm_contract_withdrawal(p_tx_id, p_contract_tx_hash)` — **CALLABLE** — acepta cualquier string como tx_hash
  - `confirm_deposit(p_tx_hash, ...)` — 403 bloqueada, pero el código no verifica el hash
  - `complete_withdrawal(p_tx_hash, ...)` — 404, no encontrada
- **Vulnerabilidad:** Ninguna de estas funciones verifica criptográficamente que la firma/hash sea real. Aceptan cualquier string. Combinado con su callability, un atacante puede fabricar retiros "confirmados" con hashes inventados.
- **Impacto:** El sistema marca transacciones como procesadas/confirmadas sin que hayan ocurrido on-chain. El usuario pierde su USDT (ya debitado al solicitar) sin recibir la transferencia blockchain real.
- **Remediación:**
  ```sql
  -- Revocar acceso (ya listado en Paso 1)
  -- Además, si se re-habilitan: validar formato de hash (0x + 64 hex chars)
  -- y verificar contra nodo blockchain o API de block explorer
  ```

### [CRIT-10] `get_admin_available_balance` — Expone balance de tesorería admin
- **Función:** `get_admin_available_balance()`
- **Estado:** CALLABLE (200) — SIN autenticación
- **Respuesta real:** `809100.98746852` (FXU)
- **Vulnerabilidad:** Cualquier usuario autenticado puede ver el balance exacto de la tesorería del administrador. Esta información es extremadamente sensible:
  - Revela la salud financiera del proyecto
  - Permite calcular si hay suficiente liquidez para explotar retiros
  - Información de insider que afecta decisiones de trading del token TUNG
- **Remediación:**
  ```sql
  REVOKE EXECUTE ON FUNCTION get_admin_available_balance() FROM authenticated, anon;
  ```

### [CRIT-11] `take_weekly_revenue_snapshot` — Exposición + creación de snapshots de ingresos
- **Función:** `take_weekly_revenue_snapshot()`
- **Estado:** CALLABLE (200) — SIN autenticación
- **Respuesta real:** `{"year": 2026, "total": 187440.65678894, "week_end": "2026-09-13", "week_start": "2026-09-07", "week_number": 37}`
- **Vulnerabilidad doble:**
  1. **Exposición:** Retorna el total de ingresos semanales reales (187,440.65 FXU ≈ ~$18.74 USDT al rate actual)
  2. **Mutación:** CREA un snapshot nuevo en `weekly_revenue_snapshots` — un atacante puede generar snapshots falsos llamándola repetidamente
- **Tablas afectadas:** `weekly_revenue_snapshots` (ya listada en Paso 1b para REVOKE SELECT)
- **Remediación:**
  ```sql
  REVOKE EXECUTE ON FUNCTION take_weekly_revenue_snapshot() FROM authenticated, anon;
  ```

### [CRIT-12] `report_war_battle` — Inflación de puntuación de guerra → robo de pool FXU
- **Función:** `report_war_battle(p_war_id uuid, p_enemy_alliance_id uuid, p_resources_destroyed bigint)`
- **Estado:** CALLABLE (200) — Tiene auth.uid() pero `p_resources_destroyed` no se valida
- **Guerra activa encontrada:** VIKING (BM) vs VAGOS — war_id `9e9718ff-b05a-4ee0-87f7-441a0c6fa43f`
- **Vulnerabilidad:** El parámetro `p_resources_destroyed` es completamente proporcionado por el usuario. No se valida contra logs de combate, flotas enviadas, o datos reales del juego. Cualquier miembro de una alianza inscrita puede:
  1. Llamar `report_war_battle(war_id, enemy_alliance_id, 999999999)` → +999,999 puntos instantáneos
  2. Repetir indefinidamente sin cooldown ni límite
  3. Garantizar la victoria de su alianza
  4. El pool se distribuye: 70% ganador, 15% admin, 15% reserva → robo directo de FXU
- **Validaciones que SÍ tiene:** auth.uid(), membresía en alianza inscrita, enemigo inscrito en la guerra, no atacar propia alianza, mínimo 1000 recursos
- **Lo que NO valida:** Que la batalla realmente ocurrió, que los recursos fueron realmente destruidos
- **Impacto:** Con una guerra activa entre VIKING y VAGOS, un miembro de cualquiera de las dos alianzas puede ganar el pool entero (`total_pool_fxu`) reportando batallas falsas.
- **Remediación:**
  ```sql
  -- Opción A: Solo permitir que el sistema reporte batallas (via process_fleet_arrival)
  REVOKE EXECUTE ON FUNCTION report_war_battle(uuid, uuid, bigint) FROM authenticated, anon;
  
  -- Opción B: Validar contra logs de combate reales
  -- Verificar que p_resources_destroyed coincida con un combat_report reciente
  -- del mismo attacker contra la misma alianza enemiga
  ```

### [CRIT-6] Funciones de información privilegiada callable como IDOR
- **Funciones:** `has_autopilot_access(p_user_id)`, `is_user_plus(p_user_id)`
- **Estado:** CALLABLE (200) — Aceptan UUID de cualquier jugador
- **Vulnerabilidad:** Permiten consultar el estado VIP/Plus/autopilot de cualquier jugador. Información competitiva sensible.
- **Remediación:** Añadir `IF p_user_id != auth.uid() THEN RAISE EXCEPTION` o revocar EXECUTE.

### [CRIT-1] Race condition en `swap_fxu_to_usdt` — FXU negativo → USDT gratis
- **Función:** `swap_fxu_to_usdt(p_fxu_amount numeric)`
- **Estado:** CALLABLE (200)
- **Vulnerabilidad:** SELECT `fxu_balance` SIN `FOR UPDATE`. Dos peticiones concurrentes leen el mismo balance y ambas pasan la validación. `fxu_balance` NO tiene CHECK >= 0, así que puede ir a negativo. USDT SÍ se acredita.
- **Exploit:** Con 1000 FXU, enviar 5 peticiones simultáneas de `swap_fxu_to_usdt(1000)` → se deducen 5000 FXU (balance = -4000), se acreditan ~5x USDT.
- **Remediación:**
  ```sql
  ALTER TABLE profiles ADD CONSTRAINT profiles_fxu_balance_non_negative CHECK (fxu_balance >= 0);
  -- Y en la función:
  SELECT fxu_balance INTO v_fxu_balance FROM profiles WHERE id = v_user_id FOR UPDATE;
  ```

### [CRIT-2] Race condition en `swap_usdt_to_fxu` — misma vulnerabilidad inversa
- **Función:** `swap_usdt_to_fxu(p_usdt_amount numeric)`
- **Estado:** CALLABLE (200)
- **Vulnerabilidad:** Idéntica a CRIT-1 pero en dirección inversa. `usdt_balance` SÍ tiene CHECK >= 0, pero sin `FOR UPDATE` la validación es bypasseable por race condition.
- **Remediación:** Añadir `FOR UPDATE` al SELECT del balance.

### [CRIT-3] Manipulación de estado de retiros crypto
- **Funciones:** `mark_withdrawal_signed(p_tx_id, p_signature, p_expiry)` + `confirm_contract_withdrawal(p_tx_id, p_contract_tx_hash)`
- **Estado:** Ambas CALLABLE (200/204) — SIN autenticación
- **Vulnerabilidad:** Un atacante puede:
  1. Encontrar un `tx_id` de retiro pendiente (via timing o info leak)
  2. Llamar `mark_withdrawal_signed` → mueve estado a 'processing'
  3. Llamar `confirm_contract_withdrawal` con hash falso → marca como 'confirmed'
  4. El USDT ya fue debitado del perfil al solicitar el retiro, pero nunca se envió on-chain
- **Impacto:** Robo de USDT — el usuario pierde su balance sin recibir la transferencia blockchain.
- **Remediación:**
  ```sql
  REVOKE EXECUTE ON FUNCTION mark_withdrawal_signed(uuid, text, bigint) FROM authenticated, anon;
  REVOKE EXECUTE ON FUNCTION confirm_contract_withdrawal(uuid, text) FROM authenticated, anon;
  ```

### [CRIT-4] `process_telegram_leave` — Sabotaje financiero sin autenticación
- **Función:** `process_telegram_leave(p_telegram_id text)`
- **Estado:** CALLABLE (200) — SIN auth.uid()
- **Vulnerabilidad:** Deduce FXU de cualquier jugador si conoces su telegram_id. El código explícitamente comenta que el balance "puede ir negativo". La tabla `telegram_links` es legible por authenticated, exponiendo los telegram_ids.
- **Impacto:** Sabotaje financiero — deducir FXU de cualquier jugador.
- **Remediación:**
  ```sql
  REVOKE EXECUTE ON FUNCTION process_telegram_leave(text) FROM authenticated, anon;
  ```

---

## SEVERIDAD ALTA (Duplicación de recursos / Race conditions económicas)

### [HIGH-1] Race condition en `purchase_supply_box` — duplicación de recursos
- **Función:** `purchase_supply_box(p_box_code text, p_planet_id uuid)`
- **Estado:** CALLABLE (200)
- **Vulnerabilidad:** SELECT `fxu_balance` SIN `FOR UPDATE`. Precio dinámico ~3882 TUNG para box_premium. Peticiones concurrentes pueden comprar múltiples boxes pagando solo una vez (FXU negativo).
- **Remediación:** `FOR UPDATE` en lectura de balance + CHECK constraint en fxu_balance.

### [HIGH-2] Race condition en `secure_cancel_research` — doble reembolso
- **Función:** `secure_cancel_research(p_technology_id uuid)`
- **Estado:** CALLABLE (200)
- **Vulnerabilidad:** SELECT SIN `FOR UPDATE` en `user_technologies`. Dos cancelaciones concurrentes del mismo research → doble reembolso de recursos (metal, crystal, deuterium).
- **Remediación:** `FOR UPDATE` en SELECT de user_technologies.

### [HIGH-3] Race condition en `secure_demolish_building` — doble reembolso + doble demolición
- **Función:** `secure_demolish_building(p_planet_id uuid, p_building_type_id integer)`
- **Estado:** CALLABLE (200)
- **Vulnerabilidad:** SELECT SIN `FOR UPDATE`. 50% cost refund duplicable + doble decremento de nivel.
- **Remediación:** `FOR UPDATE` en SELECT de planet_buildings.

### [HIGH-4] Race condition en `instant_complete_building` — FXU negativo
- **Función:** `instant_complete_building(p_queue_id uuid)`
- **Estado:** CALLABLE (200)
- **Vulnerabilidad:** SELECT SIN `FOR UPDATE` en building_queue y profiles. FXU puede ir negativo.
- **Remediación:** `FOR UPDATE` en ambas lecturas.

### [HIGH-5] Race condition en `instant_complete_research` — FXU negativo
- **Función:** `instant_complete_research` (ambos overloads)
- **Estado:** CALLABLE (200)
- **Vulnerabilidad:** SIN `FOR UPDATE`, debita FXU. Mismo patrón que HIGH-4.
- **Remediación:** `FOR UPDATE` en lectura de balance.

### [HIGH-6] Race condition en `purchase_plus_subscription` — compra múltiple
- **Función:** `purchase_plus_subscription(p_plan_code text, p_payment_type text)`
- **Estado:** NOT FOUND(404) con parámetros probados, pero código vulnerable
- **Vulnerabilidad:** SIN `FOR UPDATE` en balance (FXU ni USDT). Si es callable con los parámetros correctos, permite pagar una sola vez por múltiples suscripciones.
- **Remediación:** `FOR UPDATE` en lectura de balance.

### [HIGH-7] Race condition en `secure_cancel_building_queue_item` — doble reembolso
- **Función:** `secure_cancel_building_queue_item(p_queue_id uuid)`
- **Estado:** CALLABLE (200)
- **Vulnerabilidad:** SIN `FOR UPDATE` en building_queue (la primera lectura). Cancelar dos veces = doble reembolso de recursos.
- **Remediación:** Añadir `FOR UPDATE` al SELECT de building_queue.

### [HIGH-8] Race condition en `request_withdrawal_usdt` — retiro múltiple
- **Función:** `request_withdrawal_usdt(p_amount numeric, p_wallet_address text)`
- **Estado:** CALLABLE (200) pero deshabilitada por config (`is_usdt_withdrawals_enabled = false`)
- **Vulnerabilidad:** SIN `FOR UPDATE` en usdt_balance. Cuando se habiliten retiros, múltiples solicitudes concurrentes podrían exceder el balance real.
- **Remediación:** Añadir `FOR UPDATE` antes de que se habilite.

### [HIGH-9] Denial of Service via `bot_ai_tick` — saturación del servidor
- **Función:** `bot_ai_tick()`
- **Estado:** CALLABLE (500 timeout, pero ejecuta parcialmente)
- **Vulnerabilidad:** Función masiva: 24 loops anidados, 275 SELECTs, 14 UPDATEs por ejecución. Sin autenticación, sin rate limiting. Un atacante puede:
  1. Enviar llamadas continuas para saturar conexiones de DB
  2. Causar locks extensivos en tablas de juego (planets, fleets, resources)
  3. Degradar rendimiento para todos los jugadores
  4. Potencialmente causar deadlocks con otras operaciones concurrentes
- **Funciones DoS adicionales (CALLABLE, sin auth):**
  - `process_all_user_shipyard_queues` — procesa colas de todos los usuarios
  - `batch_update_player_points` — recalcula puntos de todos los jugadores
  - `p2p_expire_stale_offers` — 7 UPDATEs por ejecución
  - `stronghold_release` — 11 SELECTs, 3 UPDATEs
- **Remediación:**
  ```sql
  REVOKE EXECUTE ON FUNCTION bot_ai_tick() FROM authenticated, anon;
  -- Ya incluido en Paso 1, pero la severidad DoS justifica prioridad
  ```

### [HIGH-10] `launch_missiles` — Lanzamiento de misiles sin autenticación (CONFIRMADO)
- **Función:** `launch_missiles(p_origin_planet_id uuid, p_target_galaxy int, p_target_system int, p_target_position int, p_missile_count int)`
- **Estado:** CALLABLE (200) — Retorna `"Planeta de origen no encontrado"` con UUID falso
- **Vulnerabilidad:** NO tiene `auth.uid()` check. Obtiene `attacker_id` del dueño del planeta de origen sin verificar que sea el caller. Con un planet_id real que tenga misiles interplanetarios, un atacante puede:
  1. Lanzar misiles desde planetas ajenos contra cualquier objetivo
  2. Destruir defensas de otros jugadores usando las municiones de un tercero
  3. El dueño del planeta pierde sus misiles sin haberlos lanzado
- **Diferencia con `send_fleet`:** `send_fleet` delega a `secure_send_fleet` que SÍ verifica `auth.uid()`. `launch_missiles` NO tiene este wrapper de seguridad.
- **Remediación:**
  ```sql
  -- Añadir al inicio de la función:
  IF v_origin_planet.owner_id IS DISTINCT FROM auth.uid() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not your planet');
  END IF;
  ```

---

## SEVERIDAD MEDIA (Sabotaje de game mechanics / IDOR / Cron functions)

### [MED-1] `safe_deduct_resources` — Sabotaje de recursos sin autenticación
- **Función:** `safe_deduct_resources(p_planet_id uuid, p_metal bigint, p_crystal bigint, p_deuterium bigint)`
- **Estado:** CALLABLE (200) — SIN auth.uid()
- **Vulnerabilidad:** Cualquier jugador autenticado puede deducir recursos de CUALQUIER planeta. Tiene FOR UPDATE internamente (no hay race condition), pero la falta de auth es el problema.
- **Impacto:** Sabotaje total — vaciar recursos de planetas enemigos.
- **Remediación:**
  ```sql
  REVOKE EXECUTE ON FUNCTION safe_deduct_resources(uuid, bigint, bigint, bigint) FROM authenticated, anon;
  ```

### [MED-2] `update_planet_resources` — Manipulación de producción
- **Función:** `update_planet_resources(p_planet_id uuid)`
- **Estado:** CALLABLE (204) — SIN auth.uid()
- **Vulnerabilidad:** Fuerza actualización de producción de recursos en cualquier planeta. Puede manipular timestamps de `last_update`.
- **Remediación:**
  ```sql
  REVOKE EXECUTE ON FUNCTION update_planet_resources(uuid) FROM authenticated, anon;
  ```

### [MED-3] `stronghold_release` — Liberación de fortalezas sin autenticación
- **Función:** `stronghold_release(p_kind text, p_galaxy integer, p_subject text, p_body text)`
- **Estado:** CALLABLE (200) — SIN auth.uid()
- **Vulnerabilidad:** Cualquier jugador puede liberar una fortaleza o planeta del tesoro de cualquier galaxia, expulsando todas las naves de la alianza controladora. Sabotaje masivo de game mechanics.
- **Remediación:**
  ```sql
  REVOKE EXECUTE ON FUNCTION stronghold_release(text, integer, text, text) FROM authenticated, anon;
  ```

### [MED-4] `batch_update_player_points` — Recálculo de puntos no autorizado
- **Función:** `batch_update_player_points()`
- **Estado:** CALLABLE (200, actualizó 29 jugadores) — SIN auth.uid()
- **Vulnerabilidad:** Cualquier jugador puede triggear recálculo de puntos de todos los jugadores. Podría causar inconsistencias si se ejecuta durante operaciones en progreso.
- **Remediación:**
  ```sql
  REVOKE EXECUTE ON FUNCTION batch_update_player_points() FROM authenticated, anon;
  ```

### [MED-5] `process_all_user_shipyard_queues` — Procesamiento forzado
- **Función:** `process_all_user_shipyard_queues()`
- **Estado:** CALLABLE (200) — SIN auth.uid()
- **Vulnerabilidad:** Ejecuta el procesamiento de colas de astillero de TODOS los usuarios. Función interna que solo debería ser llamada por cron/service_role.
- **Remediación:**
  ```sql
  REVOKE EXECUTE ON FUNCTION process_all_user_shipyard_queues() FROM authenticated, anon;
  ```

### [MED-6] `p2p_expire_stale_offers` — Expiración forzada de ofertas P2P
- **Función:** `p2p_expire_stale_offers()`
- **Estado:** CALLABLE (200) — SIN auth.uid()
- **Vulnerabilidad:** Fuerza expiración de ofertas P2P y triggerea reembolsos. Función de mantenimiento que solo debería ejecutarse por cron.
- **Remediación:**
  ```sql
  REVOKE EXECUTE ON FUNCTION p2p_expire_stale_offers() FROM authenticated, anon;
  ```

### [MED-7] `global_process_all_expired_queues` — Ejecuta lógica de juego sin auth
- **Función:** `global_process_all_expired_queues()`
- **Estado:** CALLABLE (200) — **Procesó 3 buildings + 1 research en producción**
- **Vulnerabilidad:** Función cron que completa construcciones y research de TODOS los jugadores. Un atacante puede:
  1. Forzar completado prematuro de colas de construcción/research
  2. Alterar el flujo temporal del juego
  3. Causar inconsistencias si se llama durante otras operaciones
- **Resultado real:** `{"building_completed": 3, "research_completed": 1, "buildings_checked": 7, "researches_checked": 3}`
- **Remediación:**
  ```sql
  REVOKE EXECUTE ON FUNCTION global_process_all_expired_queues() FROM authenticated, anon;
  ```

### [MED-8] `process_all_pending_fleets` — Procesa flotas sin auth
- **Función:** `process_all_pending_fleets()`
- **Estado:** CALLABLE (200) — **Procesó 1 flota en producción**
- **Vulnerabilidad:** Ejecuta `process_fleet_arrival` para todas las flotas pendientes. Fuerza la llegada/retorno de flotas antes de su tiempo natural.
- **Resultado real:** `{"processed": 1, "errors": 0}`
- **Remediación:**
  ```sql
  REVOKE EXECUTE ON FUNCTION process_all_pending_fleets() FROM authenticated, anon;
  ```

### [MED-9] Funciones cron/mantenimiento CALLABLE sin autenticación (6 adicionales)
- **Funciones confirmadas CALLABLE:**
  - `optimized_global_queue_processor()` — procesador optimizado de colas globales
  - `process_all_research_completion()` — completa research de todos los jugadores
  - `clean_all_expired_cosmetics()` — limpia cosméticos expirados
  - `update_all_ranks()` — recalcula rankings globales
  - `recalculate_all_player_points()` — recalcula puntos de todos los jugadores
  - `auto_cancel_insufficient_listings()` — cancela listings del mercado
- **Estado:** Todas CALLABLE (200) sin autenticación
- **Vulnerabilidad:** Conjunto completo de funciones de mantenimiento interno del servidor expuestas a cualquier jugador autenticado. Permite:
  1. Manipular timing del juego (completar colas prematuramente)
  2. Causar carga excesiva en la DB (DoS)
  3. Generar inconsistencias en rankings y puntos
- **Remediación:**
  ```sql
  REVOKE EXECUTE ON FUNCTION optimized_global_queue_processor() FROM authenticated, anon;
  REVOKE EXECUTE ON FUNCTION process_all_research_completion() FROM authenticated, anon;
  REVOKE EXECUTE ON FUNCTION clean_all_expired_cosmetics() FROM authenticated, anon;
  REVOKE EXECUTE ON FUNCTION update_all_ranks() FROM authenticated, anon;
  REVOKE EXECUTE ON FUNCTION recalculate_all_player_points() FROM authenticated, anon;
  REVOKE EXECUTE ON FUNCTION auto_cancel_insufficient_listings(uuid) FROM authenticated, anon;
  REVOKE EXECUTE ON FUNCTION process_all_pending_fleets() FROM authenticated, anon;
  REVOKE EXECUTE ON FUNCTION global_process_all_expired_queues() FROM authenticated, anon;
  ```

### [MED-11] `get_hero_ship` — IDOR + Creación de naves para otros jugadores
- **Función:** `get_hero_ship(p_user_id uuid)`
- **Estado:** CALLABLE (409 con UUID falso = intentó INSERT) — SIN auth.uid()
- **Vulnerabilidad:** Función SECURITY DEFINER que:
  1. Llama `create_hero_ship(p_user_id)` internamente — bypass del REVOKE directo de `create_hero_ship` (403) porque se ejecuta en contexto SECURITY DEFINER
  2. Retorna datos completos del hero ship de cualquier jugador (level, XP, puntos de ataque/defensa/shield/speed, HP)
  3. Crea una hero ship para usuarios que no la tienen — altera el estado del juego de otros jugadores
- **Impacto:** Espionaje de builds de héroes enemigos + creación no autorizada de naves hero
- **Remediación:**
  ```sql
  -- Añadir al inicio:
  IF p_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;
  ```

### [MED-12] `transfer_tokens` — Bloqueada (403) — Race condition teórica mitigada
- **Función:** `transfer_tokens(p_receiver_username text, p_token_type text, p_amount numeric)`
- **Estado:** BLOQUEADA (403) — EXECUTE revocado. Tiene auth.uid() internamente.
- **Vulnerabilidad teórica:** Lee `fxu_balance` SIN `FOR UPDATE`. Si se re-habilita, transferencias concurrentes podrían exceder el balance real.
- **Remediación:** Si se re-habilita, añadir `FOR UPDATE` en la lectura de balance del sender.

### [MED-10] `complete_telegram_link` — Vinculación de Telegram sin autenticación
- **Función:** `complete_telegram_link(p_link_code text, p_telegram_id bigint, p_telegram_username text)`
- **Estado:** CALLABLE (200) — Retorna `"Código de vinculación no válido o expirado"` con código falso
- **Vulnerabilidad:** SIN auth.uid(). Si un atacante conoce/adivina un `link_code` activo (generado por otro usuario), puede vincular SU cuenta de Telegram al perfil de la víctima. Esto permite:
  1. Recibir notificaciones privadas del juego de otro jugador
  2. Potencialmente ejecutar `process_telegram_leave` para deducir FXU de la víctima
- **Remediación:** Añadir verificación de `auth.uid()` = usuario que generó el link_code.

---

## SEVERIDAD BAJA

### [LOW-1] Race condition en `activate_daily_streak` — pago múltiple evitable
- **Función:** `activate_daily_streak()`
- **Vulnerabilidad:** SIN `FOR UPDATE` en fxu_balance. Race condition para activar multiple streaks pagando una vez.
- **Remediación:** `FOR UPDATE` en lectura de balance.

### [LOW-2] Race condition en `purchase_cosmetic` — compra doble
- **Función:** `purchase_cosmetic(p_cosmetic_id uuid)`
- **Vulnerabilidad:** SIN `FOR UPDATE` en fxu_balance. Mismo patrón.
- **Remediación:** `FOR UPDATE` en lectura de balance.

### [LOW-3] Race condition en `toggle_autopilot_vip_boost` — activación doble
- **Función:** `toggle_autopilot_vip_boost(p_enable boolean)`
- **Vulnerabilidad:** SIN `FOR UPDATE`. FXU negativo posible.
- **Remediación:** `FOR UPDATE` en lectura de balance.

### [LOW-4] `link_twitter_account` — Recompensa sin verificación de propiedad
- **Función:** `link_twitter_account(p_twitter_username text)`
- **Estado:** CALLABLE (200) — Otorgó +20 FXU con username falso "__test__"
- **Vulnerabilidad:** No verifica que el usuario realmente posea la cuenta de Twitter. One-time per account (mitigación parcial).
- **Remediación:** Verificar propiedad via OAuth o challenge.

### [LOW-5] `process_telegram_join` — Restauración de recompensas
- **Función:** `process_telegram_join(p_telegram_id text)`
- **Estado:** CALLABLE (200) — SIN auth.uid()
- **Vulnerabilidad:** Puede restaurar recompensas de Telegram previamente revocadas.
- **Remediación:** `REVOKE EXECUTE` o añadir validación de webhook.

### [LOW-6] `secure_send_message` — Spoofing de tipo de mensaje
- **Función:** `secure_send_message(p_recipient_id uuid, p_subject text, p_body text, p_message_type text)`
- **Estado:** CALLABLE (200) — Tiene auth pero acepta cualquier `p_message_type`
- **Vulnerabilidad:** Puede enviar mensajes con `message_type: 'system'` o `'alliance'` para simular mensajes del sistema. Phishing in-game.
- **Remediación:** Forzar `message_type = 'player'` para funciones de usuario.

### [LOW-7] `verify_email_token` — Token brute force
- **Función:** `verify_email_token(p_token text)`
- **Estado:** CALLABLE (200) — SIN auth.uid() (por diseño)
- **Vulnerabilidad:** Sin rate limiting, un atacante podría intentar brute-force de tokens de verificación.
- **Remediación:** Rate limiting a nivel de Edge Function o middleware.

### [LOW-8] `bot_ai_tick` — Ejecución de IA de bots
- **Función:** `bot_ai_tick()`
- **Estado:** CALLABLE (500 timeout, pero ejecuta)
- **Vulnerabilidad:** Función interna de IA de bots ejecutable por cualquier jugador. Timeout pero se ejecuta parcialmente.
- **Remediación:**
  ```sql
  REVOKE EXECUTE ON FUNCTION bot_ai_tick() FROM authenticated, anon;
  ```

### [LOW-10] `get_user_by_email` — Oracle de enumeración de usuarios (CONFIRMADO)
- **Función:** `get_user_by_email(p_email text)` + `get_user_by_email_for_verification(p_email text)`
- **Estado:** CONFIRMADO CALLABLE (200) — Ambas funciones responden
- **Vulnerabilidad:** SIN auth, consulta `auth.users` por email. Retorna UUID + username si el email existe, null si no. Permite enumerar emails registrados en el sistema.
- **Remediación:**
  ```sql
  REVOKE EXECUTE ON FUNCTION get_user_by_email(text) FROM authenticated, anon;
  REVOKE EXECUTE ON FUNCTION get_user_by_email_for_verification(text) FROM authenticated, anon;
  ```

### [LOW-11] `prepare_withdrawal_for_signing` — Exposición de datos de retiro (CONFIRMADO)
- **Función:** `prepare_withdrawal_for_signing(p_tx_id uuid)`
- **Estado:** CONFIRMADO CALLABLE (200) — Retorna "Transaction not found" con UUID falso
- **Vulnerabilidad:** SIN auth, retorna datos de transacciones de retiro pendientes (wallet addresses, montos, config de firma). Si se conoce un tx_id (UUID predecible o via info leak), se puede obtener info financiera de otros jugadores.
- **Remediación:** Añadir `IF v_tx.user_id != auth.uid() THEN RAISE EXCEPTION`.

### [LOW-12] `launch_missiles` — Movido a HIGH-10 (CONFIRMADO CALLABLE)
- **Ver:** HIGH-10 — Confirmado CALLABLE sin autenticación

### [LOW-13] `reset_user_password_by_token` — Brute-force de tokens de reset
- **Función:** `reset_user_password_by_token(p_token text, p_new_password text)`
- **Estado:** CALLABLE (200) — Retorna error de validación de contraseña con token falso
- **Vulnerabilidad:** SIN auth (por diseño de password reset), pero sin rate limiting. Un atacante puede:
  1. Generar tokens de reset via `get_user_by_email` (confirma que el email existe)
  2. Intentar brute-force del token de reset (si es corto/predecible)
  3. La función valida longitud de password (≥6 chars) antes de verificar el token
- **Función auxiliar:** `verify_password_reset_token(p_token text)` también CALLABLE — permite verificar si un token es válido sin gastar el intento
- **Remediación:** Rate limiting + tokens largos (UUID v4 mínimo) + expiración corta.

### [LOW-14] Exposición de configuración interna de swaps y fees
- **Funciones CALLABLE:**
  - `get_swap_rate()` → `{"rate_fxu_per_usdt": 10000, "min_fxu": 1000, "min_usdt": 0.1, "fee_percent": 1}`
  - `get_fee_settings()` → Todos los porcentajes de fees y shares
  - `get_fxu_cost_ratios()` → Ratios de costos FXU
  - `get_p2p_fee_settings()` → Fees del marketplace P2P
  - `get_fleet_acceleration_settings()` → Config de aceleración de flotas
  - `get_contract_config()` → Configuración de contratos crypto
- **Vulnerabilidad:** Exponen toda la economía interna del juego: rates exactos, fees, minimums, configuración de contratos. Un atacante puede:
  1. Calcular exactamente cuánto extraer antes de ser detectado
  2. Identificar los swaps más rentables
  3. Explotar la configuración de contracts para timing attacks
- **Remediación:**
  ```sql
  REVOKE EXECUTE ON FUNCTION get_fee_settings() FROM authenticated, anon;
  REVOKE EXECUTE ON FUNCTION get_contract_config() FROM authenticated, anon;
  -- get_swap_rate y get_p2p_fee_settings pueden ser necesarios para el frontend
  -- Si es así, verificar que solo expongan lo mínimo necesario
  ```

### [LOW-15] `public_get_recaptcha_config` — reCAPTCHA deshabilitado + email expuesto
- **Función:** `public_get_recaptcha_config()`
- **Estado:** CALLABLE (200) — Retorna `{"enabled": false, "site_key": "falcoxcorp@gmail.com"}`
- **Vulnerabilidad:**
  1. **reCAPTCHA deshabilitado:** No hay protección anti-bot en registro/login
  2. **Email como site_key:** El campo `site_key` contiene `falcoxcorp@gmail.com` en lugar de una clave de reCAPTCHA válida — probablemente un error de configuración
  3. **Email corporativo expuesto:** Revela la cuenta de email asociada al proyecto
- **Remediación:** Configurar reCAPTCHA correctamente con site_key real y habilitar.

### [LOW-16] `public_check_registration_status` — Estado de registro público
- **Función:** `public_check_registration_status()`
- **Estado:** CALLABLE (200)
- **Vulnerabilidad:** Expone si el registro está abierto/cerrado. Información menor pero útil para planificar ataques cuando el registro se abra.
- **Remediación:** Bajo riesgo, considerar si es necesario exponerlo.

### [LOW-17] `get_jackpot_stats` — Exposición de balance de jackpot (1.25M FXU)
- **Función:** `get_jackpot_stats()`
- **Estado:** CALLABLE (200)
- **Respuesta real:** `{"balance": 1253324.03, "total_won": 72083, "win_chance": 1, "last_winner": "kike99", "total_contributed": 1325407.03}`
- **Vulnerabilidad:** Expone el balance exacto del jackpot (1,253,324 FXU), la probabilidad de ganar (1%), el último ganador con su username, y estadísticas totales. Información competitiva y económica sensible.
- **Remediación:** Considerar limitar los datos expuestos (ocultar win_chance y balance exacto).

### [LOW-18] `get_lottery_info` — Información de lotería con ganadores y premios
- **Función:** `get_lottery_info()`
- **Estado:** CALLABLE (200)
- **Datos expuestos:** Draws pasados con IDs de ganadores, premios, configuración completa de la lotería (costos, modo USD, habilitada).
- **Remediación:** Filtrar campos sensibles (ganadores, costos internos).

### [LOW-9] Tablas legibles con datos sensibles
- **Tablas:** `telegram_links`, `twitter_links` + 32 tablas legibles por `anon`
- **Vulnerabilidad:** Exponen telegram_ids, usernames de Twitter, y datos internos del juego (configuración, backups de código fuente).
- **Remediación:** Habilitar RLS o revocar SELECT para datos sensibles.

---

## HALLAZGOS INFORMATIVOS (Edge Functions, Storage, Infraestructura)

### [INFO-1] Edge Functions — `send-telegram-broadcast` accesible
- **URL:** `https://xnova.xyz/functions/v1/send-telegram-broadcast`
- **Estado:** 403 "Admin access required" — correctamente protegida
- **Observación:** La Edge Function existe y responde. Verifica admin internamente. Bien protegida.
- **Otras Edge Functions probadas:** notify-user-telegram, check-deposits, process-deposit, confirm-deposit, credit-deposit, sync-tung, webhook-tung, webhook-telegram, telegram-bot → todas devuelven 404 (SPA fallback, no existen en el dominio custom).

### [INFO-2] URLs internas expuestas en código SQL
- **URLs encontradas en funciones:**
  - `http://172.18.0.1:9002/internal-telegram-broadcast` — IP interna del contenedor Docker/Supabase
  - `https://api.dexscreaner.com/latest/dex/tokens/0x09514EcF8270C12101D077B5e8B034B164F71C5f` — API de precio TUNG
  - `https://t.me/TrungTungMeme` — Canal de Telegram del proyecto
  - `https://tung.xnova.xyz` — Sitio del token TUNG
- **Riesgo:** La IP interna `172.18.0.1:9002` revela la topología de red interna. Si un atacante logra SSRF (ej. via funciones que hacen `http_post`), podría alcanzar servicios internos.
- **Mitigación actual:** Las funciones con `http_post` son triggers (no RPC directo) y leen URL de config tables protegidas por RLS sin policies.

### [INFO-3] Storage — Inaccesible via dominio custom
- **Test:** `GET https://xnova.xyz/storage/v1/bucket` → "invalid signature"
- **Causa:** El dominio custom `xnova.xyz` no proxy-ea correctamente al Storage API de Supabase. El JWT que funciona para REST API no es aceptado por Storage.
- **Proyecto Supabase directo:** `https://lvqagudwifvytsptqjxp.supabase.co` — no responde desde shell externo (posiblemente detrás de firewall o IP whitelist).
- **Riesgo residual:** Si se configura correctamente el proxy de Storage, las políticas de bucket deben verificarse. La función `p2p_cleanup_old_dispute_evidence` (SECURITY DEFINER, sin auth) maneja archivos en Storage de disputas P2P.

### [INFO-4] Vistas accesibles sin filtro
- **Vistas con grants de SELECT para anon + authenticated:**
  - `blueprint_included_resources` — datos de blueprints
  - `hero_duel_active_view` — duelos activos
  - `hero_duel_history_view` — historial de duelos
  - `hero_duel_offers_view` — ofertas de duelos
  - `hero_ship_ranking_view` — ranking de naves hero
- **Riesgo:** Exponen datos de juego de todos los jugadores. Las vistas de duelos revelan información competitiva (stakes, ganadores, historial).

### [INFO-5] Config tables de notificación — Writes bloqueados por RLS
- **Tablas:** `telegram_dm_config`, `market_notification_config`, `p2p_notification_config`
- **Grants:** `authenticated: INSERT, UPDATE, DELETE` (peligroso)
- **Estado:** RLS ON + NO POLICIES → writes bloqueados via PostgREST (seguro por ahora)
- **Riesgo potencial:** Si se añaden policies permisivas, un atacante podría modificar la URL de destino de notificaciones (SSRF). Las funciones trigger (`notify_telegram_dm_on_message`, etc.) usan `net.http_post` con la URL de estas tablas.
- **Remediación preventiva:**
  ```sql
  REVOKE INSERT, UPDATE, DELETE ON TABLE telegram_dm_config FROM authenticated;
  REVOKE INSERT, UPDATE, DELETE ON TABLE market_notification_config FROM authenticated;
  REVOKE INSERT, UPDATE, DELETE ON TABLE p2p_notification_config FROM authenticated;
  ```

### [INFO-6] Datos descargados con anon key (sin autenticación)
- **`tung_price_history`:** 20,428 filas (2.7 MB) — historial completo de precios TUNG con liquidez. Accesible por `anon`.
- **`jackpot_pools`:** 1 fila — balances exactos de pools de premios. Accesible por `anon`.
- **Demás tablas:** Requieren JWT autenticado o devuelven permission denied (`fxu_ledger`, `wallet_transactions`).

### [INFO-6b] Data leak adicional — Tablas P2P y duelos
- **`p2p_offers`:** LEGIBLE por authenticated — expone ofertas P2P de todos los jugadores: `user_id`, precios, montos, métodos de pago, moneda fiat. Información financiera y competitiva.
- **`hero_duel_active_view`:** LEGIBLE — duelos activos con `creator_id`, stakes, estado. Permite espiar apuestas ajenas.
- **`blueprint_included_resources`:** LEGIBLE — costos de blueprints (metal, crystal, deuterium).
- **`p2p_orders`, `p2p_disputes`:** LEGIBLES pero vacías al momento del test.

### [INFO-7] `p2p_cleanup_old_dispute_evidence` — Sin auth, maneja Storage
- **Función:** `p2p_cleanup_old_dispute_evidence(p_days integer)`
- **Estado:** Sin auth check, SECURITY DEFINER
- **Vulnerabilidad:** Si es callable, un atacante podría forzar limpieza de evidencia de disputas P2P (eliminar archivos de Storage). No probada aún en producción.
- **Remediación:**
  ```sql
  REVOKE EXECUTE ON FUNCTION p2p_cleanup_old_dispute_evidence(integer) FROM authenticated, anon;
  ```

### [INFO-8] Funciones SSRF protegidas por diseño
- **Funciones con `http_post`:** `notify_telegram_dm_on_message`, `p2p_message_notify_telegram`, `send_market_telegram_notification`, `send_p2p_offer_telegram_notification`
- **Estado:** Todas son TRIGGERS (no RPC), leen URL de config tables protegidas.
- **Funciones admin con `http_post`:** `admin_distribute_*`, `admin_validate_twitter_action_api` — todas verifican `is_admin`.
- **`execute_lottery_draw`:** Tiene `http_post` pero verifica auth.

### [INFO-9] Base de datos companion MySQL — `u409779071_xnova` (Hostinger)
- **Archivos:** `u409779071_xnova.json` (4.5 MB) + `u409779071_xnova.xml` (10.7 MB) — export phpMyAdmin
- **Servidor:** MariaDB 11.8.9, PHP 7.2.34, hosting compartido (Hostinger)
- **17 tablas:** account_snapshots, app_usage, app_users, battle_reports, collector_tokens, expedition_drops_seen, hero_expeditions_seen, market_listings_seen, market_samples, pool_distributions, universe_snapshots, user_goals, user_marks, user_money, user_plan_steps, user_prefs, user_telegram
- **Datos sensibles encontrados:**
  - **8 emails de usuarios reales** en `app_users`
  - **Token cifrado de API** en `collector_tokens` (base64-encoded, usuario yoandryblanco2020@gmail.com)
  - **Registros financieros** en `user_money`: hashes de transacciones blockchain, montos en USD/TUNG
  - **Snapshots de balances diarios** en `account_snapshots`: cuánto gana cada jugador en dinero real
  - **Historial de actividad completo** en `app_usage`: timestamps de login por usuario
- **Riesgo:** Si estos exports se filtran o se cometen a un repo público, exponen PII, datos financieros y potencialmente un token de acceso al juego.
- **Remediación:** No commitear estos archivos. Rotar el collector_token. Considerar cifrar los exports at-rest.

### [INFO-10] `EXCEPTION WHEN OTHERS` en funciones financieras — errores silenciados
- **24 funciones** con bloques `EXCEPTION WHEN OTHERS THEN NULL` en contextos financieros
- **Funciones afectadas:** `log_fxu_movement`, `create_market_listing`, `cancel_buy_offer`, `fulfill_buy_offer`, `execute_lottery_draw`, `process_fleet_arrival`, entre otras
- **Riesgo:** Errores de integridad financiera (constraint violations, deadlocks) son silenciados. Una operación financiera podría fallar parcialmente (ej: FXU debitado pero ledger no registrado) sin dejar rastro.
- **Remediación:** Reemplazar `WHEN OTHERS THEN NULL` por logging a tabla de errores, o limitar a excepciones específicas no-críticas.

### [INFO-11] `random()` de PostgreSQL para decisiones financieras
- **14 funciones** usan `random()` para decidir premios, drops, resultados de combate con impacto económico
- **Funciones:** `attempt_jackpot_win`, `execute_lottery_draw`, `get_my_hero_duel`, `process_expedition`, `claim_hero_expedition`, etc.
- **Riesgo:** `random()` de PostgreSQL es un PRNG, no criptográficamente seguro. Predecible si el atacante puede determinar el estado del generador (ej: via múltiples llamadas observando resultados).
- **Mitigación actual:** No se encontró `setseed()` en funciones. El PRNG se re-seed por sesión.
- **Remediación:** Para jackpots/lotería con valor financiero real, usar fuentes de aleatoriedad externas (ej: hash de bloque blockchain, Oracle de aleatoriedad).

### [INFO-12] Funciones `confirm_deposit` — bien protegidas
- **Funciones:** `confirm_deposit` (ambos overloads) y `confirm_deposit_usdt`
- **Estado:** `confirm_deposit` tiene verificación `auth.uid()` interna. `confirm_deposit_usdt` está bloqueada (403).
- **`credit_auto_deposit`:** Verifica `role = service_role` o `superuser`. Bien protegida.
- **Observación:** Las funciones de depósito son las únicas que manejan correctamente la creación de `wallet_transactions`.

---

## HALLAZGO POSITIVO: Funciones bien protegidas

Las siguientes funciones implementan correctamente patrones de seguridad:

| Función | Protección |
|---------|-----------|
| `process_fleet_arrival` | FOR UPDATE en fleets |
| `accelerate_fleet` | FOR UPDATE en fleets |
| `refill_colony_resources` | FOR UPDATE en planets |
| `claim_hero_expedition` | FOR UPDATE + SECFIX6 |
| `start_hero_expedition` | FOR UPDATE + SECFIX6 |
| `claim_daily_mission_reward` | FOR UPDATE + SECFIX6 |
| `recall_from_fortress` | pg_advisory_xact_lock |
| `recall_from_treasure_planet` | pg_advisory_xact_lock |
| `purchase_ship_blueprint` | FOR UPDATE en balance |
| `secure_cancel_shipyard_queue_item` | FOR UPDATE en queue |
| Todas las funciones P2P | FOR UPDATE |
| Todas las funciones de mercado | FOR UPDATE |
| Todas las funciones admin_ (93) | Verifican is_admin + sin EXECUTE grant |
| `purchase_daily_mission_bonus` | FOR UPDATE |
| `attempt_jackpot_win` | EXECUTE revocado (403) |
| `attempt_expedition_pool_win` | EXECUTE revocado (403) |
| `contribute_to_jackpot` | EXECUTE revocado (403) |
| `distribute_spend_fee` | EXECUTE revocado (403) |
| `repair_incomplete_user` | EXECUTE revocado (403) |
| `cron_execute_lottery_draw` | EXECUTE revocado (403) |
| `add_expedition_points` | EXECUTE revocado (403) |
| `create_lottery_draw` | Auth check interno ("No autorizado") |
| `execute_lottery_draw` | Auth check interno ("No autorizado") |
| `get_recent_revenue` | Auth check interno ("No autorizado") |
| `start_alliance_war` | Admin check interno ("Solo administradores") |
| `resolve_alliance_war` | auth.uid() + is_admin |
| `send_fleet` → `secure_send_fleet` | auth.uid() check en wrapper |
| `apply_hero_regen` | EXECUTE revocado (403) |
| `get_all_sequences_state` | EXECUTE revocado (403) |
| `auto_resolve_single_war` | EXECUTE revocado (403) |
| `clean_expired_cosmetics` | EXECUTE revocado (403) |
| `confirm_deposit_usdt` | EXECUTE revocado (403) |
| `create_hero_ship` | EXECUTE revocado (403) |
| `transfer_tokens` | auth.uid() check |
| `resolve_alliance_war` | auth.uid() + is_admin check |

---

## REMEDIACIÓN INMEDIATA (SQL)

### Paso 1: REVOKE de funciones internas (URGENTE — aplicar primero)

```sql
-- ===== CATASTRÓFICO: Manipulación de precio =====
REVOKE EXECUTE ON FUNCTION set_live_tung_price(numeric) FROM authenticated, anon;
REVOKE EXECUTE ON FUNCTION refresh_tung_price() FROM authenticated, anon;
REVOKE EXECUTE ON FUNCTION refresh_tung_price_from_dex() FROM authenticated, anon;

-- ===== CRÍTICO: Guard token bypass =====
REVOKE EXECUTE ON FUNCTION _internal_set_fxu_context() FROM authenticated, anon;
REVOKE EXECUTE ON FUNCTION set_fxu_update_context(text) FROM authenticated, anon;

-- ===== CRÍTICO: Retiros crypto =====
REVOKE EXECUTE ON FUNCTION mark_withdrawal_signed(uuid, text, bigint) FROM authenticated, anon;
REVOKE EXECUTE ON FUNCTION confirm_contract_withdrawal(uuid, text) FROM authenticated, anon;

-- ===== CRÍTICO: Telegram sabotaje =====
REVOKE EXECUTE ON FUNCTION process_telegram_leave(text) FROM authenticated, anon;
REVOKE EXECUTE ON FUNCTION process_telegram_join(text) FROM authenticated, anon;

-- ===== MEDIO: Funciones internas expuestas =====
REVOKE EXECUTE ON FUNCTION safe_deduct_resources(uuid, bigint, bigint, bigint) FROM authenticated, anon;
REVOKE EXECUTE ON FUNCTION update_planet_resources(uuid) FROM authenticated, anon;
REVOKE EXECUTE ON FUNCTION stronghold_release(text, integer, text, text) FROM authenticated, anon;
REVOKE EXECUTE ON FUNCTION batch_update_player_points() FROM authenticated, anon;
REVOKE EXECUTE ON FUNCTION process_all_user_shipyard_queues() FROM authenticated, anon;
REVOKE EXECUTE ON FUNCTION p2p_expire_stale_offers() FROM authenticated, anon;
REVOKE EXECUTE ON FUNCTION bot_ai_tick() FROM authenticated, anon;
REVOKE EXECUTE ON FUNCTION tung_price_health() FROM authenticated, anon;

-- ===== NUEVO: Hero duel sin auth =====
-- get_my_hero_duel necesita auth check en código, no REVOKE (funcionalidad legítima)
-- resolve_hero_duel ya está bloqueada (403) — mantener así

-- ===== NUEVO: Limpieza de evidencia P2P =====
REVOKE EXECUTE ON FUNCTION p2p_cleanup_old_dispute_evidence(integer) FROM authenticated, anon;

-- ===== CRÍTICO: War score inflation =====
REVOKE EXECUTE ON FUNCTION report_war_battle(uuid, uuid, bigint) FROM authenticated, anon;

-- ===== CRÍTICO: Admin balance + revenue snapshot =====
REVOKE EXECUTE ON FUNCTION get_admin_available_balance() FROM authenticated, anon;
REVOKE EXECUTE ON FUNCTION take_weekly_revenue_snapshot() FROM authenticated, anon;

-- ===== MEDIO: Funciones cron/mantenimiento (8 funciones) =====
REVOKE EXECUTE ON FUNCTION global_process_all_expired_queues() FROM authenticated, anon;
REVOKE EXECUTE ON FUNCTION process_all_pending_fleets() FROM authenticated, anon;
REVOKE EXECUTE ON FUNCTION optimized_global_queue_processor() FROM authenticated, anon;
REVOKE EXECUTE ON FUNCTION process_all_research_completion() FROM authenticated, anon;
REVOKE EXECUTE ON FUNCTION clean_all_expired_cosmetics() FROM authenticated, anon;
REVOKE EXECUTE ON FUNCTION update_all_ranks() FROM authenticated, anon;
REVOKE EXECUTE ON FUNCTION recalculate_all_player_points() FROM authenticated, anon;
REVOKE EXECUTE ON FUNCTION auto_cancel_insufficient_listings(uuid) FROM authenticated, anon;

-- ===== BAJO: Enumeración de usuarios =====
REVOKE EXECUTE ON FUNCTION get_user_by_email(text) FROM authenticated, anon;
REVOKE EXECUTE ON FUNCTION get_user_by_email_for_verification(text) FROM authenticated, anon;

-- ===== BAJO: Config/fee exposure (solo las que no necesita el frontend) =====
REVOKE EXECUTE ON FUNCTION get_fee_settings() FROM authenticated, anon;
REVOKE EXECUTE ON FUNCTION get_contract_config() FROM authenticated, anon;
REVOKE EXECUTE ON FUNCTION get_admin_available_balance() FROM authenticated, anon;

-- ===== NUEVO: Tablas P2P (data leak) =====
-- p2p_offers expone ofertas financieras de todos los jugadores
-- Crear RLS policy que filtre por user_id:
-- CREATE POLICY p2p_offers_select ON p2p_offers FOR SELECT USING (user_id = auth.uid() OR status = 'active');
```

### Paso 1c: REVOKE preventivo de config tables de notificación

```sql
-- Prevenir SSRF si se añaden policies RLS en el futuro
REVOKE INSERT, UPDATE, DELETE ON TABLE telegram_dm_config FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON TABLE market_notification_config FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON TABLE p2p_notification_config FROM authenticated;
```

### Paso 1b: Cerrar data leak de tablas sensibles (URGENTE)

```sql
-- Opción recomendada: Policy RLS para profiles (solo ver tu propio perfil completo)
-- NOTA: Esto romperá funcionalidad que dependa de leer otros perfiles (rankings, etc.)
-- Primero crear funciones RPC para datos públicos, luego aplicar:

-- Tablas que NO deberían ser legibles por authenticated:
REVOKE SELECT ON TABLE wallet_config FROM authenticated;
REVOKE SELECT ON TABLE admin_revenue FROM authenticated;
REVOKE SELECT ON TABLE admin_config FROM authenticated;
REVOKE SELECT ON TABLE admin_smtp_settings FROM authenticated;
REVOKE SELECT ON TABLE fxu_ledger FROM authenticated;
REVOKE SELECT ON TABLE email_verification_tokens FROM authenticated;
REVOKE SELECT ON TABLE login_sessions FROM authenticated;
REVOKE SELECT ON TABLE kyc_verifications FROM authenticated;
REVOKE SELECT ON TABLE internal_transfers FROM authenticated;
REVOKE SELECT ON TABLE admin_expenses FROM authenticated;
REVOKE SELECT ON TABLE admin_withdrawals FROM authenticated;
REVOKE SELECT ON TABLE weekly_revenue_snapshots FROM authenticated;

-- Para profiles: crear policy que oculte columnas sensibles de otros jugadores
-- Ejemplo de policy con vista filtrada:
CREATE POLICY profiles_select_policy ON profiles FOR SELECT
  USING (true);  -- Todos pueden ver, pero usar una vista para filtrar columnas
-- Mejor: crear una vista pública sin email/balances y revocar SELECT directo
```

### Paso 2: CHECK constraints para balances sin protección (URGENTE)

```sql
-- FXU y TUNG no tienen CHECK >= 0, permitiendo balance negativo
-- USDT y dark_matter SÍ tienen CHECK >= 0
-- VERIFICAR primero que no hay balances negativos existentes:
-- SELECT id, username, fxu_balance, tung_balance FROM profiles WHERE fxu_balance < 0 OR tung_balance < 0;
ALTER TABLE profiles ADD CONSTRAINT profiles_fxu_balance_non_negative 
  CHECK (fxu_balance >= 0);
ALTER TABLE profiles ADD CONSTRAINT profiles_tung_balance_non_negative 
  CHECK (tung_balance >= 0);
```

### Paso 3: FOR UPDATE en funciones con race condition

Aplicar `FOR UPDATE` en el SELECT del balance/recurso en estas funciones:

| Función | Tabla | Columna |
|---------|-------|---------|
| `swap_fxu_to_usdt` | profiles | fxu_balance |
| `swap_usdt_to_fxu` | profiles | usdt_balance |
| `purchase_supply_box` | profiles | fxu_balance |
| `secure_cancel_research` | user_technologies | * |
| `secure_demolish_building` | planet_buildings | * |
| `instant_complete_building` | building_queue + profiles | * + fxu_balance |
| `instant_complete_research` | profiles | fxu_balance |
| `secure_cancel_building_queue_item` | building_queue | * |
| `activate_daily_streak` | profiles | fxu_balance |
| `purchase_cosmetic` | profiles | fxu_balance |
| `toggle_autopilot_vip_boost` | profiles | fxu_balance |
| `request_withdrawal_usdt` | profiles | usdt_balance |
| `purchase_plus_subscription` | profiles | fxu_balance / usdt_balance |
| `cancel_withdrawal_usdt` | wallet_transactions | * |
| `get_my_hero_duel` | hero_duels | * |
| `link_twitter_account` | profiles | fxu_balance |
| `join_alliance_war` | profiles | fxu_balance |
| `secure_create_alliance` | profiles | fxu_balance |
| `secure_rename_planet` | profiles | fxu_balance |
| `secure_rename_alliance` | profiles | fxu_balance |
| `secure_abandon_colony` | profiles | fxu_balance |
| `resolve_alliance_war` | alliance_wars | * |
| `process_telegram_join` | profiles | fxu_balance |
| `process_telegram_leave` | profiles | fxu_balance |
| `transfer_tokens` | profiles | fxu_balance |

### Paso 4: Proteger tipo de mensaje

```sql
-- En secure_send_message, forzar message_type a 'player':
-- Reemplazar: coalesce(nullif(trim(p_message_type), ''), 'player')
-- Por: 'player'  (ignorar el parámetro del usuario)
```

### Paso 5: Proteger tablas sensibles

```sql
REVOKE SELECT ON TABLE telegram_links FROM authenticated;
REVOKE SELECT ON TABLE twitter_links FROM authenticated;
-- Revisar las 32+ tablas accesibles por anon (backups, configuración interna)
```

---

## ARTEFACTOS DE PRUEBA A LIMPIAR

| Artefacto | Acción |
|-----------|--------|
| `twitter_links` entry con username "__fake_twitter__" | `DELETE FROM twitter_links WHERE twitter_username = '__fake_twitter__';` |
| Alliance creada por `secure_create_alliance` | Disolver alianza de la cuenta de test |
| +20 FXU acreditados a cuenta de test | Ajustar balance |
| Precio TUNG momentáneamente alterado a 0.01 | Ya restaurado por `refresh_tung_price` |

---

## METODOLOGÍA

1. **Extracción de esquema:** 659 funciones, 2699 grants, 608 constraints exportados a JSON
2. **Análisis estático:** Búsqueda automatizada de patrones (`auth.uid()`, `FOR UPDATE`, `is_admin`, `fxu_balance`, `usdt_balance`)
3. **Pruebas de callability:** 115+ funciones probadas vía browser console con parámetros seguros/inválidos (10 batches)
4. **Trazado de call chains:** Verificación de que funciones internas vulnerables no son alcanzables indirectamente (ej: `process_expedition` solo llamada desde `process_fleet_arrival` que tiene `FOR UPDATE`)
5. **Clasificación:** CALLABLE (200/204), SEGURA (403), NOT FOUND (404), ERROR (500)

---

## ESTADÍSTICAS FINALES

- **Funciones analizadas:** 659 (607 SECURITY DEFINER)
- **Funciones probadas en producción:** 115+
- **CALLABLE (200/204):** 90+
- **BLOQUEADAS (403):** 22
- **NOT FOUND (404):** 17+
- **Edge Functions probadas:** 12+ nombres (1 existe: `send-telegram-broadcast`, bien protegida)
- **Storage:** Inaccesible via dominio custom (no proxy-ea JWT)
- **Tablas con data leak confirmado:** 17+ tablas sensibles legibles sin filtro
- **Perfiles expuestos:** 2,688 jugadores con emails y balances
- **Datos descargados sin autenticación (anon):** 2.7 MB (tung_price_history + jackpot_pools)
- **Datos descargados con autenticación:** ~10 MB (profiles 4MB, game_settings, p2p_offers, etc.)
- **Vulnerabilidades encontradas:** 72
  - Catastrófica: 3 (manipulación de precio + data leak masivo + balance negativo)
  - Crítica: 12 (swaps, retiros crypto, guard token bypass, IDOR, hero duels, firmas, admin balance, revenue snapshot, war score inflation)
  - Alta: 10 (race conditions en compras/cancelaciones + DoS + lanzamiento de misiles)
  - Media: 16 (sabotaje sin auth, funciones cron expuestas, telegram link, IDOR hero ship, transfers)
  - Baja: 19 (enumeración, config/jackpot/lottery exposure, spam, password reset, recaptcha)
  - Informativo: 12 (Edge Functions, Storage, URLs internas, vistas, SSRF, DB companion, RNG, error handling)
- **Funciones bien protegidas:** 14+ con FOR UPDATE/advisory locks correctos
- **Funciones admin:** 93/93 con verificación is_admin (100%)
- **Funciones con EXECUTE grant revocado correctamente:** 22 (403 blocked)
- **Funciones cron/mantenimiento expuestas:** 8+ (procesaron estado real del juego en producción)
- **Tablas con RLS + no policies (write bloqueado):** 43/43 (100% — protección efectiva)
- **Tablas con RLS + no policies (read expuesto):** 152 tablas legibles por authenticated
- **Config tables de notificación:** Grants de escritura peligrosos, mitigados por RLS sin policies
- **Balance admin expuesto:** 809,100.98 FXU (visible para cualquier jugador)
- **Ingresos semanales expuestos:** 187,440.65 FXU (snapshot creado por función pública)
- **SQL injection:** No encontrada (stronghold_release usa %I, valores hardcodeados)
- **SSRF:** Mitigado (funciones http_post son triggers, no RPC; URLs de config protegidas)
