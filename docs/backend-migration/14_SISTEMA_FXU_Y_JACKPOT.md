# Sistema FXU y Jackpot - Documentacion de Migracion Backend

## Descripcion General

FXU es la moneda premium del juego que permite a los jugadores acelerar construcciones, completar investigaciones instantaneamente, comprar en el mercado y mas. El sistema de Jackpot recolecta un porcentaje de las transacciones FXU y lo distribuye a jugadores afortunados.

---

## Obtencion de FXU

### Metodos de Obtencion

| Metodo | Descripcion |
|--------|-------------|
| Deposito | Depositar tokens reales |
| Mercado | Vender recursos/naves |
| Referidos | Comision por referir jugadores |
| Jackpot | Ganar el pool acumulado |
| Tareas | Completar tareas de Telegram |
| Swap USDT | Intercambiar USDT por FXU |

---

## Usos de FXU

### Completar Instantaneamente

| Uso | Descripcion | Ratio Default |
|-----|-------------|---------------|
| Edificios | Completar construccion | 5000 FXU / 5000 recursos |
| Investigacion | Completar investigacion | 3000 FXU / 3000 recursos |
| Astillero | Completar naves/defensas | 8000 FXU / 8000 recursos |
| Acelerar Flota | Reducir tiempo de vuelo | X FXU / minuto |

### Compras

| Uso | Descripcion |
|-----|-------------|
| Mercado | Comprar listados de otros jugadores |
| Oficiales | Comprar oficiales premium |
| Supply Boxes | Comprar cajas de recursos |
| Plus | Suscripcion mensual |

---

## Calculo de Costo FXU para Completar

### Formula Base

```
costo_recursos = metal + cristal + deuterio
costo_fxu = (costo_recursos / ratio) * factor_tiempo
```

### Factor de Tiempo Restante

```
tiempo_restante = end_time - now()
tiempo_total = end_time - start_time
factor_tiempo = tiempo_restante / tiempo_total
```

**Ejemplo:**
Si quedan 30 minutos de 60 minutos totales:
```
factor_tiempo = 30 / 60 = 0.5
costo_fxu = costo_base * 0.5
```

### Ratios Configurables

| Tipo | Ratio Default | Descripcion |
|------|---------------|-------------|
| building_ratio | 5000 | FXU por cada 5000 recursos |
| research_ratio | 3000 | FXU por cada 3000 recursos |
| ships_ratio | 8000 | FXU por cada 8000 recursos |
| defense_ratio | 10000 | FXU por cada 10000 recursos |

---

## Sistema de Jackpot

### Pools de Jackpot

| Pool | Fuente de Contribucion |
|------|------------------------|
| market | Comision del mercado (49%) |
| expedition | Tarifas de expedicion |
| fleet_acceleration | Aceleracion de flotas (49%) |
| monthly | Pool mensual Plus |

### Contribucion al Jackpot

Cada transaccion FXU contribuye un porcentaje:

```
contribucion_jackpot = transaccion * porcentaje_jackpot
```

**Porcentaje default:** 49% de las comisiones

### Ganar el Jackpot

**Probabilidad base:** 0.1% por transaccion elegible

```
Si random() < 0.001:
    jugador gana el pool
    pool se reinicia a 0
    notificar al jugador
    broadcast a todos los jugadores
```

### Distribucion del Jackpot

```
Para cada tipo de transaccion:
    Si ganador:
        monto_ganado = pool_balance
        pool_balance = 0
        UPDATE profiles SET fxu_balance = fxu_balance + monto_ganado
        INSERT INTO jackpot_winners (user_id, pool_type, amount)
```

---

## Funciones de FXU

### instant_complete_building

```
1. Obtener item de cola de construccion
2. Calcular tiempo restante
3. Calcular costo FXU = (recursos / ratio) * factor_tiempo
4. Verificar balance FXU
5. Descontar FXU
6. Contribuir al jackpot
7. Verificar si gana jackpot
8. Completar edificio inmediatamente
9. Actualizar puntos
10. Registrar transaccion
```

### instant_complete_research

```
1. Obtener investigacion activa
2. Calcular tiempo restante
3. Calcular costo FXU
4. Verificar balance FXU
5. Descontar FXU
6. Contribuir al jackpot
7. Completar investigacion
8. Actualizar puntos
```

### instant_complete_shipyard_item

```
1. Obtener item de cola de astillero
2. Calcular unidades restantes
3. Calcular costo FXU por unidades restantes
4. Verificar balance FXU
5. Descontar FXU
6. Contribuir al jackpot
7. Completar todas las unidades
8. Actualizar puntos
```

### accelerate_fleet

```
1. Obtener flota en vuelo
2. Calcular tiempo restante en minutos
3. Calcular costo FXU = minutos * fxu_por_minuto
4. Verificar balance FXU
5. Descontar FXU
6. Contribuir al jackpot (49%)
7. Procesar llegada inmediatamente
8. Registrar transaccion
```

---

## Sistema de Depositos

### Proceso de Deposito

**Paso 1: Usuario solicita deposito**
```
1. Obtener direccion de deposito del sistema
2. Mostrar al usuario la direccion
3. Usuario envia tokens a la direccion
```

**Paso 2: Verificacion (Edge Function)**
```
1. Monitorear transacciones en blockchain
2. Verificar transaccion entrante
3. Validar monto y direccion
4. Acreditar FXU al usuario
5. Registrar transaccion
```

### Funcion: verify_deposit

```
1. Obtener transaccion de blockchain
2. Verificar confirmaciones >= minimo (6)
3. Verificar monto
4. Verificar no procesada previamente
5. Acreditar FXU al usuario
6. Registrar en wallet_transactions
```

---

## Sistema de Retiros

### Proceso de Retiro

**Paso 1: Usuario solicita retiro**
```
1. Verificar balance FXU suficiente
2. Verificar Telegram vinculado (si requerido)
3. Verificar monto minimo
4. Crear solicitud de retiro
```

**Paso 2: Procesamiento (Manual o Automatico)**
```
1. Admin revisa solicitud
2. Ejecuta transferencia en blockchain
3. Marca solicitud como completada
4. Notifica al usuario
```

### Funcion: request_withdrawal

```
1. Verificar balance suficiente
2. Verificar condiciones (Telegram, monto minimo)
3. Descontar FXU del balance
4. Crear registro en withdrawals con status 'pending'
5. Notificar a admins
```

---

## Swap FXU/USDT

### Proceso de Swap

```
1. Obtener tasa de cambio actual
2. Calcular monto a recibir
3. Calcular comision de swap
4. Verificar balance suficiente
5. Ejecutar swap
6. Registrar transaccion
```

### Comision de Swap

```
comision_porcentaje = obtener_de_configuracion() // default 2%
comision = monto * comision_porcentaje
monto_neto = monto - comision
```

### Formulas

**FXU a USDT:**
```
usdt_recibido = (fxu_enviado * precio_fxu) * (1 - comision_porcentaje)
```

**USDT a FXU:**
```
fxu_recibido = (usdt_enviado / precio_fxu) * (1 - comision_porcentaje)
```

---

## Sistema Plus (Suscripcion)

### Beneficios Plus

- Acceso a pool mensual de FXU
- Insignia especial
- Prioridad en soporte

### Distribucion del Pool Mensual

```
Al inicio de cada mes:
    usuarios_plus = obtener usuarios con Plus activo
    monto_por_usuario = pool_mensual / cantidad_usuarios_plus

    Para cada usuario_plus:
        acreditar monto_por_usuario FXU
        notificar al usuario
```

---

## Tablas Relacionadas

### profiles (campos FXU)

| Campo | Tipo | Descripcion |
|-------|------|-------------|
| fxu_balance | NUMERIC | Balance actual de FXU |
| usdt_balance | NUMERIC | Balance actual de USDT |
| total_deposited | NUMERIC | Total depositado historico |
| total_withdrawn | NUMERIC | Total retirado historico |

### wallet_transactions

| Campo | Tipo | Descripcion |
|-------|------|-------------|
| id | UUID | ID unico |
| user_id | UUID | Usuario |
| type | TEXT | 'deposit', 'withdrawal', 'swap', etc. |
| amount | NUMERIC | Monto |
| currency | TEXT | 'FXU' o 'USDT' |
| status | TEXT | Estado |
| tx_hash | TEXT | Hash de transaccion blockchain |
| created_at | TIMESTAMP | Timestamp |

### jackpot_pools

| Campo | Tipo | Descripcion |
|-------|------|-------------|
| pool_type | TEXT | Tipo de pool |
| balance | NUMERIC | Balance actual |
| total_contributed | NUMERIC | Total contribuido historico |
| total_won | NUMERIC | Total ganado historico |
| updated_at | TIMESTAMP | Ultima actualizacion |

### jackpot_winners

| Campo | Tipo | Descripcion |
|-------|------|-------------|
| id | UUID | ID unico |
| user_id | UUID | Ganador |
| pool_type | TEXT | Tipo de pool |
| amount | NUMERIC | Monto ganado |
| won_at | TIMESTAMP | Fecha de victoria |

---

## Admin Revenue Tracking

### Tipos de Ingreso

| Tipo | Descripcion |
|------|-------------|
| market_fee | Comision del mercado |
| instant_building | Completar edificios |
| instant_research | Completar investigaciones |
| instant_shipyard | Completar astillero |
| fleet_acceleration | Aceleracion de flotas |
| officer_fxu | Compra de oficiales |
| supply_box | Compra de cajas |
| swap_fee | Comision de swap |
| expedition_fee | Tarifa de expedicion |

### Tabla: admin_revenue

| Campo | Tipo | Descripcion |
|-------|------|-------------|
| id | UUID | ID unico |
| type | TEXT | Tipo de ingreso |
| amount | NUMERIC | Monto en FXU |
| user_id | UUID | Usuario origen |
| details | JSONB | Detalles adicionales |
| created_at | TIMESTAMP | Timestamp |

---

## Proteccion de Balance FXU

### Trigger de Proteccion

```sql
CREATE TRIGGER protect_fxu_balance
BEFORE UPDATE ON profiles
FOR EACH ROW
WHEN (NEW.fxu_balance < 0)
EXECUTE FUNCTION prevent_negative_fxu();
```

### Funcion de Proteccion

```sql
CREATE FUNCTION prevent_negative_fxu()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.fxu_balance < 0 THEN
    RAISE EXCEPTION 'FXU balance cannot be negative';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
```

---

## Consideraciones de Seguridad

### Validaciones Criticas

1. **Nunca confiar en balances del cliente**
2. **Usar transacciones atomicas** para todas las operaciones FXU
3. **Verificar balance antes Y despues** de operaciones
4. **Registrar todas las transacciones** para auditoria
5. **Trigger de proteccion** contra balances negativos
6. **Rate limiting** para operaciones sensibles

### Deteccion de Fraude

```
Si patron_sospechoso:
    - Multiples depositos pequenos
    - Retiros inmediatos despues de deposito
    - Patrones de lavado
    Marcar para revision manual
```

### RLS

```sql
CREATE POLICY "Users can view own FXU transactions"
  ON wallet_transactions FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can view jackpot pools"
  ON jackpot_pools FOR SELECT
  TO authenticated
  USING (true);
```
