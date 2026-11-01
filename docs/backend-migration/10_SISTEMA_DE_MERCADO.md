# Sistema de Mercado - Documentacion de Migracion Backend

## Descripcion General

El sistema de mercado permite a los jugadores intercambiar recursos y naves por FXU (la moneda del juego). Los vendedores listan items a precios que ellos determinan, y los compradores pueden adquirirlos pagando en FXU. El sistema cobra una comision que va parcialmente al administrador y parcialmente al jackpot.

---

## Tipos de Listados

### Recursos

| Tipo | Descripcion |
|------|-------------|
| metal | Vender metal por FXU |
| crystal | Vender cristal por FXU |
| deuterium | Vender deuterio por FXU |

### Naves

Cualquier tipo de nave puede listarse en el mercado:
- Cargueros (pequeno, grande)
- Naves de combate
- Naves especiales

**Restriccion:** Las defensas NO pueden venderse en el mercado.

---

## Estructura de un Listado

| Campo | Tipo | Descripcion |
|-------|------|-------------|
| id | UUID | ID unico |
| seller_id | UUID | Vendedor |
| seller_planet_id | UUID | Planeta de origen |
| listing_type | TEXT | 'resource' o 'ship' |
| item_type | TEXT | Tipo especifico (metal, cruiser, etc.) |
| quantity | NUMERIC | Cantidad |
| price_fxu | NUMERIC | Precio total en FXU |
| status | TEXT | 'active', 'sold', 'cancelled' |
| created_at | TIMESTAMP | Fecha de creacion |
| sold_at | TIMESTAMP | Fecha de venta (si aplica) |
| buyer_id | UUID | Comprador (si vendido) |

---

## Proceso de Crear Listado

### Funcion: create_market_listing

**Paso 1: Validaciones**
```
1. Verificar usuario autenticado
2. Verificar usuario no en modo vacaciones
3. Verificar usuario tiene Telegram vinculado (si requerido)
4. Verificar planeta pertenece al usuario
5. Verificar cantidad > 0
6. Verificar precio > 0
```

**Paso 2: Verificar Disponibilidad**
```
Si listing_type == 'resource':
    Sincronizar recursos del planeta
    Si cantidad > recursos_disponibles:
        ERROR: "Recursos insuficientes"

Si listing_type == 'ship':
    Si cantidad > naves_en_planeta:
        ERROR: "Naves insuficientes"
```

**Paso 3: Descontar Items**

**IMPORTANTE:** Los recursos/naves NO se descuentan al crear el listado. Permanecen en el planeta hasta que se vende.

### Verificacion al Momento de Venta

Al comprar, se verifica que el vendedor aun tiene los items:
```
Si recursos_actuales < cantidad_listada:
    Cancelar listado automaticamente
    ERROR: "El vendedor ya no tiene los recursos"
```

---

## Proceso de Compra

### Funcion: buy_market_listing

**Paso 1: Validaciones**
```
1. Verificar listado existe y esta activo
2. Verificar comprador != vendedor
3. Verificar comprador tiene Telegram vinculado (si requerido)
4. Verificar comprador tiene FXU suficiente
5. Verificar vendedor aun tiene los items
```

**Paso 2: Calcular Distribucion**
```
precio_total = listing.price_fxu
comision_porcentaje = obtener_de_configuracion() // default 10%
comision = precio_total * comision_porcentaje

pago_vendedor = precio_total - comision
comision_admin = comision * 0.51  // 51% de la comision
comision_jackpot = comision * 0.49 // 49% al jackpot
```

**Paso 3: Transferir FXU**
```sql
-- Descontar FXU del comprador
UPDATE profiles
SET fxu_balance = fxu_balance - precio_total
WHERE id = comprador_id;

-- Pagar al vendedor (menos comision)
UPDATE profiles
SET fxu_balance = fxu_balance + pago_vendedor
WHERE id = vendedor_id;

-- Registrar comision admin
INSERT INTO admin_revenue (type, amount, ...)
VALUES ('market_fee', comision_admin, ...);

-- Contribuir al jackpot
UPDATE jackpot_pools
SET balance = balance + comision_jackpot
WHERE pool_type = 'market';
```

**Paso 4: Transferir Items**

```
Si listing_type == 'resource':
    -- Descontar del vendedor
    UPDATE planet_resources
    SET {item_type} = {item_type} - cantidad
    WHERE planet_id = seller_planet_id;

    -- Agregar al comprador (planeta activo)
    UPDATE planet_resources
    SET {item_type} = {item_type} + cantidad
    WHERE planet_id = buyer_planet_id;

Si listing_type == 'ship':
    -- Descontar del vendedor
    UPDATE planet_ships
    SET quantity = quantity - cantidad
    WHERE planet_id = seller_planet_id
      AND ship_type_id = item_type;

    -- Agregar al comprador
    UPDATE planet_ships
    SET quantity = quantity + cantidad
    WHERE planet_id = buyer_planet_id
      AND ship_type_id = item_type;
```

**Paso 5: Finalizar**
```sql
UPDATE market_listings
SET
  status = 'sold',
  sold_at = now(),
  buyer_id = comprador_id
WHERE id = listing_id;
```

---

## Cancelacion de Listado

### Funcion: cancel_market_listing

**Validaciones:**
```
1. Verificar listado pertenece al usuario
2. Verificar listado esta activo
```

**Proceso:**
```sql
-- No hay devolucion porque los items nunca salieron del planeta

UPDATE market_listings
SET status = 'cancelled'
WHERE id = listing_id AND seller_id = auth.uid();
```

---

## Auto-Cancelacion de Listados

### Mecanica

Los listados se cancelan automaticamente si el vendedor ya no tiene los items:

```
Para cada listado activo:
    Si recursos_vendedor < cantidad_listada:
        Cancelar listado
        Notificar al vendedor
```

### Trigger

Esta verificacion se ejecuta:
1. Cuando el comprador intenta comprar
2. Periodicamente via cron job
3. Cuando el vendedor gasta recursos

---

## Comisiones del Mercado

### Estructura de Comision

```
comision_total = precio * porcentaje_comision
├── admin (51%)
└── jackpot (49%)
```

### Configuracion

| Parametro | Valor Default | Descripcion |
|-----------|---------------|-------------|
| market_fee_percent | 10% | Comision total |
| admin_share | 51% | Porcion para admin |
| jackpot_share | 49% | Porcion para jackpot |

---

## Notificaciones de Mercado

### Al Crear Listado

```json
{
  "type": "market_listing_created",
  "listing_id": "uuid",
  "item_type": "metal",
  "quantity": 500000,
  "price": 100
}
```

### Al Vender

**Vendedor:**
```json
{
  "type": "market_sale",
  "listing_id": "uuid",
  "item_type": "metal",
  "quantity": 500000,
  "price_received": 90,
  "buyer": "CompradorX"
}
```

**Comprador:**
```json
{
  "type": "market_purchase",
  "listing_id": "uuid",
  "item_type": "metal",
  "quantity": 500000,
  "price_paid": 100
}
```

### Notificacion Telegram

Si esta configurado, se envia notificacion a grupos de Telegram:

```
Nuevo en el Mercado!
Vendedor: JugadorX
Item: 500,000 Metal
Precio: 100 FXU
```

---

## Requisito de Telegram

### Configuracion

El admin puede requerir que los usuarios tengan Telegram vinculado para usar el mercado:

```
Si require_telegram_for_market == true:
    Si usuario.telegram_id == null:
        ERROR: "Debes vincular tu cuenta de Telegram para usar el mercado"
```

### Justificacion

- Reduce multicuentas
- Facilita comunicacion
- Mejora verificacion de usuarios

---

## Tabla: market_listings

| Campo | Tipo | Descripcion |
|-------|------|-------------|
| id | UUID | ID unico |
| seller_id | UUID | Vendedor |
| seller_planet_id | UUID | Planeta origen |
| listing_type | TEXT | 'resource' o 'ship' |
| item_type | TEXT | Tipo especifico |
| quantity | NUMERIC | Cantidad |
| price_fxu | NUMERIC | Precio en FXU |
| status | TEXT | Estado del listado |
| created_at | TIMESTAMP | Creacion |
| sold_at | TIMESTAMP | Venta |
| buyer_id | UUID | Comprador |
| buyer_planet_id | UUID | Planeta destino |

---

## Funcion RPC: get_market_listings

### Parametros

| Parametro | Tipo | Descripcion |
|-----------|------|-------------|
| p_listing_type | TEXT | Filtrar por tipo (opcional) |
| p_item_type | TEXT | Filtrar por item (opcional) |
| p_limit | INTEGER | Limite de resultados |
| p_offset | INTEGER | Offset para paginacion |

### Retorno

```json
[
  {
    "id": "uuid",
    "seller_name": "JugadorX",
    "listing_type": "resource",
    "item_type": "metal",
    "quantity": 500000,
    "price_fxu": 100,
    "price_per_unit": 0.0002,
    "created_at": "2024-01-01T10:00:00Z"
  }
]
```

---

## Consideraciones de Seguridad

### RLS para market_listings

```sql
-- Todos pueden ver listados activos
CREATE POLICY "Anyone can view active listings"
  ON market_listings FOR SELECT
  TO authenticated
  USING (status = 'active');

-- Solo el vendedor puede ver sus listados cancelados/vendidos
CREATE POLICY "Sellers can view own listings"
  ON market_listings FOR SELECT
  TO authenticated
  USING (seller_id = auth.uid());

-- Solo el vendedor puede cancelar
CREATE POLICY "Sellers can cancel own listings"
  ON market_listings FOR UPDATE
  TO authenticated
  USING (seller_id = auth.uid())
  WITH CHECK (seller_id = auth.uid());
```

### Validaciones Criticas

1. **Verificar disponibilidad al comprar** no al listar
2. **Usar transacciones** para atomicidad
3. **Bloquear recursos durante compra** con FOR UPDATE
4. **Validar precios positivos** siempre
5. **Verificar Telegram** si esta configurado
6. **Registrar todas las transacciones** para auditoria
